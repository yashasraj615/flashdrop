"use client"
import { useRef, useState } from "react"
import {
  transformText,
  replaceLiteral,
  type TextTool,
} from "@/lib/clipboard-tools"
import { TEXT_MAX_BYTES, validateText } from "@/lib/mode-limits"
const templates = {
  note: "# Note\n\n## Summary\n\n## Next steps\n- [ ] First task\n",
  meeting:
    "# Meeting notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n1. \n\n## Decisions\n\n## Actions\n- [ ] Owner — action\n",
  code: "```typescript\n// Paste your code here\n```\n",
  table:
    "| Item | Details | Status |\n| --- | --- | --- |\n| First item | | Pending |\n",
}
type Draft = { id: string; text: string; date: string }
export function ClipboardEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string
  onChange: (value: string) => void
  readOnly: boolean
}) {
  const editor = useRef<HTMLTextAreaElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const undo = useRef<string[]>([]),
    redo = useRef<string[]>([])
  const [notice, setNotice] = useState("")
  const [find, setFind] = useState(""),
    [replacement, setReplacement] = useState("")
  const [wrap, setWrap] = useState(true),
    [drafts, setDrafts] = useState<Draft[]>([])
  function change(next: string) {
    if (readOnly) return
    if (new TextEncoder().encode(next).length > TEXT_MAX_BYTES) {
      setNotice("This edit exceeds the 1 MiB limit.")
      return
    }
    undo.current.push(value)
    if (undo.current.length > 12) undo.current.shift()
    redo.current = []
    onChange(next)
  }
  function insert(before: string, after = "") {
    const el = editor.current
    if (!el) return
    const start = el.selectionStart,
      end = el.selectionEnd
    change(
      value.slice(0, start) +
        before +
        value.slice(start, end) +
        after +
        value.slice(end)
    )
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, end + before.length)
    })
  }
  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      const el = editor.current
      if (!el) return
      change(
        value.slice(0, el.selectionStart) + text + value.slice(el.selectionEnd)
      )
      setNotice("Clipboard text inserted.")
    } catch {
      setNotice(
        "Clipboard permission unavailable. Focus the editor and use your browser’s Paste command."
      )
    }
  }
  function apply(tool: TextTool) {
    try {
      change(transformText(value, tool))
      setNotice("Transformation applied. Undo is available.")
    } catch {
      setNotice(
        "The input is not valid for this transformation. Your text is unchanged."
      )
    }
  }
  function readDrafts() {
    try {
      const data = JSON.parse(
        sessionStorage.getItem("flashdrop-clipboard-drafts") || "[]"
      )
      return Array.isArray(data)
        ? (data
            .filter(
              (d) =>
                typeof d?.id === "string" &&
                typeof d?.text === "string" &&
                d.text.length <= 200000
            )
            .slice(0, 5) as Draft[])
        : []
    } catch {
      return []
    }
  }
  function saveDraft() {
    if (new TextEncoder().encode(value).length > 200000) {
      setNotice(
        "Local drafts are limited to 200 KB. Export larger notes instead."
      )
      return
    }
    try {
      const next = [
        {
          id: crypto.randomUUID(),
          text: value,
          date: new Date().toLocaleString(),
        },
        ...readDrafts(),
      ].slice(0, 5)
      sessionStorage.setItem("flashdrop-clipboard-drafts", JSON.stringify(next))
      setDrafts(next)
      setNotice(
        "Draft saved in this tab’s session storage. Shared recipients never receive drafts."
      )
    } catch {
      setNotice("Local draft storage is unavailable. Export your note instead.")
    }
  }
  function exportFile() {
    const url = URL.createObjectURL(
      new Blob([value], { type: "text/plain;charset=utf-8" })
    )
    const a = document.createElement("a")
    a.href = url
    a.download = "flashdrop-note.md"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="clipboard-workspace space-y-3">
      <div
        className="flex flex-wrap gap-2"
        role="toolbar"
        aria-label="Clipboard tools"
      >
        {!readOnly && (
          <>
            <button className="clipboard-tool" onClick={paste}>
              Paste clipboard
            </button>
            <button
              className="clipboard-tool"
              onClick={() => upload.current?.click()}
            >
              Import text file
            </button>
            <button
              className="clipboard-tool"
              onClick={() => {
                const previous = undo.current.pop()
                if (previous !== undefined) {
                  redo.current.push(value)
                  onChange(previous)
                }
              }}
            >
              Undo
            </button>
            <button
              className="clipboard-tool"
              onClick={() => {
                const next = redo.current.pop()
                if (next !== undefined) {
                  undo.current.push(value)
                  onChange(next)
                }
              }}
            >
              Redo
            </button>
          </>
        )}
        <button
          className="clipboard-tool"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setNotice("Copied text.")
            } catch {
              setNotice("Select the editor text and copy manually.")
            }
          }}
        >
          Copy text
        </button>
        <button className="clipboard-tool" onClick={exportFile}>
          Export .md
        </button>
        <button
          className="clipboard-tool"
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        >
          Wrap: {wrap ? "on" : "off"}
        </button>
        <button
          className="clipboard-tool"
          onClick={() => {
            editor.current?.focus()
            editor.current?.select()
          }}
        >
          Select all
        </button>
      </div>
      {!readOnly && (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="toolbar"
            aria-label="Markdown formatting"
          >
            {[
              ["Bold", "**", "**"],
              ["Italic", "_", "_"],
              ["Heading", "## ", ""],
              ["Code", "`", "`"],
              ["Code block", "\n```\n", "\n```\n"],
              ["Task", "- [ ] ", ""],
              ["Quote", "> ", ""],
              ["Link", "[", "](https://example.com)"],
            ].map(([label, before, after]) => (
              <button
                key={label}
                className="clipboard-tool"
                onClick={() => insert(before, after)}
              >
                {label}
              </button>
            ))}
            <select
              aria-label="Insert template"
              className="mode-input"
              value=""
              onChange={(e) =>
                insert(templates[e.target.value as keyof typeof templates])
              }
            >
              <option value="" disabled>
                Insert template…
              </option>
              {Object.keys(templates).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              aria-label="Text transformation"
              className="mode-input"
              value=""
              onChange={(e) => apply(e.target.value as TextTool)}
            >
              <option value="" disabled>
                Transform text…
              </option>
              {[
                "upper",
                "lower",
                "trim",
                "deduplicate",
                "sort",
                "json",
                "compact-json",
                "encode-url",
                "decode-url",
                "encode-base64",
                "decode-base64",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className="mode-input"
              aria-label="Find literal text"
              placeholder="Find literal text"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
            <input
              className="mode-input"
              aria-label="Replacement text"
              placeholder="Replace with"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
            <button
              className="clipboard-tool"
              disabled={!find}
              onClick={() => change(replaceLiteral(value, find, replacement))}
            >
              Replace all ({find ? value.split(find).length - 1 : 0})
            </button>
          </div>
        </>
      )}
      <textarea
        ref={editor}
        aria-label={readOnly ? "Original shared text" : "Write or paste text"}
        className="mode-editor w-full resize-y p-4 font-mono text-sm leading-6"
        style={{
          whiteSpace: wrap ? "pre-wrap" : "pre",
          overflowWrap: wrap ? "anywhere" : "normal",
        }}
        spellCheck={false}
        readOnly={readOnly}
        value={value}
        onChange={(e) => change(e.target.value)}
        placeholder="Write a note, paste your clipboard, import a file, or insert a template…"
        onKeyDown={(e) => {
          if (!readOnly && (e.ctrlKey || e.metaKey) && e.key === "b") {
            e.preventDefault()
            insert("**", "**")
          }
        }}
      />
      <p className="text-xs text-white/55">
        {value.trim() ? value.trim().split(/\s+/u).length.toLocaleString() : 0}{" "}
        words · {Math.ceil(value.trim().split(/\s+/u).length / 200)} min read ·
        Paste requires browser permission. No automatic clipboard monitoring.
      </p>
      {!readOnly && (
        <details className="mode-notice">
          <summary className="cursor-pointer">
            Local drafts · saved only when you choose
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="clipboard-tool" onClick={saveDraft}>
              Save draft in this tab
            </button>
            <button
              className="clipboard-tool"
              onClick={() => setDrafts(readDrafts())}
            >
              Load draft list
            </button>
            <button
              className="clipboard-tool"
              onClick={() => {
                try {
                  sessionStorage.removeItem("flashdrop-clipboard-drafts")
                  setDrafts([])
                  setNotice("Local drafts deleted.")
                } catch {
                  setNotice("Storage unavailable.")
                }
              }}
            >
              Delete all drafts
            </button>
          </div>
          {drafts.map((d) => (
            <button
              key={d.id}
              className="mt-2 block w-full truncate text-left text-sm"
              onClick={() => change(d.text)}
            >
              {d.date} · {d.text.slice(0, 60) || "Empty draft"}
            </button>
          ))}
        </details>
      )}
      <input
        ref={upload}
        hidden
        type="file"
        accept="text/*,.md,.json,.csv,.log,.yaml,.yml"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          try {
            if (file.size > TEXT_MAX_BYTES)
              throw Error("Choose a text file up to 1 MiB.")
            const text = await file.text()
            validateText(text)
            change(text)
            setNotice(
              "Imported locally; nothing is shared until you create a link."
            )
          } catch (error) {
            setNotice((error as Error).message)
          }
        }}
      />
      {notice && (
        <p role="status" className="mode-notice">
          {notice}
        </p>
      )}
    </div>
  )
}
