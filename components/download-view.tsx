"use client"

import { useEffect, useMemo } from "react"
import { DownloadIcon } from "lucide-react"

import { Countdown } from "@/components/countdown"
import { FileGlyph } from "@/components/file-glyph"
import { buttonVariants } from "@/components/ui/button"
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
  const kind = useMemo(() => fileKind(filename, mimeType), [filename, mimeType])
  const href = `/api/download/${token}`

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        window.location.assign(href)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [href])

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
        <a href={href} className={cn(buttonVariants(), "h-12 w-full max-w-xs text-base")}>
          <DownloadIcon data-icon="inline-start" />
          Download File
        </a>
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
        Upload a new file
      </a>
    </div>
  )
}
