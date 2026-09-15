"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileUpIcon,
  PlusIcon,
  QrCodeIcon,
  Share2Icon,
  XIcon,
} from "lucide-react"

import { Countdown } from "@/components/countdown"
import { FileGlyph } from "@/components/file-glyph"
import { Notice, QuotaHint } from "@/components/notice"
import { downloadQrPng, QrImage } from "@/components/qr-image"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { DecryptError, createTransferSecret, parseTransferSecret } from "@/lib/client-crypto"
import {
  abortFile,
  requestAddFiles,
  requestTransfer,
  uploadEncryptedFiles,
  type UploadFilePlan,
} from "@/lib/client-upload"
import { decryptAndSave, decryptAndSaveAll, type DownloadableFile } from "@/lib/client-download"
import { MAX_TRANSFER_SIZE_BYTES } from "@/lib/constants"
import { fileKind, kindLabel } from "@/lib/file-kind"
import { formatBytes, formatEta, formatSpeed } from "@/lib/format"
import { isPlausibleToken } from "@/lib/token-format"
import { remainingBytes } from "@/lib/quota"
import { readHashSecret, readManageToken, storeManageToken, transferShareUrl } from "@/lib/share-secret"
import { cn } from "@/lib/utils"

type Phase = "loading" | "create" | "uploading" | "ready" | "expired" | "invalid" | "missing-key"

type PublicFile = DownloadableFile & { status?: string }
type PublicTransfer = {
  token: string
  status: string
  totalSize: number
  remaining: number
  limit: number
  fileCount: number
  expiresAt: string | null
  files: PublicFile[]
  isOwner?: boolean
}

function selectionSize(files: File[]) {
  return files.reduce((sum, file) => sum + file.size, 0)
}

