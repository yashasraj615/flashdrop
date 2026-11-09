"use client"
import { useMemo, useRef, useState } from "react"
import {
  transformText,
  replaceLiteral,
  type TextTool,
} from "@/lib/clipboard-tools"
import { Toolbar } from "@base-ui/react/toolbar"
import { ActionMenu } from "@/components/editor-controls"
import {
  ClipboardPaste,
  Copy,
  FileUp,
  Download,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Heading2,
  Code,
  SquareCode,
  ListTodo,
  Quote,
  Link2,
  Search,
  X,
  WrapText,
  TextSelect,
  FileText,
  NotebookPen,
  Table2,
  Braces,
  CaseUpper,
  CaseLower,
  ListFilter,
  ArrowDownAZ,
  Link as LinkIcon,
  Binary,
  Eraser,
  FolderOpen,
  Save,
  Trash2,
  ChevronRight,
  MoreHorizontal,
  WandSparkles,
  LayoutTemplate,
  Check,
  LockKeyhole,
} from "lucide-react"
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
  const words = useMemo(
    () => (value.trim() ? value.trim().split(/\s+/u).length : 0),
    [value]
  )
  const editor = useRef<HTMLTextAreaElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [undo, setUndo] = useState<string[]>([])
  const [redo, setRedo] = useState<string[]>([])
  const [finding, setFinding] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const selection = useRef({ start: 0, end: 0 })
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
    setUndo((previous) => [...previous, value].slice(-12))
    setRedo([])
    onChange(next)
  }
  function insert(before: string, after = "") {
    const el = editor.current
    if (!el) return
    const { start, end } = selection.current
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
      selection.current = {
        start: start + before.length,
        end: end + before.length,
      }
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
  const fileActions = [
    ...(!readOnly
      ? [
          {
            label: "Import a text file",
            icon: FileUp,
            action: () => upload.current?.click(),
            description: "TXT, Markdown, JSON or code",
          },
        ]
      : []),
    {
      label: "Export Markdown",
      icon: Download,
      action: exportFile,
      description: "Download an original .md copy",
    },
    {
      label: "Select all text",
      icon: TextSelect,
      action: () => {
        editor.current?.focus()
        editor.current?.select()
      },
    },
    ...(!readOnly
      ? [
          {
            label: "Save a local draft",
            icon: Save,
            action: saveDraft,
            description: "Private to this browser tab",
          },
          {
            label: "Browse local drafts",
            icon: FolderOpen,
            action: () => {
              setDrafts(readDrafts())
              setShowDrafts((v) => !v)
            },
          },
        ]
      : []),
  ]
  const transforms: {
    label: string
    icon: typeof CaseUpper
    tool: TextTool
    description?: string
  }[] = [
    { label: "UPPERCASE", icon: CaseUpper, tool: "upper" },
    { label: "lowercase", icon: CaseLower, tool: "lower" },
    { label: "Clean whitespace", icon: Eraser, tool: "trim" },
    { label: "Remove duplicate lines", icon: ListFilter, tool: "deduplicate" },
    { label: "Sort lines A–Z", icon: ArrowDownAZ, tool: "sort" },
    { label: "Format JSON", icon: Braces, tool: "json" },
    { label: "Minify JSON", icon: Braces, tool: "compact-json" },
    { label: "URL encode", icon: LinkIcon, tool: "encode-url" },
    { label: "URL decode", icon: LinkIcon, tool: "decode-url" },
    { label: "Base64 encode", icon: Binary, tool: "encode-base64" },
    { label: "Base64 decode", icon: Binary, tool: "decode-base64" },
  ]
  const formatting = [
    {
      label: "Bold",
      icon: Bold,
      before: "**",
      after: "**",
      shortcut: "⌘/Ctrl B",
    },
    { label: "Italic", icon: Italic, before: "_", after: "_" },
    { label: "Heading", icon: Heading2, before: "## ", after: "" },
    { label: "Inline code", icon: Code, before: "`", after: "`" },
    {
      label: "Link",
      icon: Link2,
      before: "[",
      after: "](https://example.com)",
    },
  ]
  return (
    <div className="editor-studio">
      <div className="editor-document-bar">
        <div className="flex min-w-0 items-center gap-3">
          <span className="editor-document-icon">
            <FileText size={20} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-white/90">
              {readOnly ? "Shared document" : "Untitled document"}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
              <LockKeyhole size={11} aria-hidden />
              {readOnly
                ? "Read-only original"
                : "Only shared when you create a link"}
            </p>
          </div>
        </div>
        <div className="editor-document-actions">
          {!readOnly && (
            <button
              className="editor-action editor-action-primary"
              onClick={paste}
            >
              <ClipboardPaste size={16} aria-hidden />
              Paste<span className="hidden sm:inline"> clipboard</span>
            </button>
          )}
          <button
            className="editor-action"
            disabled={!value}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value)
                setNotice("Copied to clipboard.")
              } catch {
                setNotice("Select the text and copy it manually.")
              }
            }}
          >
            <Copy size={16} aria-hidden />
            Copy
          </button>
          <ActionMenu label="File" icon={MoreHorizontal} items={fileActions} />
        </div>
      </div>
      <Toolbar.Root
        className="editor-format-bar"
        aria-label="Document formatting and tools"
      >
        {!readOnly && (
          <>
            <Toolbar.Group
              className="editor-tool-group"
              aria-label="Edit history"
            >
              <Toolbar.Button
                className="editor-icon-button"
                aria-label="Undo"
                title="Undo"
                disabled={!undo.length}
                onClick={() => {
                  const previous = undo[undo.length - 1]
                  if (previous !== undefined) {
                    setUndo(undo.slice(0, -1))
                    setRedo([...redo, value])
                    onChange(previous)
                  }
                }}
              >
                <Undo2 size={17} />
              </Toolbar.Button>
              <Toolbar.Button
                className="editor-icon-button"
                aria-label="Redo"
                title="Redo"
                disabled={!redo.length}
                onClick={() => {
                  const next = redo[redo.length - 1]
                  if (next !== undefined) {
                    setRedo(redo.slice(0, -1))
                    setUndo([...undo, value].slice(-12))
                    onChange(next)
                  }
                }}
              >
                <Redo2 size={17} />
              </Toolbar.Button>
            </Toolbar.Group>
            <Toolbar.Separator className="editor-tool-divider" />
            <Toolbar.Group
              className="editor-tool-group"
              aria-label="Text formatting"
            >
              {formatting.map(
                ({ label, icon: Icon, before, after, shortcut }) => (
                  <Toolbar.Button
                    key={label}
                    className="editor-icon-button"
                    aria-label={label}
                    title={shortcut ? `${label} (${shortcut})` : label}
                    onClick={() => insert(before, after)}
                  >
                    <Icon size={17} />
                  </Toolbar.Button>
                )
              )}
            </Toolbar.Group>
            <Toolbar.Separator className="editor-tool-divider" />
            <ActionMenu
              toolbar
              label="Insert"
              icon={LayoutTemplate}
              items={[
                {
                  label: "Task list",
                  icon: ListTodo,
                  action: () => insert("- [ ] "),
                },
                {
                  label: "Block quote",
                  icon: Quote,
                  action: () => insert("> "),
                },
                {
                  label: "Code block",
                  icon: SquareCode,
                  action: () => insert("\n```\n", "\n```\n"),
                },
                {
                  label: "Note template",
                  icon: NotebookPen,
                  action: () => insert(templates.note),
                  description: "Summary and next steps",
                },
                {
                  label: "Meeting template",
                  icon: FileText,
                  action: () => insert(templates.meeting),
                  description: "Agenda, decisions and actions",
                },
                {
                  label: "Table template",
                  icon: Table2,
                  action: () => insert(templates.table),
                  description: "A ready-to-edit Markdown table",
                },
              ]}
            />
            <ActionMenu
              toolbar
              label="Transform"
              icon={WandSparkles}
              items={transforms.map((t) => ({
                label: t.label,
                icon: t.icon,
                action: () => apply(t.tool),
              }))}
            />
          </>
        )}
        <Toolbar.Group
          className="editor-tool-group ml-auto"
          aria-label="View options"
        >
          {!readOnly && (
            <Toolbar.Button
              className="editor-icon-button"
              aria-label="Find and replace"
              title="Find and replace"
              aria-pressed={finding}
              onClick={() => setFinding(!finding)}
            >
              <Search size={17} />
            </Toolbar.Button>
          )}
          <Toolbar.Button
            className="editor-icon-button"
            aria-label="Toggle line wrap"
            title="Toggle line wrap"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={17} />
          </Toolbar.Button>
        </Toolbar.Group>
      </Toolbar.Root>
      {finding && !readOnly && (
        <div className="editor-find-panel">
          <label className="editor-field">
            <span>Find</span>
            <div className="editor-input-wrap">
              <Search size={15} aria-hidden />
              <input
                autoFocus
                aria-label="Find literal text"
                placeholder="Find in document…"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
              <span className="editor-match-count">
                {find ? value.split(find).length - 1 : 0}
              </span>
            </div>
          </label>
          <label className="editor-field">
            <span>Replace with</span>
            <div className="editor-input-wrap">
              <input
                aria-label="Replacement text"
                placeholder="Replacement text…"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </div>
          </label>
          <button
            className="editor-action"
            disabled={!find || !value.includes(find)}
            onClick={() => change(replaceLiteral(value, find, replacement))}
          >
            Replace all
            <ChevronRight size={14} />
          </button>
          <button
            className="editor-icon-button"
            aria-label="Close find and replace"
            onClick={() => setFinding(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="editor-canvas-label">
        <span>{readOnly ? "ORIGINAL CONTENT" : "YOUR WORKSPACE"}</span>
        <span>Plain text · Markdown supported</span>
      </div>
      <textarea
        ref={editor}
        aria-label={readOnly ? "Original shared text" : "Write or paste text"}
        className="editor-canvas"
        style={{
          whiteSpace: wrap ? "pre-wrap" : "pre",
          overflowWrap: wrap ? "anywhere" : "normal",
        }}
        spellCheck={false}
        readOnly={readOnly}
        value={value}
        onChange={(e) => change(e.target.value)}
        onSelect={(e) => {
          selection.current = {
            start: e.currentTarget.selectionStart,
            end: e.currentTarget.selectionEnd,
          }
        }}
        placeholder="Start with a thought. Paste a snippet. Make it yours."
        onKeyDown={(e) => {
          if (!readOnly && (e.ctrlKey || e.metaKey) && e.key === "b") {
            e.preventDefault()
            insert("**", "**")
          }
        }}
      />
      <div className="editor-status-bar">
        <span>
          {words.toLocaleString()} words
          <span className="mx-2 opacity-40">/</span>
          {value.length.toLocaleString()} characters
        </span>
        <span>
          {wrap ? "Wrap on" : "Wrap off"}
          <span className="mx-2 opacity-40">/</span>
          {Math.ceil(words / 200)} min read
        </span>
      </div>
      {showDrafts && !readOnly && (
        <div className="editor-draft-panel">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <FolderOpen size={16} />
              Local drafts
            </span>
            <button
              className="editor-icon-button"
              aria-label="Close drafts"
              onClick={() => setShowDrafts(false)}
            >
              <X size={15} />
            </button>
          </div>
          <p className="mb-3 text-xs text-white/45">
            Saved only in this tab. Never included in shared links.
          </p>
          {!drafts.length && (
            <p className="text-sm text-white/60">
              No drafts yet. Save one from the File menu.
            </p>
          )}
          {drafts.map((d) => (
            <button
              key={d.id}
              className="editor-draft-item"
              onClick={() => change(d.text)}
            >
              <FileText size={16} />
              <span className="min-w-0 flex-1 truncate">
                {d.text.slice(0, 60) || "Empty document"}
                <small className="mt-1 block text-white/40">{d.date}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
          {drafts.length > 0 && (
            <button
              className="mt-3 flex items-center gap-2 text-xs text-rose-300"
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
              <Trash2 size={14} />
              Delete local drafts
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="editor-feedback">
          <Check size={14} aria-hidden />
          {notice}
        </p>
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
    </div>
  )
}
