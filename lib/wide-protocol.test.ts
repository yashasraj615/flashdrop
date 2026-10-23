import { readFileSync } from "node:fs"
import { createContext, runInContext } from "node:vm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WideTransport, type WideProgress } from "./wide-transport"
import { fileMetadata, EMPTY_CHAIN } from "./wide-integrity"
import { WIDE_CHUNK_BYTES } from "./mode-limits"
// Deterministic browser adapters exercise the actual transport + actual storage worker.
const disk = new Map<string, Uint8Array>(),
  locks = new Set<string>()
let corrupt = false,
  frames: number[] = [],
  ackAfterFlush = true
const flushed = new Set<string>()
function directory(prefix = "") {
  return {
    async getDirectoryHandle(name: string) {
      return directory(`${prefix}/${name}`)
    },
    async getFileHandle(name: string) {
      const path = `${prefix}/${name}`
      return {
        async createSyncAccessHandle() {
          if (locks.has(path)) throw Error("File is locked")
          locks.add(path)
          if (!disk.has(path)) disk.set(path, new Uint8Array())
          return {
            getSize: () => disk.get(path)!.length,
            truncate: (n: number) => {
              const b = new Uint8Array(n)
              b.set(disk.get(path)!.subarray(0, n))
              disk.set(path, b)
            },
            read: (b: Uint8Array, o = { at: 0 }) => {
              const bytes = disk.get(path)!.subarray(o.at, o.at + b.length)
              b.set(bytes)
              return bytes.length
            },
            write: (b: Uint8Array, o = { at: 0 }) => {
              const old = disk.get(path)!,
                next = new Uint8Array(Math.max(old.length, o.at + b.length))
              next.set(old)
              next.set(b, o.at)
              disk.set(path, next)
              flushed.delete(path)
              return b.length
            },
            flush: () => flushed.add(path),
            close: () => locks.delete(path),
          }
        },
      }
    },
  }
}
class StorageWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  ctx: ReturnType<typeof createContext>
  constructor() {
    const emit = (data: unknown) =>
      queueMicrotask(() => this.onmessage?.({ data }))
    this.ctx = createContext({
      crypto,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      Map,
      Promise,
      Error,
      Number,
      JSON,
      navigator: { storage: { getDirectory: async () => directory() } },
      postMessage: emit,
      onmessage: null,
    })
    runInContext(
      readFileSync(
        new URL("../public/workers/wide-storage.js", import.meta.url),
        "utf8"
      ),
      this.ctx
    )
  }
  postMessage(data: unknown) {
    this.ctx.onmessage({ data })
  }
  terminate() {
    runInContext(
      "for (const h of handles.values()) {h.data.close();h.meta.close()} handles.clear()",
      this.ctx
    )
  }
}
class Channel {
  readyState = "connecting"
  binaryType = "arraybuffer"
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null
  peer: Channel | null = null
  send(data: string | ArrayBuffer) {
    if (this.readyState !== "open") throw Error("closed")
    if (typeof data !== "string") {
      frames.push(data.byteLength)
      if (corrupt) {
        const bytes = new Uint8Array(data.slice(0))
        bytes[bytes.length - 1] ^= 1
        data = bytes.buffer
        corrupt = false
      }
    } else {
      const m = JSON.parse(data)
      if (m.reply && m.value?.offset > 0)
        ackAfterFlush =
          ackAfterFlush &&
          [...disk.keys()]
            .filter((k) => k.includes("/data-") || k.includes("/state-"))
            .every((k) => flushed.has(k))
    }
    const other = this.peer
    queueMicrotask(() => {
      if (other?.readyState === "open") other.onmessage?.({ data })
    })
  }
  close() {
    if (this.readyState === "closed") return
    this.readyState = "closed"
    queueMicrotask(() => this.onclose?.())
  }
}
class Peer {
  channel: Channel | null = null
  connectionState = "new"
  onconnectionstatechange: null = null
  ondatachannel: ((e: { channel: Channel }) => void) | null = null
  createDataChannel() {
    this.channel = new Channel()
    return this.channel
  }
  close() {
    this.connectionState = "closed"
  }
  async getStats() {
    return new Map()
  }
}
function link(sender: WideTransport, receiver: WideTransport) {
  const a = sender.channel as unknown as Channel,
    b = new Channel()
  a.peer = b
  b.peer = a
  receiver.bind(b as unknown as RTCDataChannel)
  a.readyState = b.readyState = "open"
  a.onopen?.()
  b.onopen?.()
}
async function pair(source: File, token = "test") {
  const manifest = [await fileMetadata(source)]
  let senderDone = false,
    receiverDone = false,
    error = "",
    progress: WideProgress = {}
  const hooks = {
    status: () => {},
    progress: (p: WideProgress) => {
      progress = p
    },
    complete: () => {
      receiverDone = true
    },
    error: (e: string) => {
      error = e
    },
  }
  const receiver = new WideTransport(false, token, manifest, [], [], hooks)
  await receiver.initStore()
  const sender = new WideTransport(true, token, manifest, [source], [], {
    ...hooks,
    complete: () => {
      senderDone = true
    },
  })
  return {
    sender,
    receiver,
    link: () => link(sender, receiver),
    get done() {
      return senderDone && receiverDone
    },
    get error() {
      return error
    },
    get progress() {
      return progress
    },
  }
}
beforeEach(() => {
  disk.clear()
  locks.clear()
  flushed.clear()
  frames = []
  corrupt = false
  ackAfterFlush = true
  vi.stubGlobal("Worker", StorageWorker)
  vi.stubGlobal("RTCPeerConnection", Peer)
  vi.stubGlobal("navigator", {
    storage: { getDirectory: async () => directory() },
  })
})
afterEach(() => vi.unstubAllGlobals())
describe("Wide Connect real chunk protocol with local storage worker", () => {
  it("streams bounded frames, verifies persisted bytes, and waits for disk-flushed acknowledgements", async () => {
    const bytes = crypto.getRandomValues(
        new Uint8Array(WIDE_CHUNK_BYTES * 3 + 17)
      ),
      source = new File([bytes], "original.bin", { lastModified: 42 }),
      p = await pair(source)
    p.link()
    await vi.waitFor(() => expect(p.done).toBe(true))
    expect(p.error).toBe("")
    await vi.waitFor(() =>
      expect(p.sender.closed && p.receiver.closed).toBe(true)
    )
    expect(Math.max(...frames)).toBeLessThanOrEqual(16384)
    expect(ackAfterFlush).toBe(true)
    expect(p.progress[0].verified).toBe(true)
    expect(disk.get("/flashdrop-test/data-0")).toEqual(bytes)
    p.sender.close()
    p.receiver.close()
  })
  it("rejects corrupted chunks before storing or acknowledging them", async () => {
    const p = await pair(
      new File(["sensitive original"], "a.txt", { lastModified: 1 })
    )
    corrupt = true
    p.link()
    await vi.waitFor(() =>
      expect(p.error).toMatch(/Integrity verification failed/)
    )
    expect(p.done).toBe(false)
    expect(disk.get("/flashdrop-test/data-0")?.length).toBe(0)
    p.sender.close()
    p.receiver.close()
  })
  it("reconciles flushed checkpoints across endpoint recreation and resumes without duplicating bytes", async () => {
    const source = new File(
        [new Uint8Array(WIDE_CHUNK_BYTES * 64 + 10).fill(7)],
        "large.bin",
        { lastModified: 1 }
      ),
      first = await pair(source, "resume")
    first.sender.hooks.progress = (p) => {
      if (p[0]?.offset === WIDE_CHUNK_BYTES * 32) {
        first.sender.paused = true
      }
    }
    first.link()
    await vi.waitFor(() =>
      expect(first.sender.progress[0]?.offset).toBe(WIDE_CHUNK_BYTES * 32)
    )
    first.sender.close()
    first.receiver.close()
    const resumed = await pair(source, "resume")
    resumed.link()
    await vi.waitFor(() => expect(resumed.done).toBe(true))
    expect(resumed.sender.sent).toBe(source.size - WIDE_CHUNK_BYTES * 32)
    expect(disk.get("/flashdrop-resume/data-0")?.length).toBe(source.size)
    resumed.sender.close()
    resumed.receiver.close()
  })
  it("detects tampered retained local data before resuming", async () => {
    const source = new File(
        [new Uint8Array(WIDE_CHUNK_BYTES * 64).fill(8)],
        "a.bin",
        { lastModified: 1 }
      ),
      first = await pair(source, "tamper")
    first.sender.hooks.progress = (p) => {
      if (p[0]?.offset === WIDE_CHUNK_BYTES * 32) first.sender.paused = true
    }
    first.link()
    await vi.waitFor(() =>
      expect(first.sender.progress[0]?.offset).toBe(WIDE_CHUNK_BYTES * 32)
    )
    first.sender.close()
    first.receiver.close()
    disk.get("/flashdrop-tamper/data-0")![0] ^= 1
    await expect(pair(source, "tamper")).rejects.toThrow(
      /failed integrity verification/
    )
  })
  it("rejects a changed source prefix even when first/last fingerprints still match", async () => {
    const bytes = new Uint8Array(WIDE_CHUNK_BYTES * 64).fill(3)
    const original = new File([bytes], "same.bin", { lastModified: 1 }),
      first = await pair(original, "changed-source")
    first.sender.hooks.progress = (p) => {
      if (p[0]?.offset === WIDE_CHUNK_BYTES * 32) first.sender.paused = true
    }
    first.link()
    await vi.waitFor(() =>
      expect(first.sender.progress[0]?.offset).toBe(WIDE_CHUNK_BYTES * 32)
    )
    first.sender.close()
    first.receiver.close()
    bytes[WIDE_CHUNK_BYTES * 2] ^= 1
    const changed = new File([bytes], "same.bin", { lastModified: 1 })
    expect(await fileMetadata(changed)).toEqual(await fileMetadata(original))
    const resumed = await pair(changed, "changed-source")
    resumed.link()
    await vi.waitFor(() =>
      expect(resumed.error).toMatch(/does not match this source/)
    )
    expect(resumed.done).toBe(false)
    expect(resumed.sender.sent).toBe(0)
    resumed.sender.close()
    resumed.receiver.close()
  })
  it("completes zero-byte files with a valid empty chain", async () => {
    const p = await pair(new File([], "empty.txt", { lastModified: 1 }))
    p.link()
    await vi.waitFor(() => expect(p.done).toBe(true))
    expect(p.progress[0]).toMatchObject({
      offset: 0,
      chain: EMPTY_CHAIN,
      verified: true,
    })
    p.sender.close()
    p.receiver.close()
  })
})
