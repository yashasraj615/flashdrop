"use client"
import { useEffect, useState, useDeferredValue } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { MagneticButton } from "@/components/magnetic-button"
import { ShareTools } from "@/components/share-tools"
import { Countdown } from "@/components/countdown"
import { DEFAULT_LIFETIME_SECONDS, LIFETIME_OPTIONS } from "@/lib/lifetime"
import {
  lineCount,
  TEXT_MAX_BYTES,
  TEXT_MAX_LINES,
  validateText,
} from "@/lib/mode-limits"
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown-view">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={{
          img: ({ alt }) => <span>[Image: {alt || "external image"}]</span>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
export function TextPad({ token }: { token?: string }) {
  const [text, setText] = useState(""),
    [format, setFormat] = useState("markdown"),
    [preview, setPreview] = useState(false)
  const [lifetime, setLifetime] = useState<number>(DEFAULT_LIFETIME_SECONDS),
    [busy, setBusy] = useState(Boolean(token)),
    [error, setError] = useState("")
  const [url, setUrl] = useState(""),
    [expiry, setExpiry] = useState(""),
    [serverNow, setServerNow] = useState("")
  const deferred = useDeferredValue(text),
    lines = lineCount(text),
    bytes = new TextEncoder().encode(text).length
  useEffect(() => {
    if (!token) return
    const abort = new AbortController()
    async function load() {
      try {
        const access = location.hash.slice(1)
        const r = await fetch(`/api/text/${token}`, {
            headers: { "x-flashdrop-access": access },
            signal: abort.signal,
            cache: "no-store",
          }),
          data = await r.json()
        if (!r.ok) throw new Error(data.error)
        setText(data.content)
        setFormat(data.format)
        setPreview(data.format === "markdown")
        setExpiry(data.expiresAt)
        setServerNow(data.serverNow)
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "The pad could not be loaded. Try again."
          )
      } finally {
        if (!abort.signal.aborted) setBusy(false)
      }
    }
    void load()
    return () => abort.abort()
  }, [token])
  useEffect(() => {
    if (!expiry) return
    const offset = serverNow ? Date.now() - new Date(serverNow).getTime() : 0
    const timer = setTimeout(
      () => {
        setText("")
        setUrl("")
        setError("This Text Pad has expired. Create a new pad to share again.")
      },
      Math.max(0, new Date(expiry).getTime() - Date.now() + offset)
    )
    return () => clearTimeout(timer)
  }, [expiry, serverNow])
  async function save() {
    setError("")
    setBusy(true)
    try {
      validateText(text)
      const r = await fetch("/api/text", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: text,
            format,
            lifetimeSeconds: lifetime,
          }),
        }),
        d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setUrl(`${location.origin}/text/${d.token}#${d.access}`)
      setExpiry(d.expiresAt)
      setServerNow("")
    } catch (e) {
      setError(
        (e as Error).message ||
          "Saving failed. Check your connection and try again."
      )
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setError("Content copied.")
    } catch {
      setError("Select the text in the editor and copy it manually.")
    }
  }
  function download() {
    const u = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" })
    )
    const a = document.createElement("a")
    a.href = u
    a.download = format === "markdown" ? "flashdrop.md" : "flashdrop.txt"
    a.click()
    setTimeout(() => URL.revokeObjectURL(u), 1000)
  }
  return (
    <section className="mode-panel space-y-5" aria-busy={busy}>
      <div>
        <p className="eyebrow">Text Pad</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          A little space for your ideas.
        </h1>
        <p className="mt-3 text-sm text-white/65">
          Markdown, notes, code and plain text. Up to 15,000 lines and 1 MiB of
          UTF-8 text. Temporarily stored on Flashdrop; anyone with the full link
          can read it.
        </p>
      </div>
      {error && (
        <p role="status" className="mode-notice">
          {error}
        </p>
      )}
      {busy && token ? (
        <p role="status">Loading Text Pad…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="text-format">
              Text format
            </label>
            <select
              id="text-format"
              className="mode-input"
              value={format}
              disabled={Boolean(token)}
              onChange={(e) => {
                setFormat(e.target.value)
                setUrl("")
                setExpiry("")
              }}
            >
              <option value="markdown">Markdown</option>
              <option value="plain">Plain text / code</option>
            </select>
            <MagneticButton
              variant="secondary"
              onClick={() => setPreview(!preview)}
              aria-pressed={preview}
            >
              {preview ? "View source" : "Preview"}
            </MagneticButton>
            <MagneticButton variant="ghost" onClick={copy} disabled={!text}>
              Copy all
            </MagneticButton>
            {token && (
              <MagneticButton
                variant="ghost"
                onClick={download}
                disabled={!text}
              >
                Download original
              </MagneticButton>
            )}
          </div>
          {preview ? (
            <div className="mode-editor overflow-auto p-5">
              {format === "markdown" ? (
                <Markdown text={deferred} />
              ) : (
                <pre className="break-words whitespace-pre-wrap">{text}</pre>
              )}
            </div>
          ) : (
            <textarea
              aria-label={
                token ? "Original shared text" : "Write or paste text"
              }
              className="mode-editor w-full resize-y p-4 font-mono text-sm leading-6"
              spellCheck={false}
              readOnly={Boolean(token)}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setUrl("")
                setExpiry("")
              }}
              placeholder="# Your next idea starts here…"
            />
          )}
          <p
            className={
              lines > TEXT_MAX_LINES || bytes > TEXT_MAX_BYTES
                ? "text-xs text-amber-200"
                : "text-xs text-white/55"
            }
          >
            {lines.toLocaleString()} / 15,000 lines ·{" "}
            {text.length.toLocaleString()} characters ·{" "}
            {(bytes / 1024).toFixed(1)} / 1,024 KiB
          </p>
          {!token && (
            <>
              <label className="flex flex-wrap items-center gap-3 text-sm">
                Share for
                <select
                  className="mode-input"
                  value={lifetime}
                  onChange={(e) => setLifetime(Number(e.target.value))}
                >
                  {LIFETIME_OPTIONS.map((o) => (
                    <option key={o.seconds} value={o.seconds}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <MagneticButton
                  onClick={save}
                  disabled={
                    busy ||
                    !text.trim() ||
                    lines > TEXT_MAX_LINES ||
                    bytes > TEXT_MAX_BYTES
                  }
                >
                  {busy ? "Saving…" : "Create share link"}
                </MagneticButton>
                <MagneticButton
                  variant="ghost"
                  onClick={() => {
                    setText("")
                    setUrl("")
                    setExpiry("")
                    setError("")
                  }}
                  disabled={busy}
                >
                  Clear
                </MagneticButton>
                {preview && (
                  <MagneticButton
                    variant="ghost"
                    onClick={() => setPreview(false)}
                  >
                    Edit
                  </MagneticButton>
                )}
              </div>
            </>
          )}
          {url && <ShareTools url={url} />}{" "}
          {expiry && (
            <p className="text-xs text-white/60">
              <Countdown
                expiresAt={expiry}
                serverNow={serverNow || undefined}
                compact
              />{" "}
              · Access ends at expiry; backend cleanup removes the record.
            </p>
          )}
        </>
      )}
    </section>
  )
}
