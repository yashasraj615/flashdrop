"use client"

import { useEffect, useMemo, useState } from "react"
import { DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { Countdown } from "@/components/countdown"
import { FileGlyph } from "@/components/file-glyph"
import { Button, buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { fileKind, kindLabel } from "@/lib/file-kind"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

export function DownloadView({
  token,
  filename,
  mimeType,
  size,
  expiresAt,
}: {
  token: string
  filename: string
  mimeType: string
  size: number
  expiresAt: string
}) {
  const [busy, setBusy] = useState(false)
  const kind = useMemo(() => fileKind(filename, mimeType), [filename, mimeType])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void download()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [token])

  async function download() {
    setBusy(true)
    try {
      const response = await fetch(`/api/download/${token}`)
      const data = (await response.json()) as { url?: string; error?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.error || "We couldn't prepare your file. Please try again.")
      }
      window.location.assign(data.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-panel mx-auto w-full max-w-lg rounded-[28px] p-6 sm:p-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <FileGlyph filename={filename} mimeType={mimeType} className="size-16 rounded-3xl" />
        <div className="min-w-0">
          <h1 className="font-heading truncate text-xl tracking-tight">{filename}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatBytes(size)} · {kindLabel(kind, mimeType)}
          </p>
        </div>
        <p className="text-sm text-primary">
          Available for <Countdown expiresAt={expiresAt} />
        </p>
        <Button className="h-12 w-full max-w-xs text-base" onClick={download} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
          {busy ? "Preparing download" : "Download File"}
        </Button>
      </div>
    </div>
  )
}

export function TransferUnavailable({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="glass-panel mx-auto w-full max-w-lg rounded-[28px] p-8 text-center">
      <h1 className="font-heading text-2xl tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      <a href="/" className={cn(buttonVariants(), "mt-6 inline-flex h-11")}>
        Send a file
      </a>
    </div>
  )
}
