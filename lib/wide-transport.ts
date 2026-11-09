import { directIceConfiguration } from "@/lib/wide-ice"
import { WIDE_CHUNK_BYTES, validOffset, type WideFile } from "@/lib/mode-limits"
import {
  chainPrefix,
  EMPTY_CHAIN,
  nextChain,
  sha256,
} from "@/lib/wide-integrity"
export type Checkpoint = {
  offset: number
  chain: string
  verified?: boolean
}
export type WideProgress = Record<string, Checkpoint>
type Control = {
  id?: number
  reply?: number
  action?: string
  index?: number
  offset?: number
  hash?: string
  chain?: string
  value?: Checkpoint
  error?: string
}
type Hooks = {
  progress: (value: WideProgress, sent: number) => void
  status: (text: string) => void
  complete: () => void
  error: (message: string) => void
}
class LocalStore {
  worker: Worker
  sequence = 0
  pending = new Map<
    number,
    { resolve: (v: Checkpoint) => void; reject: (e: Error) => void }
  >()
  constructor() {
    this.worker = new Worker("/workers/wide-storage.js")
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id)
      if (!p) return
      this.pending.delete(data.id)
      if (data.error) p.reject(new Error(data.error))
      else p.resolve(data.value)
    }
    this.worker.onerror = () => this.close()
  }
  call(
    action: string,
    fields: Record<string, unknown> = {}
  ): Promise<Checkpoint> {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const transfers =
        action === "chunks"
          ? (fields.chunks as { bytes: ArrayBuffer }[]).map((c) => c.bytes)
          : []
      this.worker.postMessage({ id, action, ...fields }, transfers)
    })
  }
  close() {
    this.worker.terminate()
    for (const p of this.pending.values())
      p.reject(new Error("Local storage was closed. Reconnect to resume."))
    this.pending.clear()
  }
}
export class WideTransport {
  pc: RTCPeerConnection
  channel: RTCDataChannel | null = null
  store: LocalStore | null = null
  progress: WideProgress = {}
  sent = 0
  paused = false
  closed = false
  completed = false
  sequence = 0
  incoming: (string | ArrayBuffer)[] = []
  drainTimer?: ReturnType<typeof setTimeout>
  disconnectTimer?: ReturnType<typeof setTimeout>
  queuedFrames = 0
  watchdog: ReturnType<typeof setTimeout>
  finishTimer?: ReturnType<typeof setTimeout>
  queue = Promise.resolve()
  pending = new Map<
    number,
    {
      resolve: (v: Checkpoint) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(
    public owner: boolean,
    public token: string,
    public manifest: WideFile[],
    public sources: File[],
    public hooks: Hooks
  ) {
    this.pc = new RTCPeerConnection(directIceConfiguration())
    this.watchdog = setTimeout(
      () =>
        this.fail(
          "A direct connection could not be established on these networks. Check VPN/firewall settings, try another network on either device, then choose Retry connection."
        ),
      60000
    )
    this.pc.onconnectionstatechange = () => {
      clearTimeout(this.disconnectTimer)
      if (this.pc.connectionState === "connected") {
        clearTimeout(this.watchdog)
        void this.connectionRoute()
      }
      if (
        ["disconnected", "failed"].includes(this.pc.connectionState) &&
        !this.completed &&
        !this.closed
      )
        this.disconnectTimer = setTimeout(
          () =>
            this.fail(
              "Connection interrupted. Keep both devices available, then choose Retry connection to resume verified local data."
            ),
          this.pc.connectionState === "failed" ? 0 : 10000
        )
    }
    this.pc.ondatachannel = (e) => this.bind(e.channel)
    if (owner)
      this.bind(this.pc.createDataChannel("flashdrop-v1", { ordered: true }))
  }
  connectionRoute() {
    if (!this.closed)
      this.hooks.status("Connected · Direct encrypted device connection")
  }
  async initStore() {
    if (!this.owner) {
      if (!navigator.storage?.getDirectory)
        throw new Error(
          "This browser cannot safely receive large files. Use a browser with origin private file storage, such as a recent Chrome, Edge, Firefox or Safari, and allow enough local disk space."
        )
      this.store = new LocalStore()
      await this.store.call("init", {
        session: this.token,
        files: this.manifest,
      })
      // Probe sync access support and exclusive local writer lock before signaling acceptance.
      try {
        await this.store.call("state", { index: 0 })
      } catch (e) {
        this.store.close()
        throw e
      }
    }
  }
  bind(channel: RTCDataChannel) {
    this.channel = channel
    channel.binaryType = "arraybuffer"
    channel.bufferedAmountLowThreshold = 128 * 1024
    channel.onopen = () => {
      clearTimeout(this.watchdog)
      void this.connectionRoute()
      if (this.owner)
        void this.sendFiles().catch((e) => this.fail((e as Error).message))
    }
    channel.onclose = () => {
      if (this.completed) {
        this.close()
        return
      }
      if (!this.completed && !this.closed)
        this.fail(
          "The transfer channel closed. Retry on both devices; verified local chunks can resume."
        )
    }
    channel.onerror = () =>
      this.fail(
        "The transfer connection failed. Retry with both devices online. Try another network if the connection cannot be established."
      )
    channel.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          if (e.data.length > 4096)
            throw Error("Connection message exceeds protocol limits.")
          const m = JSON.parse(e.data) as Control
          if (m.reply) {
            const p = this.pending.get(m.reply)
            if (p) {
              this.pending.delete(m.reply)
              clearTimeout(p.timer)
              if (m.error) p.reject(new Error(m.error))
              else if (m.value) p.resolve(m.value)
            }
            return
          }
        } catch (e) {
          this.fail((e as Error).message)
          return
        }
      }
      if (++this.queuedFrames > 128) {
        this.fail(
          "The peer exceeded the bounded receive window. Retry the connection."
        )
        return
      }
      this.incoming.push(e.data)
      this.scheduleDrain()
    }
  }
  scheduleDrain() {
    if (this.closed) return
    if (!this.drainTimer)
      this.drainTimer = setTimeout(() => {
        this.queue = this.queue
          .then(async () => {
            // Drain immediately, then coalesce arrivals while the disk worker is busy.
            while (this.incoming.length && !this.closed) {
              const items = this.incoming.splice(0, 64)
              for (let start = 0; start < items.length;) {
                if (typeof items[start] === "string") {
                  await this.receive(items[start++])
                  continue
                }
                const frames: ArrayBuffer[] = []
                while (start < items.length && typeof items[start] !== "string")
                  frames.push(items[start++] as ArrayBuffer)
                await this.receiveBatch(frames)
              }
              this.queuedFrames -= items.length
            }
          })
          .catch((e) => this.fail((e as Error).message))
          .finally(() => {
            this.drainTimer = undefined
            if (this.incoming.length && !this.closed) this.scheduleDrain()
          })
      }, 0)
  }
  async receiveBatch(frames: ArrayBuffer[]) {
    if (this.closed) return
    if (this.owner || this.paused)
      throw Error("Receiving is unavailable. Resume and retry.")
    const chunks = frames.map((data) => {
      if (data.byteLength > 16384 || data.byteLength < 4)
        throw Error("Invalid transfer frame.")
      const length = new DataView(data).getUint32(0)
      if (length > 508 || 4 + length >= data.byteLength)
        throw Error("Invalid chunk header.")
      const m = JSON.parse(
        new TextDecoder().decode(data.slice(4, 4 + length))
      ) as Control
      if (
        !Number.isSafeInteger(m.id) ||
        !m.id ||
        m.id < 0 ||
        m.action !== "chunk" ||
        !Number.isInteger(m.index) ||
        !this.manifest[m.index!]
      )
        throw Error("Invalid transfer message.")
      return { ...m, bytes: data.slice(4 + length) }
    })
    const values = (await this.store!.call("chunks", {
      chunks,
    })) as unknown as Checkpoint[]
    if (this.closed) return
    chunks.forEach((m, i) => {
      this.progress[m.index!] = values[i]
      this.channel?.send(JSON.stringify({ reply: m.id, value: values[i] }))
    })
    this.hooks.progress({ ...this.progress }, this.sent)
  }
  async receive(data: string | ArrayBuffer) {
    if (this.closed) return
    if (this.owner) throw Error("Unexpected data from the receiving device.")
    let m: Control, bytes: ArrayBuffer | undefined
    if (typeof data === "string") m = JSON.parse(data)
    else {
      if (data.byteLength > 16 * 1024 || data.byteLength < 4)
        throw Error("Invalid transfer frame.")
      const length = new DataView(data).getUint32(0)
      if (length > 508 || 4 + length >= data.byteLength)
        throw Error("Invalid chunk header.")
      m = JSON.parse(new TextDecoder().decode(data.slice(4, 4 + length)))
      bytes = data.slice(4 + length)
    }
    if (!m.id || !Number.isInteger(m.id) || !m.action)
      throw Error("Invalid transfer message.")
    try {
      if (m.action === "done") {
        if (
          !this.manifest.every(
            (f, i) =>
              this.progress[i]?.offset === f.size && this.progress[i]?.verified
          )
        )
          throw Error(
            "The transfer is incomplete. Retry to receive remaining chunks."
          )
        this.completed = true
        this.channel?.send(
          JSON.stringify({
            reply: m.id,
            value: { offset: 0, chain: EMPTY_CHAIN },
          })
        )
        this.hooks.complete()
        this.finishConnection()
        return
      }
      const index = m.index!
      if (!Number.isInteger(index) || !this.manifest[index])
        throw Error("Unexpected file index.")
      let value: Checkpoint
      if (m.action === "state")
        value = await this.store!.call("state", { index })
      else if (m.action === "chunk" && bytes && !this.paused)
        value = await this.store!.call("chunk", {
          index,
          bytes,
          offset: m.offset,
          hash: m.hash,
        })
      else if (m.action === "finish") {
        this.hooks.status("Verifying the complete received file on local disk…")
        value = await this.store!.call("finish", { index, chain: m.chain })
      } else
        throw Error(
          this.paused
            ? "The recipient paused the transfer. Resume, then retry the connection."
            : "Invalid transfer action."
        )
      this.progress[index] = value
      this.hooks.progress({ ...this.progress }, this.sent)
      this.channel?.send(
        JSON.stringify({
          reply: m.id,
          value,
        })
      )
    } catch (e) {
      this.channel?.send(
        JSON.stringify({ reply: m.id, error: (e as Error).message })
      )
      throw e
    }
  }
  rpc(m: Control, bytes?: ArrayBuffer): Promise<Checkpoint> {
    if (this.closed || this.channel?.readyState !== "open")
      return Promise.reject(
        new Error("Connection is unavailable. Retry to resume.")
      )
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id)
          reject(
            new Error(
              "The other device stopped acknowledging data. Retry the connection when it is ready."
            )
          )
        },
        m.action === "finish" || m.action === "state" ? 30 * 60 * 1000 : 60000
      )
      this.pending.set(id, { resolve, reject, timer })
      try {
        if (bytes) {
          const header = new TextEncoder().encode(JSON.stringify({ ...m, id }))
          const frame = new Uint8Array(4 + header.length + bytes.byteLength)
          new DataView(frame.buffer).setUint32(0, header.length)
          frame.set(header, 4)
          frame.set(new Uint8Array(bytes), 4 + header.length)
          this.channel!.send(frame.buffer)
        } else this.channel!.send(JSON.stringify({ ...m, id }))
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e)
      }
    })
  }
  async waitForDrain() {
    const channel = this.channel!
    if (channel.bufferedAmount <= 512 * 1024) return
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        channel.removeEventListener("bufferedamountlow", ready)
        channel.removeEventListener("close", closed)
      }
      const ready = () => {
        cleanup()
        resolve()
      }
      const closed = () => {
        cleanup()
        reject(new Error("Connection closed. Retry to resume."))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error("Connection buffer stalled. Retry the connection."))
      }, 60000)
      channel.addEventListener("bufferedamountlow", ready, { once: true })
      channel.addEventListener("close", closed, { once: true })
      if (this.closed || channel.readyState !== "open") closed()
      else if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold)
        ready()
    })
  }
  async sendFiles() {
    for (let i = 0; i < this.manifest.length; i++) {
      const source = this.sources[i],
        meta = this.manifest[i]
      if (!source || source.size !== meta.size)
        throw Error("Reselect the original source files before reconnecting.")
      const state = await this.rpc({ action: "state", index: i })
      if (
        !validOffset(state.offset, meta.size) ||
        !/^[a-f0-9]{64}$/.test(state.chain)
      )
        throw Error(
          "The recipient reported invalid progress. Reset pairing to restart safely."
        )
      this.hooks.status(
        state.offset
          ? "Checking retained source against recipient checkpoint…"
          : "Sending verified file chunks…"
      )
      let chain = await chainPrefix(source, state.offset, () => this.closed)
      if (chain !== state.chain)
        throw Error(
          "Retained data does not match this source. Reselect the original files or reset pairing to start over."
        )
      this.progress[i] = state
      this.hooks.progress({ ...this.progress }, this.sent)
      // Keep up to 32 receipts in flight; never stop the whole pipeline for a batch.
      let offset = state.offset
      const receiveWindow = 32
      const inFlight = new Set<Promise<void>>()
      let failure: Error | undefined
      let block = new ArrayBuffer(0),
        blockStart = offset
      while (offset < source.size) {
        while (this.paused && !this.closed)
          await new Promise((r) => setTimeout(r, 100))
        if (this.closed) return
        if (failure) throw failure
        if (inFlight.size >= receiveWindow) {
          await Promise.race(inFlight)
          continue
        }
        await this.waitForDrain()
        if (this.closed) return
        if (offset >= blockStart + block.byteLength) {
          blockStart = offset
          block = await source
            .slice(offset, offset + WIDE_CHUNK_BYTES * 64)
            .arrayBuffer()
        }
        const bytes = block.slice(
          offset - blockStart,
          offset - blockStart + WIDE_CHUNK_BYTES
        )
        const hash = await sha256(bytes)
        chain = await nextChain(chain, hash)
        const expectedOffset = offset + bytes.byteLength,
          expectedChain = chain
        const receipt: Promise<void> = this.rpc(
          { action: "chunk", index: i, offset, hash },
          bytes
        )
          .then((ack) => {
            if (ack.offset !== expectedOffset || ack.chain !== expectedChain)
              throw Error(
                "The receiver acknowledgement failed integrity verification. Retry the transfer."
              )
            this.progress[i] = ack
            this.hooks.progress({ ...this.progress }, this.sent)
          })
          .catch((e) => {
            failure = e instanceof Error ? e : new Error(String(e))
          })
          .finally(() => inFlight.delete(receipt))
        inFlight.add(receipt)
        this.sent += bytes.byteLength
        offset = expectedOffset
      }
      await Promise.all(inFlight)
      if (failure) throw failure
      this.hooks.status(
        "Waiting for complete-file verification on the receiving device…"
      )
      this.progress[i] = await this.rpc({ action: "finish", index: i, chain })
      this.hooks.progress({ ...this.progress }, this.sent)
    }
    await this.rpc({ action: "done" })
    this.completed = true
    this.hooks.complete()
    this.finishConnection()
  }
  finishConnection() {
    // RTCDataChannel.close drains pending messages before its close event.
    // Close the peer only after that event so the final receipt can arrive.
    this.finishTimer = setTimeout(() => this.close(), 5000)
    this.channel?.close()
  }
  async gathered() {
    if (this.pc.iceGatheringState === "complete") return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pc.removeEventListener("icegatheringstatechange", change)
        reject(
          new Error(
            "Network discovery timed out. Retry, check VPN/firewall settings, or use another network."
          )
        )
      }, 20000)
      const change = () => {
        if (this.pc.iceGatheringState === "complete") {
          clearTimeout(timer)
          this.pc.removeEventListener("icegatheringstatechange", change)
          resolve()
        }
      }
      this.pc.addEventListener("icegatheringstatechange", change)
      change()
    })
  }
  async offer() {
    await this.pc.setLocalDescription(await this.pc.createOffer())
    await this.gathered()
    return this.pc.localDescription!.toJSON()
  }
  async answer(offer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(offer)
    await this.pc.setLocalDescription(await this.pc.createAnswer())
    await this.gathered()
    return this.pc.localDescription!.toJSON()
  }
  async acceptAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc.currentRemoteDescription)
      await this.pc.setRemoteDescription(answer)
  }
  fail(message: string) {
    if (this.closed || this.completed) return
    this.hooks.error(message)
    this.close()
  }
  close() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.watchdog)
    clearTimeout(this.finishTimer)
    clearTimeout(this.drainTimer)
    clearTimeout(this.disconnectTimer)
    this.incoming = []
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error("Connection closed. Retry to resume."))
    }
    this.pending.clear()
    this.channel?.close()
    this.pc.close()
    this.store?.close()
  }
}

export async function retainedProgress(
  token: string,
  files: WideFile[]
): Promise<WideProgress> {
  const store = new LocalStore(),
    progress: WideProgress = {}
  try {
    await store.call("init", { session: token, files })
    for (let index = 0; index < files.length; index++) {
      const state = await store.call("state", { index })
      progress[index] =
        state.offset === files[index].size
          ? await store.call("finish", { index, chain: state.chain })
          : state
    }
    return progress
  } finally {
    store.close()
  }
}
