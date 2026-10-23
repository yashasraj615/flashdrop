"use client"
import { useState } from "react"
import dynamic from "next/dynamic"
import {
  ArrowLeft,
  ArrowUpRight,
  FileUp,
  Images,
  NotebookPen,
  Radio,
} from "lucide-react"
const TransferExperience = dynamic(() =>
  import("@/components/transfer-experience").then((m) => m.TransferExperience)
)
const TextPad = dynamic(() =>
  import("@/components/text-pad").then((m) => m.TextPad)
)
const WideConnect = dynamic(() =>
  import("@/components/wide-connect").then((m) => m.WideConnect)
)
import { MagneticButton } from "@/components/magnetic-button"
const modes = [
  {
    id: "quick",
    name: "Quick Transfer",
    description: "Share any file through a temporary download link.",
    detail: "Up to 1 GB · Temporarily stored",
    icon: FileUp,
    accent: "cyan",
  },
  {
    id: "media",
    name: "Photos & Videos",
    description: "Share original-quality images and videos in one link.",
    detail: "Up to 1 GB · Temporarily stored",
    icon: Images,
    accent: "mint",
  },
  {
    id: "text",
    name: "Text Pad",
    description: "Share Markdown, notes, code, and plain text.",
    detail: "Up to 15,000 lines · Temporary sharing",
    icon: NotebookPen,
    accent: "blue",
  },
  {
    id: "wide",
    name: "Wide Connect",
    description: "Transfer massive files directly between connected devices.",
    detail: "Up to 20 GB · No file payload stored on Flashdrop",
    icon: Radio,
    accent: "teal",
  },
] as const
export function ModeHome() {
  const [mode, setMode] = useState<string | null>(null),
    [backMessage, setBackMessage] = useState("")
  if (mode)
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-6">
        <MagneticButton
          variant="ghost"
          onClick={() => {
            if (document.querySelector('[data-transfer-active="true"]')) {
              setBackMessage(
                "Pause or end the active transfer before switching modes."
              )
              return
            }
            history.replaceState(null, "", "/")
            setBackMessage("")
            setMode(null)
          }}
        >
          <ArrowLeft className="size-4" /> All transfer modes
        </MagneticButton>
        {backMessage && (
          <p role="status" className="mode-notice">
            {backMessage}
          </p>
        )}
        {mode === "text" ? (
          <TextPad />
        ) : mode === "wide" ? (
          <WideConnect />
        ) : (
          <TransferExperience mode={mode === "media" ? "media" : "quick"} />
        )}
      </div>
    )
  return (
    <div className="py-8 sm:py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="eyebrow">Less friction. More connection.</p>
        <h1 className="mt-5 text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
          Good things.
          <br />
          <span className="text-primary">Worth sharing.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-lg text-base leading-7 text-white/65">
          A file, a moment, an idea. Four ways to send it wherever it needs to
          go.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {modes.map(
          ({ id, name, description, detail, icon: Icon, accent }, i) => (
            <button
              key={id}
              data-magnetic
              data-accent={accent}
              onClick={() => setMode(id)}
              className="mode-card group text-left"
            >
              <div className="flex items-start justify-between">
                <span className="mode-icon">
                  <Icon className="size-6" />
                </span>
                <span className="text-xs text-white/35 tabular-nums">
                  0{i + 1}{" "}
                  <ArrowUpRight className="ml-3 inline size-4 text-white/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
              <h2 className="mt-6 text-2xl font-medium tracking-tight">
                {name}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/65">
                {description}
              </p>
              <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-primary/85">
                {detail}
              </p>
            </button>
          )
        )}
      </div>
      <p className="mt-7 text-center text-xs leading-6 text-white/50">
        Temporary links for everyday sharing. A live connection for the big
        stuff.
        <br />
        You choose how your content travels.
      </p>
    </div>
  )
}
