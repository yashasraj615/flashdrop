"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Radio, FolderOpen, FileUp } from "lucide-react"
import { MagneticButton } from "@/components/magnetic-button"
import { ShareTools } from "@/components/share-tools"
import { Progress } from "@/components/ui/progress"
import { formatBytes, formatEta, formatSpeed } from "@/lib/format"
import { fileMetadata } from "@/lib/wide-integrity"
import {
  validateManifest,
  WIDE_MAX_BYTES,
  type WideFile,
} from "@/lib/mode-limits"
import {
  WideTransport,
  retainedProgress,
  type WideProgress,
} from "@/lib/wide-transport"
type Snapshot = {
  role: "owner" | "recipient" | "invite"
  status: string
  files: WideFile[]
  totalSize: number
  expiresAt: string
  senderFinished?: boolean
  recipientFinished?: boolean
  pairingCode?: string
  generation: number
  progress?: WideProgress
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  iceServers?: RTCIceServer[]
  relayAvailable: boolean
}
type Credential = { role: "owner" | "recipient"; key: string; invite?: string }
function capability() {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}
const storageKey = (token: string) => `flashdrop-wide:${token}`
export function WideConnect({ token: initialToken }: { token?: string }) {
  const [token, setToken] = useState(initialToken || ""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [link, setLink] = useState("")
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [status, setStatus] = useState("Ready when you are"),
    [active, setActive] = useState(false),
    [paused, setPaused] = useState(false)
  const [finished, setFinished] = useState(false)
  const [connectionRoute, setConnectionRoute] = useState("")
  const [progress, setProgress] = useState<WideProgress>({}),
    [sent, setSent] = useState(0),
    [rate, setRate] = useState(0),
    [resumeToken, setResumeToken] = useState(""),
    [folderSupport, setFolderSupport] = useState(false)
  const credentials = useRef<Credential | null>(null),
    invite = useRef(""),
    sources = useRef<File[]>([]),
    connection = useRef<WideTransport | null>(null),
    latest = useRef<Snapshot | null>(null)
  const localProgress = useRef<WideProgress>({}),
    lastPersist = useRef(0),
    started = useRef({ time: 0, bytes: 0 }),
    working = useRef(false),
    generation = useRef(-1),
    mounted = useRef(true)
  const finishRequested = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null)
  const total = snapshot?.totalSize ?? files.reduce((n, f) => n + f.size, 0),
    acknowledged = Object.values(progress).reduce((n, p) => n + p.offset, 0)
  const percent = total
    ? Math.min(100, (acknowledged / total) * 100)
    : snapshot?.status === "complete"
      ? 100
      : 0
  const request = useCallback(
    async (
      action?: string,
      body: Record<string, unknown> = {},
      override?: string
    ) => {
      const r = await fetch(`/api/wide/${token}`, {
        method: action ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          "x-flashdrop-access":
            override || credentials.current?.key || invite.current,
        },
        body: action ? JSON.stringify({ action, ...body }) : undefined,
        cache: "no-store",
      })
      const d = await r.json()
      if (!r.ok) {
        const error = new Error(
          d.error ||
            "The session could not be reached. Check your connection and retry."
        ) as Error & { status: number }
        error.status = r.status
        throw error
      }
      return d
    },
    [token]
  )
  function remember(t: string, c: Credential) {
    credentials.current = c
    try {
      localStorage.setItem(storageKey(t), JSON.stringify(c))
      localStorage.setItem("flashdrop-wide-last", t)
    } catch {
      setMessage(
        "This browser cannot remember this session. Keep this tab open; recovery after reload is unavailable."
      )
    }
  }
  useEffect(() => {
    mounted.current = true
    // Browser capability is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFolderSupport("webkitdirectory" in document.createElement("input"))
    try {
      setResumeToken(localStorage.getItem("flashdrop-wide-last") || "")
    } catch {
      /* Session can still run in memory. */
    }
    return () => {
      mounted.current = false
      connection.current?.close()
    }
  }, [])
  useEffect(() => {
    if (!token) return
    invite.current = location.hash.slice(1)
    try {
      credentials.current = JSON.parse(
        localStorage.getItem(storageKey(token)) || "null"
      )
    } catch {
      credentials.current = null
    }
    const saved = credentials.current
    if (!saved) {
      try {
        const local = JSON.parse(
          localStorage.getItem(`flashdrop-wide-local:${token}`) || "null"
        )
        if (local?.closed) {
          // Restore browser-local export state after hydration; no backend credentials are restored.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSnapshot({
            ...local,
            status: "closed",
            generation: 0,
            relayAvailable: false,
          })
          setFinished(true)
          setStatus(
            "Session finished · Your locally received files remain available"
          )
        }
      } catch {}
    }
    if (saved?.role === "owner" && saved.invite)
      setLink(`${location.origin}/wide/${token}#${saved.invite}`)
  }, [token])
  const closeLocalSession = useCallback(() => {
    connection.current?.close()
    setActive(false)
    setFinished(true)
    setLink("")
    setStatus(
      "Session finished · Connection closed and credentials invalidated"
    )
    try {
      localStorage.removeItem(storageKey(token))
      if (localStorage.getItem("flashdrop-wide-last") === token)
        localStorage.removeItem("flashdrop-wide-last")
    } catch {}
    credentials.current = null
    try {
      const key = `flashdrop-wide-local:${token}`,
        local = JSON.parse(localStorage.getItem(key) || "null")
      if (local)
        localStorage.setItem(key, JSON.stringify({ ...local, closed: true }))
    } catch {}
  }, [token])
  const persist = useCallback(
    async (force = false) => {
      if (
        credentials.current?.role !== "recipient" ||
        (!force && Date.now() - lastPersist.current < 5000)
      )
        return
      lastPersist.current = Date.now()
      await request("progress", { progress: localProgress.current })
    },
    [request]
  )
  const stop = useCallback(() => {
    connection.current?.close()
    connection.current = null
    setActive(false)
    setPaused(false)
    generation.current = -1
    setConnectionRoute("")
  }, [])
  const connect = useCallback(
    async (s: Snapshot) => {
      if (
        working.current ||
        connection.current ||
        !["approved", "interrupted"].includes(s.status)
      )
        return
      const owner = credentials.current?.role === "owner"
      if (owner && sources.current.length !== s.files.length) return
      if (!owner && !s.offer) return
      working.current = true
      setBusy(true)
      setMessage("")
      setStatus("Establishing an encrypted connection…")
      let transport: WideTransport | undefined
      try {
        started.current = {
          time: Date.now(),
          bytes: Object.values(localProgress.current).reduce(
            (n, p) => n + p.offset,
            0
          ),
        }
        const ice = await request("ice")
        transport = new WideTransport(
          owner,
          token,
          s.files,
          sources.current,
          ice.iceServers,
          {
            status: (text) => {
              if (mounted.current) {
                if (text.startsWith("Connected ·")) setConnectionRoute(text)
                else setStatus(text)
              }
            },
            progress: (p, n) => {
              localProgress.current = p
              if (mounted.current) {
                setProgress(p)
                setSent(n)
                const bytes = Object.values(p).reduce(
                  (sum, v) => sum + v.offset,
                  0
                )
                setRate(
                  Math.max(0, bytes - started.current.bytes) /
                    Math.max(1, (Date.now() - started.current.time) / 1000)
                )
              }
              void persist().catch(() => {
                if (mounted.current)
                  setMessage(
                    "Progress is safe on this device; backend sync is delayed. Keep the tab open and retry if the connection stops."
                  )
              })
            },
            complete: () => {
              setActive(false)
              setStatus("Complete · Every file verified and received")
              void persist(true).catch(() =>
                setMessage(
                  "Files arrived, but completion metadata could not be synced. Keep local files and reconnect to update session status."
                )
              )
              void request()
                .then((d) => {
                  setSnapshot(d)
                  latest.current = d
                })
                .catch(() => undefined)
            },
            error: (text) => {
              if (mounted.current) {
                setMessage(text)
                setStatus("Interrupted · Verified chunks are retained locally")
                setActive(false)
                setBusy(false)
              }
              void request("interrupt").catch(() => undefined)
            },
          }
        )
        connection.current = transport
        await transport.initStore()
        if (owner) {
          const offer = await transport.offer()
          await request("signal", { signal: offer })
          generation.current = -1
        } else {
          generation.current = s.generation
          const answer = await transport.answer(s.offer!)
          await request("signal", { signal: answer, generation: s.generation })
        }
        setActive(true)
      } catch (e) {
        transport?.close()
        connection.current = null
        setMessage((e as Error).message)
        setActive(false)
      } finally {
        working.current = false
        setBusy(false)
      }
    },
    [persist, request, token]
  )
  useEffect(() => {
    if (!token || finished) return
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>
    async function poll() {
      if (!credentials.current && !invite.current) return
      try {
        const d: Snapshot = await request()
        if (cancelled) return
        setSnapshot(d)
        latest.current = d
        try {
          localStorage.setItem(
            `flashdrop-wide-local:${token}`,
            JSON.stringify({
              files: d.files,
              totalSize: d.totalSize,
              role: d.role,
              expiresAt: d.expiresAt,
            })
          )
        } catch {}
        if (
          d.status === "complete" &&
          d.role === "owner" &&
          !d.senderFinished &&
          !finishRequested.current
        ) {
          finishRequested.current = true
          try {
            const result = await request("finish")
            if (result.closed) {
              closeLocalSession()
              return
            }
          } finally {
            finishRequested.current = false
          }
        }
        if (d.status === "declined") {
          stop()
          setStatus(
            "Transfer declined · Create a new session or reset pairing."
          )
          return
        }
        if (d.role === "invite" && credentials.current?.role === "recipient") {
          credentials.current = null
          try {
            localStorage.removeItem(storageKey(token))
          } catch {}
        }
        if (connection.current && !connection.current.closed) {
          if (d.role === "owner" && d.answer)
            await connection.current.acceptAnswer(d.answer)
          if (d.role === "recipient" && generation.current !== d.generation) {
            stop()
            setStatus("The sender restarted. Choose Retry connection.")
          }
        } else if (!connection.current) await connect(d)
      } catch (e) {
        if (!cancelled) {
          if (/session is finished/i.test((e as Error).message)) {
            closeLocalSession()
            return
          }
          setMessage((e as Error).message)
          if (
            (e as Error & { status?: number }).status === 403 &&
            invite.current &&
            credentials.current?.role === "recipient"
          ) {
            stop()
            credentials.current = null
            try {
              localStorage.removeItem(storageKey(token))
            } catch {}
          } else if (/expired|not authorized/i.test((e as Error).message))
            stop()
        }
      }
      if (!cancelled) timer = setTimeout(poll, 3000)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [closeLocalSession, connect, request, stop, token, finished])
  useEffect(() => {
    if (!active) return
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    const offline = () => {
      stop()
      setStatus("Network offline · Reconnect, then retry.")
      void request("interrupt").catch(() => undefined)
    }
    const visible = () => {
      if (document.hidden)
        setMessage(
          "Keep both browsers open and devices awake. Sleep or browser suspension may interrupt the transfer."
        )
      else if (connection.current?.closed)
        setMessage(
          "The browser interrupted the connection. Retry to reconcile retained chunks."
        )
    }
    window.addEventListener("beforeunload", before)
    window.addEventListener("offline", offline)
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.removeEventListener("beforeunload", before)
      window.removeEventListener("offline", offline)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [active, request, stop])
  async function choose(list: FileList | null) {
    if (!list) return
    setMessage("")
    setBusy(true)
    try {
      const picked = Array.from(list),
        next = snapshot ? picked : [...sources.current, ...picked]
      if (
        next.length > 1000 ||
        next.reduce((n, f) => n + f.size, 0) > WIDE_MAX_BYTES
      )
        throw new Error("Choose up to 1,000 files and 20 GB total.")
      const metadata = validateManifest(
        await Promise.all(next.map(fileMetadata))
      )
      let ordered = next
      if (snapshot) {
        const indexed = new Map(
          metadata.map((m, i) => [m.name, { metadata: m, file: next[i] }])
        )
        if (
          metadata.length !== snapshot.files.length ||
          snapshot.files.some(
            (expected) =>
              JSON.stringify(indexed.get(expected.name)?.metadata) !==
              JSON.stringify(expected)
          )
        )
          throw new Error(
            "Select the same original files or folder. File names, sizes and fingerprints must match this session."
          )
        ordered = snapshot.files.map(
          (expected) => indexed.get(expected.name)!.file
        )
      }
      sources.current = ordered
      setFiles(ordered)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function create() {
    setBusy(true)
    setMessage("")
    try {
      const metadata = validateManifest(
        await Promise.all(sources.current.map(fileMetadata))
      )
      const r = await fetch("/api/wide", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: metadata }),
        }),
        d = await r.json()
      if (!r.ok) throw new Error(d.error)
      remember(d.token, { role: "owner", key: d.owner, invite: d.invite })
      setToken(d.token)
      setLink(`${location.origin}/wide/${d.token}#${d.invite}`)
      history.replaceState(null, "", `/wide/${d.token}`)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function action(name: string, body: Record<string, unknown> = {}) {
    setBusy(true)
    setMessage("")
    try {
      await request(name, body)
      const d = await request()
      setSnapshot(d)
      latest.current = d
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function accept() {
    setBusy(true)
    setMessage("")
    try {
      if (!window.RTCPeerConnection || !navigator.storage?.getDirectory)
        throw new Error(
          "This browser cannot receive Wide Connect files safely. Use a current browser with WebRTC and local private file storage."
        )
      const estimate = await navigator.storage.estimate()
      if (estimate.quota && estimate.quota - (estimate.usage || 0) < total)
        throw new Error(
          "There is not enough browser storage for this transfer. Free disk space or choose another device."
        )
      const key = capability()
      remember(token, { role: "recipient", key })
      await request("accept", { recipient: key }, invite.current)
      const d = await request(undefined, {}, key)
      setSnapshot(d)
      latest.current = d
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function finishSession() {
    setBusy(true)
    setMessage("")
    try {
      const result = await request("finish")
      if (result.closed) closeLocalSession()
      else {
        setStatus("Your session is finished · Waiting for the other device")
        const d = await request()
        setSnapshot(d)
      }
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function retry() {
    stop()
    setMessage("")
    try {
      const d = await request()
      await connect(d)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  async function save(index: number) {
    setMessage("")
    try {
      const name = snapshot!.files[index].name.split("/").pop() || "download"
      const picker = (
        window as unknown as {
          showSaveFilePicker?: (o: {
            suggestedName: string
          }) => Promise<{ createWritable: () => Promise<WritableStream> }>
        }
      ).showSaveFilePicker
      if (picker) {
        const handle = await picker.call(window, { suggestedName: name })
        const root = await navigator.storage.getDirectory(),
          dir = await root.getDirectoryHandle(`flashdrop-${token}`),
          file = await (await dir.getFileHandle(`data-${index}`)).getFile()
        await file.stream().pipeTo(await handle.createWritable())
      } else {
        const root = await navigator.storage.getDirectory(),
          dir = await root.getDirectoryHandle(`flashdrop-${token}`),
          file = await (await dir.getFileHandle(`data-${index}`)).getFile()
        if (file.size > 128 * 1024 * 1024)
          throw new Error(
            "This browser cannot export this large local file safely. Keep its local data and use a browser with Save File support for future large transfers."
          )
        const u = URL.createObjectURL(file),
          a = document.createElement("a")
        a.href = u
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(u), 10000)
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage(
          (e as Error).message || "Saving failed. Free disk space and retry."
        )
    }
  }
  async function restore() {
    setBusy(true)
    setMessage("Checking retained local files…")
    try {
      const p = await retainedProgress(token, snapshot!.files)
      localProgress.current = p
      setProgress(p)
      setMessage(
        "Local files checked. Save completed files below; retry to receive missing data."
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function discard() {
    stop()
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(`flashdrop-${token}`, { recursive: true })
      setProgress({})
      localProgress.current = {}
      setMessage(
        "Local received data deleted. The source files and backend session are unchanged."
      )
    } catch {
      setMessage(
        "Local data could not be removed. Close other tabs for this session and try again."
      )
    }
  }
  const owner = snapshot?.role === "owner"
  return (
    <section
      className="mode-panel space-y-5"
      data-transfer-active={active ? "true" : undefined}
      aria-busy={busy}
    >
      <div className="flex items-start gap-4">
        <span className="mode-icon shrink-0">
          <Radio className="size-6" />
        </span>
        <div>
          <p className="eyebrow">Wide Connect</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Big files. Closer devices.
          </h1>
        </div>
      </div>
      <p className="text-sm leading-6 text-white/65">
        Up to 20 GB directly between connected devices. Flashdrop stores only
        session, file and progress metadata. File contents travel through
        encrypted WebRTC; a configured TURN relay may forward traffic without
        storing it.
      </p>
      <div role="status" className="mode-notice">
        <span
          className={`mr-2 inline-block size-2 rounded-full ${active ? "bg-emerald-300" : "bg-white/40"}`}
        />
        {status}
        {connectionRoute && (
          <p className="mt-2 text-xs text-primary">{connectionRoute}</p>
        )}
        {message && <p className="mt-2 text-white/75">{message}</p>}
      </div>
      {(!token || (owner && !finished && snapshot?.status !== "complete")) && (
        <>
          <div className="flex flex-wrap gap-2">
            <MagneticButton
              onClick={() => fileInput.current?.click()}
              disabled={busy || active}
            >
              <FileUp className="size-4" />
              {token ? "Reselect source files" : "Choose files"}
            </MagneticButton>
            {folderSupport && (
              <MagneticButton
                variant="secondary"
                onClick={() => folderInput.current?.click()}
                disabled={busy || active}
              >
                <FolderOpen className="size-4" />
                Choose folder
              </MagneticButton>
            )}
          </div>
          <input
            ref={fileInput}
            aria-label="Select Wide Connect files"
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files)
              e.target.value = ""
            }}
          />
          <input
            ref={folderInput}
            aria-label="Select a source folder"
            type="file"
            multiple
            {...{ webkitdirectory: "" }}
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files)
              e.target.value = ""
            }}
          />
        </>
      )}
      {!token && (
        <>
          <p className="text-sm text-white/60">
            {files.length} files · {formatBytes(total)} / 20 GB ·{" "}
            {formatBytes(Math.max(0, WIDE_MAX_BYTES - total))} remaining
          </p>
          {files.length > 0 && (
            <ul className="max-h-64 space-y-2 overflow-auto">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {f.webkitRelativePath || f.name}
                  </span>
                  <span className="text-white/60">{formatBytes(f.size)}</span>
                  <MagneticButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const next = files.filter((_, n) => n !== i)
                      setFiles(next)
                      sources.current = next
                    }}
                    disabled={busy}
                  >
                    Remove
                  </MagneticButton>
                </li>
              ))}
            </ul>
          )}
          <MagneticButton disabled={!files.length || busy} onClick={create}>
            {busy ? "Preparing…" : "Create invitation"}
          </MagneticButton>
          {resumeToken && (
            <a
              className="ml-3 text-sm text-primary underline"
              href={`/wide/${resumeToken}`}
            >
              Resume previous session
            </a>
          )}
        </>
      )}
      {link && <ShareTools url={link} />}
      {snapshot && (
        <>
          <p className="text-xs leading-6 text-white/55">
            {finished ? (
              "The live session is closed. Local originals and received files are unchanged. Coordination metadata is removed within the one-hour retention deadline on the next cleanup run."
            ) : (
              <>
                Session expires {new Date(snapshot.expiresAt).toLocaleString()}{" "}
                or after 2 hours without device activity.{" "}
                {snapshot.relayAvailable
                  ? "TURN fallback is configured."
                  : "TURN fallback is not configured; some networks will not connect. Try another network if needed."}
              </>
            )}
          </p>
          {snapshot.role === "invite" && snapshot.status === "waiting" && (
            <div className="space-y-3">
              <p className="text-sm">
                A sender wants to share {snapshot.files.length} files (
                {formatBytes(total)}). Accept to request pairing. No bytes are
                sent until the sender approves your code.
              </p>
              <MagneticButton disabled={busy} onClick={accept}>
                Accept invitation
              </MagneticButton>
              <MagneticButton
                variant="ghost"
                onClick={() =>
                  setStatus(
                    "Invitation declined on this device. You can close this page."
                  )
                }
              >
                Decline
              </MagneticButton>
            </div>
          )}
          {snapshot.status === "pending" && snapshot.role !== "invite" && (
            <div className="space-y-3">
              <p className="text-sm text-white/75">
                Compare this code with the intended recipient using a trusted
                conversation before approval.
              </p>
              <p className="font-mono text-4xl tracking-[0.2em] text-primary">
                {snapshot.pairingCode}
              </p>
              {owner ? (
                <MagneticButton
                  onClick={() =>
                    action("approve", { code: snapshot.pairingCode })
                  }
                  disabled={busy}
                >
                  Codes match · Approve recipient
                </MagneticButton>
              ) : (
                <p className="text-sm">
                  Waiting for the sender to approve this code.
                </p>
              )}
            </div>
          )}
          {snapshot.role === "invite" &&
            snapshot.status !== "waiting" &&
            !finished && (
              <p className="text-sm">
                This session is already paired or closed. Ask the sender to
                reset pairing if this is your intended transfer.
              </p>
            )}
          {owner &&
            token &&
            !finished &&
            snapshot.status !== "complete" &&
            files.length === 0 && (
              <p className="mode-notice">
                To resume, reselect the original source files or folder. Backend
                metadata cannot restore files from this device.
              </p>
            )}
          {snapshot.role !== "invite" && (
            <>
              <div className="space-y-3">
                <Progress value={percent} />
                <p className="text-sm tabular-nums">
                  {formatBytes(acknowledged)} verified & acknowledged /{" "}
                  {formatBytes(total)} · {Math.round(percent)}%
                </p>
                <p className="text-xs text-white/55">
                  {formatBytes(sent)} sent this connection ·{" "}
                  {formatBytes(Math.max(0, total - acknowledged))} remaining
                  {rate > 0
                    ? ` · ${formatSpeed(rate)} · ~${formatEta((total - acknowledged) / rate)} left`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshot.status === "complete" && !finished && (
                  <MagneticButton
                    disabled={
                      busy ||
                      Boolean(
                        owner
                          ? snapshot.senderFinished
                          : snapshot.recipientFinished
                      )
                    }
                    onClick={finishSession}
                  >
                    {owner
                      ? "Finish sender session"
                      : "Files saved · Finish session"}
                  </MagneticButton>
                )}
                {active && (
                  <MagneticButton
                    variant="secondary"
                    onClick={() => {
                      const p = !paused
                      setPaused(p)
                      if (connection.current) connection.current.paused = p
                      if (p && !owner) {
                        stop()
                        setStatus("Paused · Retry connection to resume")
                        void request("interrupt").catch(() => undefined)
                      }
                    }}
                  >
                    {paused ? "Resume" : "Pause"}
                  </MagneticButton>
                )}
                {["approved", "interrupted", "complete"].includes(
                  snapshot.status
                ) && (
                  <MagneticButton
                    variant="outline"
                    onClick={retry}
                    disabled={busy || snapshot.status === "complete"}
                  >
                    Retry connection
                  </MagneticButton>
                )}
                {owner && !finished && snapshot.status !== "complete" && (
                  <MagneticButton
                    variant="ghost"
                    onClick={() => {
                      stop()
                      void action("reset")
                    }}
                    disabled={busy}
                  >
                    Reset pairing
                  </MagneticButton>
                )}
                {snapshot.status !== "complete" && !finished && (
                  <MagneticButton
                    variant="ghost"
                    onClick={() => {
                      stop()
                      void action("decline")
                    }}
                    disabled={busy}
                  >
                    End session
                  </MagneticButton>
                )}
              </div>
            </>
          )}
          <ul className="max-h-96 divide-y divide-white/10 overflow-auto rounded-2xl border border-white/10">
            {snapshot.files.map((f, i) => (
              <li
                key={i}
                className="flex min-w-0 flex-wrap items-center gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={f.name}>
                    {f.name}
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    {formatBytes(progress[i]?.offset || 0)} /{" "}
                    {formatBytes(f.size)}
                    {progress[i]?.verified ? " · Received and verified" : ""}
                  </p>
                </div>
                {!owner &&
                  snapshot.role === "recipient" &&
                  progress[i]?.verified && (
                    <MagneticButton size="sm" onClick={() => save(i)}>
                      Save file
                    </MagneticButton>
                  )}
              </li>
            ))}
          </ul>
          {snapshot.status === "complete" &&
            !finished &&
            snapshot.role === "recipient" && (
              <p className="mode-notice">
                Save each file below, then choose Files saved · Finish session.
                After both endpoints finish, Flashdrop invalidates their session
                credentials. Your local files are kept.
              </p>
            )}
          {!owner && snapshot.role === "recipient" && (
            <div className="flex flex-wrap gap-2">
              <MagneticButton
                variant="outline"
                disabled={active || busy}
                onClick={restore}
              >
                Check retained local files
              </MagneticButton>
              <MagneticButton
                variant="ghost"
                disabled={active || busy}
                onClick={discard}
              >
                Delete local received data
              </MagneticButton>
            </div>
          )}
        </>
      )}
      <p className="text-xs leading-6 text-white/55">
        Keep both source and receiving devices awake with this page open. PWA
        installation cannot guarantee background transfers. Received chunks stay
        in this browser’s private local storage until deleted or evicted; save
        finished files to keep them. Source files must be reselected after
        reload. Large-file export requires a browser with Save File support
        (Chrome or Edge recommended); other browsers can save individual files
        up to 128 MiB. Folder selection and disk capacity vary by browser.
      </p>
    </section>
  )
}
