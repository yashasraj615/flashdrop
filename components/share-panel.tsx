"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, DownloadIcon, QrCodeIcon, Share2Icon } from "lucide-react"
import { toast } from "sonner"

import { Countdown } from "@/components/countdown"
import { FileGlyph } from "@/components/file-glyph"
import { downloadQrPng, QrImage } from "@/components/qr-image"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatBytes } from "@/lib/format"
import { kindLabel, fileKind } from "@/lib/file-kind"
import { cn } from "@/lib/utils"

export type SharePayload = {
  token: string
  filename: string
  mimeType: string
  size: number
  expiresAt: string
  shareUrl: string
}

export function SharePanel({
  transfer,
  onNewTransfer,
}: {
  transfer: SharePayload
  onNewTransfer: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

  async function copyLink() {
    await navigator.clipboard.writeText(transfer.shareUrl)
    setCopied(true)
    toast.success("Link copied")
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function share() {
    if (!canShare) {
      await copyLink()
      return
    }
    try {
      await navigator.share({
        title: transfer.filename,
        text: `Download ${transfer.filename} on Flashdrop. Available for 24 hours.`,
        url: transfer.shareUrl,
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      await copyLink()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <FileGlyph filename={transfer.filename} mimeType={transfer.mimeType} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{transfer.filename}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatBytes(transfer.size)} · {kindLabel(fileKind(transfer.filename, transfer.mimeType), transfer.mimeType)}
          </p>
          <p className="mt-2 text-sm text-primary">
            Available for 24 hours · <Countdown expiresAt={transfer.expiresAt} />
          </p>
        </div>
      </div>

      <div className="flex justify-center rounded-3xl bg-white p-4">
        <QrImage value={transfer.shareUrl} size={220} className="rounded-xl" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Temporary link
        </p>
        <div className="flex items-center gap-2 rounded-2xl bg-background/40 px-3 py-2 ring-1 ring-foreground/10">
          <p className="min-w-0 flex-1 truncate font-mono text-xs">{transfer.shareUrl}</p>
          <Button size="sm" variant="ghost" onClick={copyLink} aria-label="Copy link">
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button className="h-11" onClick={copyLink}>
          <CopyIcon data-icon="inline-start" />
          Copy Link
        </Button>
        {canShare ? (
          <Button className="h-11" variant="secondary" onClick={share}>
            <Share2Icon data-icon="inline-start" />
            Share
          </Button>
        ) : null}
        <Button className="h-11" variant="secondary" onClick={() => setQrOpen(true)}>
          <QrCodeIcon data-icon="inline-start" />
          Show QR
        </Button>
        <a
          href={transfer.shareUrl}
          className={cn(buttonVariants({ variant: "outline" }), "h-11")}
        >
          <DownloadIcon data-icon="inline-start" />
          Download
        </a>
      </div>

      <Button variant="ghost" className="h-11" onClick={onNewTransfer}>
        New Transfer
      </Button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to download</DialogTitle>
            <DialogDescription>
              Point a camera at this code to open the transfer on another device.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center rounded-3xl bg-white p-4">
            <QrImage value={transfer.shareUrl} size={280} className="rounded-xl" />
          </div>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => downloadQrPng(transfer.shareUrl, `${transfer.filename}-qr.png`)}
          >
            Download QR
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