export function TransferExperience({ token }: { token?: string }) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startedAtRef = useRef(0)
  const secretRef = useRef<string | null>(null)
  const manageRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>(token ? "loading" : "create")
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<File[]>([])
  const [notice, setNotice] = useState<{ title: string; description: string; action?: string } | null>(null)
  const [progress, setProgress] = useState({ loaded: 0, total: 0, percentage: 0, speed: 0 })
  const [statusText, setStatusText] = useState("Preparing")
  const [transfer, setTransfer] = useState<PublicTransfer | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const used = transfer?.totalSize ?? selectionSize(selected)
  const remaining = remainingBytes(used)

  const shareLink = useMemo(() => {
    if (!transfer?.token || !secretRef.current) return ""
    return transferShareUrl(transfer.token, secretRef.current)
  }, [transfer])

  const loadTransfer = useCallback(async (nextToken: string) => {
    const manage = manageRef.current || readManageToken(nextToken)
    manageRef.current = manage
    const response = await fetch(`/api/transfers/${nextToken}`, {
      headers: manage ? { "x-flashdrop-manage": manage } : undefined,
    })
    const data = (await response.json()) as PublicTransfer & { error?: string; status?: string }
    if (response.status === 410) {
      setPhase("expired")
      setTransfer(null)
      return
    }
    if (!response.ok) {
      setPhase("invalid")
      setTransfer(null)
      return
    }
    setTransfer(data)
    const secret = secretRef.current || readHashSecret()
    secretRef.current = secret
    if (!parseTransferSecret(secret)) {
      setPhase("missing-key")
      return
    }
    setPhase("ready")
  }, [])

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

  useEffect(() => {
    if (!token) return
    if (!isPlausibleToken(token)) {
      setPhase("invalid")
      return
    }
    secretRef.current = readHashSecret()
    manageRef.current = readManageToken(token)
    void loadTransfer(token)
  }, [loadTransfer, token])

  const resetNotice = () => setNotice(null)

  function chooseFiles(list: FileList | File[] | null, extra = false) {
    if (!list) return
    const files = Array.from(list)
    if (!files.length) return
    const current = extra ? selected : []
    const next = extra ? [...current, ...files] : files
    const total = selectionSize(next) + (extra ? 0 : transfer?.totalSize ?? 0)
    const baseUsed = extra ? used : transfer?.totalSize ?? 0
    if (baseUsed + selectionSize(files) > MAX_TRANSFER_SIZE_BYTES) {
      setNotice({
        title: extra ? "That selection is too large for this transfer." : "Transfer limit reached",
        description: `Your transfer has ${formatBytes(remainingBytes(baseUsed))} remaining. Remove a file or choose a smaller selection.`,
        action: "Choose another file",
      })
      return
    }
    void total
    setNotice(null)
    if (extra && transfer) {
      void addFiles(files)
      return
    }
    setSelected(next)
  }

  async function startUpload(files: File[], existing?: { token: string; manageToken: string }) {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    startedAtRef.current = Date.now()
    setPhase("uploading")
    setStatusText("Securing files")
    setProgress({ loaded: 0, total: files.reduce((sum, file) => sum + file.size, 0), percentage: 0, speed: 0 })

    try {
      if (!existing) {
        secretRef.current = createTransferSecret()
      }
      const secret = secretRef.current
      const masterKey = parseTransferSecret(secret)
      if (!secret || !masterKey) throw new Error("Couldn't secure this file.")

      setStatusText("Preparing")
      const created = existing
        ? await requestAddFiles(existing.token, existing.manageToken, files, abort.signal)
        : await requestTransfer(files, abort.signal)

      manageRef.current = existing?.manageToken || created.manageToken
      storeManageToken(created.token, manageRef.current)
      setStatusText("Uploading")

      await uploadEncryptedFiles({
        token: created.token,
        manageToken: manageRef.current,
        masterKey,
        files,
        plans: created.files as UploadFilePlan[],
        signal: abort.signal,
        onProgress: (loaded, total) => {
          const elapsed = (Date.now() - startedAtRef.current) / 1000
          setProgress({
            loaded,
            total,
            percentage: total > 0 ? Math.min(99, (loaded / total) * 100) : 0,
            speed: elapsed > 0 ? loaded / elapsed : 0,
          })
          if (loaded / total > 0.92) setStatusText("Almost there")
        },
      })

      setStatusText("Upload complete")
      setSelected([])
      if (!existing) {
        router.replace(`/t/${created.token}#${secret}`)
      }
      await loadTransfer(created.token)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhase(token ? "ready" : "create")
        setNotice({
          title: "Upload interrupted",
          description: "Nothing incomplete was left behind. You can try again when you're ready.",
          action: "Try again",
        })
        return
      }
      const remainingHint =
        error && typeof error === "object" && "remaining" in error && typeof error.remaining === "number"
          ? ` Your transfer has ${formatBytes(error.remaining)} remaining.`
          : ""
      setPhase(token ? "ready" : "create")
      setNotice({
        title: error instanceof Error && error.message.includes("secure") ? "Couldn't secure this file" : "Upload couldn't be completed",
        description: `${error instanceof Error ? error.message : "Your connection may have been interrupted."}${remainingHint}`,
        action: "Try again",
      })
    }
  }

  async function addFiles(files: File[]) {
    if (!transfer || !manageRef.current) {
      setNotice({
        title: "You can view this transfer, but only the original sender can add files.",
        description: "The share link stays the same. Ask the sender if you need something added.",
      })
      return
    }
    await startUpload(files, { token: transfer.token, manageToken: manageRef.current })
  }

  async function copyLink() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setNotice({
        title: "Couldn't copy the link",
        description: "Select the URL and copy it manually, or use Share instead.",
      })
    }
  }

  async function share() {
    if (!shareLink || !canShare) {
      await copyLink()
      return
    }
    try {
      await navigator.share({
        title: "Flashdrop transfer",
        text: "A temporary encrypted transfer, available for 24 hours.",
        url: shareLink,
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      await copyLink()
    }
  }

  async function downloadFile(file: PublicFile) {
    const secret = parseTransferSecret(secretRef.current || readHashSecret())
    if (!transfer || !secret) {
      setPhase("missing-key")
      return
    }
    setDownloadingId(file.id)
    try {
      await decryptAndSave(transfer.token, file, secret)
    } catch (error) {
      setNotice({
        title: "Unable to decrypt this file.",
        description:
          error instanceof DecryptError
            ? "The download may be incomplete or the transfer link may be invalid."
            : "The download failed. Check your connection and try again.",
        action: "Try again",
      })
    } finally {
      setDownloadingId(null)
    }
  }

  async function downloadAll() {
    if (!transfer) return
    const secret = parseTransferSecret(secretRef.current || readHashSecret())
    if (!secret) {
      setPhase("missing-key")
      return
    }
    setDownloadingId("all")
    try {
      await decryptAndSaveAll(transfer.token, transfer.files, secret)
    } catch (error) {
      setNotice({
        title: "Unable to decrypt this file.",
        description:
          error instanceof DecryptError
            ? "The download may be incomplete or the transfer link may be invalid."
            : "One of the files couldn't be downloaded. Try them individually.",
        action: "Try again",
      })
    } finally {
      setDownloadingId(null)
    }
  }

  function cancelUpload() {
    abortRef.current?.abort()
    if (transfer && manageRef.current) {
      for (const file of transfer.files.filter((item) => item.status !== "active")) {
        void abortFile(transfer.token, manageRef.current, file.id)
      }
    }
  }

  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      chooseFiles(event.dataTransfer.files, Boolean(token || transfer))
    },
  }

  if (phase === "loading") {
    return (
      <GlassCard>
        <div className="flex min-h-40 items-center justify-center">
          <Spinner className="size-6" />
          <span className="sr-only">Loading transfer</span>
        </div>
      </GlassCard>
    )
  }

  if (phase === "expired") {
    return (
      <GlassCard>
        <StatusBlock
          title="This transfer has expired"
          description="Files are automatically removed after 24 hours."
          action="Upload a new file"
          href="/"
        />
      </GlassCard>
    )
  }

  if (phase === "invalid") {
    return (
      <GlassCard>
        <StatusBlock
          title="This transfer isn't available"
          description="The link may have expired or may no longer exist."
          action="Create new transfer"
          href="/"
        />
      </GlassCard>
    )
  }

  if (phase === "missing-key" && transfer) {
    return (
      <GlassCard>
        <StatusBlock
          title="This transfer isn't available"
          description="The link is missing its decryption key. Ask the sender for the full URL, including the part after #."
          action="Create new transfer"
          href="/"
        />
      </GlassCard>
    )
  }

  if (phase === "uploading") {
    const remainingTime = progress.speed > 0 ? (progress.total - progress.loaded) / progress.speed : 0
    return (
      <GlassCard>
        <div className="space-y-5">
          <div>
            <p className="text-sm text-white/55">{statusText}</p>
            <p className="mt-2 font-heading text-3xl tabular-nums tracking-tight">
              {Math.round(progress.percentage)}%
            </p>
          </div>
          <Progress value={progress.percentage} />
          <p className="text-sm text-white/55">
            {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
            {progress.speed > 0 ? ` · ${formatSpeed(progress.speed)} · ${formatEta(remainingTime)} left` : ""}
          </p>
          <Button variant="ghost" className="h-11 w-full" onClick={cancelUpload}>
            <XIcon data-icon="inline-start" />
            Cancel
          </Button>
        </div>
      </GlassCard>
    )
  }

  if (phase === "ready" && transfer) {
    const isOwner = Boolean(transfer.isOwner && manageRef.current)
    return (
      <GlassCard>
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs tracking-[0.18em] text-primary/80 uppercase">Transfer ready</p>
            <h1 className="font-heading text-3xl tracking-tight">
              {transfer.fileCount} {transfer.fileCount === 1 ? "file" : "files"}
            </h1>
            <p className="text-sm text-white/60">
              {formatBytes(transfer.totalSize)} total
              {transfer.expiresAt ? (
                <>
                  {" "}
                  · Available for <Countdown expiresAt={transfer.expiresAt} compact />
                </>
              ) : null}
            </p>
          </div>

          <QuotaHint remaining={transfer.remaining} used={transfer.totalSize} limit={transfer.limit} />

          {notice ? (
            <Notice
              title={notice.title}
              description={notice.description}
              actionLabel={notice.action}
              onAction={resetNotice}
            />
          ) : null}

          <FileRows
            files={transfer.files}
            downloadingId={downloadingId}
            onDownload={downloadFile}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {transfer.files.length > 1 ? (
              <Button className="h-12" onClick={downloadAll} disabled={downloadingId !== null}>
                {downloadingId === "all" ? <Spinner /> : <DownloadIcon data-icon="inline-start" />}
                Download all
              </Button>
            ) : (
              <Button className="h-12" onClick={() => transfer.files[0] && downloadFile(transfer.files[0])} disabled={!transfer.files[0] || downloadingId !== null}>
                {downloadingId && downloadingId !== "all" ? <Spinner /> : <DownloadIcon data-icon="inline-start" />}
                Download file
              </Button>
            )}
            <Button className="h-12" variant="secondary" onClick={copyLink}>
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? "Link copied" : "Copy link"}
            </Button>
            {canShare ? (
              <Button className="h-12" variant="secondary" onClick={share}>
                <Share2Icon data-icon="inline-start" />
                Share
              </Button>
            ) : null}
            <Button className="h-12" variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCodeIcon data-icon="inline-start" />
              Show QR code
            </Button>
            {isOwner ? (
              <Button className="h-12" variant="outline" onClick={() => addInputRef.current?.click()}>
                <PlusIcon data-icon="inline-start" />
                Add files
              </Button>
            ) : null}
          </div>

          <input
            ref={addInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              chooseFiles(event.target.files, true)
              event.currentTarget.value = ""
            }}
          />

          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogContent className="border-white/10 bg-[#12141f]/90 sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Scan to open this transfer</DialogTitle>
                <DialogDescription>
                  This code includes the decryption key. Keep it as private as the link.
                </DialogDescription>
              </DialogHeader>
              {shareLink ? (
                <div className="flex justify-center rounded-3xl bg-white p-4">
                  <QrImage value={shareLink} size={260} className="rounded-xl" />
                </div>
              ) : null}
              <Button variant="outline" className="h-11" onClick={() => shareLink && downloadQrPng(shareLink, "flashdrop-qr.png")}>
                Save QR
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </GlassCard>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 pt-4 sm:pt-10">
      <div className="text-center">
        <p className="text-xs font-medium tracking-[0.22em] text-primary/90 uppercase">Flashdrop</p>
        <h1 className="font-heading mt-4 text-4xl tracking-tight text-balance sm:text-6xl">
          Send files.
          <br />
          Simply.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-white/60 text-pretty sm:text-base">
          Upload up to 1 GB and share it with a temporary link that expires after 24 hours.
        </p>
      </div>

      <GlassCard>
        <motion.div
          animate={dragging && !reduceMotion ? { scale: 1.015 } : { scale: 1 }}
          className={cn(
            "rounded-[28px] border border-dashed border-white/15 px-5 py-10 text-center transition-colors sm:px-8",
            dragging && "border-primary/70 bg-white/4"
          )}
          {...dropHandlers}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => chooseFiles(event.target.files)}
          />
          <FileUpIcon className={cn("mx-auto size-10 text-primary/80 transition-transform", dragging && "scale-110")} />
          <p className="mt-4 text-lg font-medium">Drop your files here</p>
          <p className="mt-1 text-sm text-white/55">or choose files from this device</p>
          <p className="mt-4 text-xs tracking-wide text-white/40 uppercase">Up to 1 GB total</p>
          <Button className="mt-6 h-12 px-8" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
        </motion.div>

        <div className="mt-5">
          <QuotaHint remaining={remaining} used={used} limit={MAX_TRANSFER_SIZE_BYTES} />
        </div>

        {notice ? (
          <div className="mt-5">
            <Notice
              title={notice.title}
              description={notice.description}
              actionLabel={notice.action}
              onAction={() => {
                resetNotice()
                inputRef.current?.click()
              }}
            />
          </div>
        ) : null}

        {selected.length ? (
          <div className="mt-6 space-y-4">
            <FileRows files={selected.map((file) => ({
              id: `${file.name}-${file.size}`,
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              encryptedSize: file.size,
              chunkSize: 0,
            }))} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-12 flex-1" onClick={() => startUpload(selected)}>
                Upload {selected.length} {selected.length === 1 ? "file" : "files"}
              </Button>
              <Button className="h-12" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
      </GlassCard>
    </div>
  )
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-panel w-full rounded-[32px] p-5 sm:p-8">
      {children}
    </div>
  )
}

function StatusBlock({
  title,
  description,
  action,
  href,
}: {
  title: string
  description: string
  action: string
  href: string
}) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
      <p className="text-sm text-white/60">{description}</p>
      <a href={href} className={cn(buttonVariants(), "inline-flex h-12 w-full sm:w-auto")}>
        {action}
      </a>
    </div>
  )
}

function FileRows({
  files,
  downloadingId,
  onDownload,
}: {
  files: PublicFile[]
  downloadingId?: string | null
  onDownload?: (file: PublicFile) => void
}) {
  return (
    <ul className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/8">
      {files.map((file) => {
        const kind = fileKind(file.filename, file.mimeType)
        return (
          <li key={file.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <FileGlyph filename={file.filename} mimeType={file.mimeType} className="size-11 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.filename}</p>
              <p className="mt-0.5 text-xs text-white/50">
                {kindLabel(kind, file.mimeType)} · {formatBytes(file.size)}
              </p>
            </div>
            {onDownload ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0"
                onClick={() => onDownload(file)}
                disabled={downloadingId !== null}
              >
                {downloadingId === file.id ? <Spinner /> : "Download"}
              </Button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
