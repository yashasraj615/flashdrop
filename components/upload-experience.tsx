"use client"

import { useCallback, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpIcon, FileUpIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { SharePanel, type SharePayload } from "@/components/share-panel"
import { FileGlyph } from "@/components/file-glyph"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
  MAX_FILE_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from "@/lib/constants"
import { formatBytes, formatEta, formatSpeed } from "@/lib/format"
import { cn } from "@/lib/utils"

type Phase =
  | "idle"
  | "selected"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "complete"
  | "error"

type ProgressState = {
  loaded: number
  total: number
  percentage: number
  speed: number
}

const STATUS_COPY: Record<Exclude<Phase, "idle" | "selected" | "complete" | "error">, string> = {
  preparing: "Preparing upload",
  uploading: "Uploading",
  finalizing: "Finalizing",
}

export function UploadExperience() {
  const reduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startedAtRef = useRef(0)
  const tokenRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>("idle")
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState>({
    loaded: 0,
    total: 0,
    percentage: 0,
    speed: 0,
  })
  const [transfer, setTransfer] = useState<SharePayload | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    tokenRef.current = null
    setPhase("idle")
    setFile(null)
    setError(null)
    setTransfer(null)
    setProgress({ loaded: 0, total: 0, percentage: 0, speed: 0 })
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const selectFile = useCallback((next: File | undefined) => {
    if (!next) return
    if (next.size > MAX_FILE_SIZE_BYTES) {
      setFile(next)
      setPhase("error")
      setError("That file is larger than 1 GB.")
      return
    }
    if (next.size <= 0) {
      setPhase("error")
      setError("Choose a file to upload.")
      return
    }
    setError(null)
    setFile(next)
    setPhase("selected")
    void startUpload(next)
  }, [])

  async function startUpload(target: File) {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    startedAtRef.current = Date.now()
    setPhase("preparing")
    setProgress({ loaded: 0, total: target.size, percentage: 0, speed: 0 })

    try {
      const initResponse = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: target.name,
          mimeType: target.type || "application/octet-stream",
          size: target.size,
        }),
        signal: abort.signal,
      })
      const initData = (await initResponse.json()) as {
        token?: string
        filename?: string
        mimeType?: string
        error?: string
      }
      if (!initResponse.ok || !initData.token) {
        throw new Error(initData.error || "We couldn't prepare your file. Please try again.")
      }

      tokenRef.current = initData.token
      setPhase("uploading")

      const blob = await upload(`transfers/${initData.token}/${initData.filename}`, target, {
        access: "private",
        multipart: target.size >= MULTIPART_THRESHOLD_BYTES,
        handleUploadUrl: "/api/upload/token",
        clientPayload: JSON.stringify({ token: initData.token, size: target.size }),
        abortSignal: abort.signal,
        contentType: initData.mimeType,
        onUploadProgress(event) {
          const elapsed = (Date.now() - startedAtRef.current) / 1000
          setProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: event.percentage,
            speed: elapsed > 0 ? event.loaded / elapsed : 0,
          })
          if (event.percentage >= 97) setPhase("finalizing")
        },
      })

      setPhase("finalizing")
      const completeResponse = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: initData.token,
          url: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType,
        }),
        signal: abort.signal,
      })
      const completed = (await completeResponse.json()) as SharePayload & { error?: string }
      if (!completeResponse.ok || !completed.shareUrl || !completed.expiresAt) {
        throw new Error(completed.error || "Upload interrupted.")
      }

      setTransfer(completed)
      setPhase("complete")
    } catch (caught) {
      if (abort.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) {
        if (tokenRef.current) {
          void fetch("/api/upload/abort", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: tokenRef.current }),
          })
        }
        return
      }
      const message =
        caught instanceof Error ? caught.message : "Upload interrupted."
      setError(message)
      setPhase("error")
      toast.error(message)
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (phase === "uploading" || phase === "preparing" || phase === "finalizing") return
    const dropped = event.dataTransfer.files[0]
    selectFile(dropped)
  }

  const remainingSeconds =
    progress.speed > 0 ? (progress.total - progress.loaded) / progress.speed : 0
  const statusLabel =
    phase === "uploading" && progress.percentage >= 90
      ? "Almost there"
      : phase === "uploading"
        ? `${Math.round(progress.percentage)}%`
        : phase in STATUS_COPY
          ? STATUS_COPY[phase as keyof typeof STATUS_COPY]
          : ""

  if (phase === "complete" && transfer) {
    return (
      <motion.section
        className="glass-panel rounded-[28px] p-5 sm:p-8"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SharePanel transfer={transfer} onNewTransfer={reset} />
      </motion.section>
    )
  }

  return (
    <section
      className={cn(
        "glass-panel rounded-[28px] p-5 transition-transform duration-200 sm:p-8",
        dragging && "scale-[1.015] ring-2 ring-primary/50"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (phase === "preparing" || phase === "uploading" || phase === "finalizing") return
          inputRef.current?.click()
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-label="Upload a file, up to 1 GB"
        className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-foreground/15 px-4 py-10 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-72"
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <span
          className={cn(
            "mb-4 flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform",
            dragging && "scale-110"
          )}
        >
          {phase === "preparing" || phase === "uploading" || phase === "finalizing" ? (
            <Spinner className="size-6" />
          ) : (
            <FileUpIcon className="size-7" />
          )}
        </span>
        <p className="font-heading text-lg tracking-tight">
          {dragging ? "Drop to upload" : "Drop your file here"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">or choose a file</p>
        <p className="mt-4 text-xs text-muted-foreground">Up to 1 GB · Any file type</p>
      </div>

      {file && phase !== "idle" ? (
        <div className="mt-5 rounded-2xl bg-background/30 p-4 ring-1 ring-foreground/10">
          <div className="flex items-start gap-3">
            <FileGlyph filename={file.name} mimeType={file.type || "application/octet-stream"} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{file.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatBytes(file.size)}
                {file.type ? ` · ${file.type}` : ""}
              </p>
            </div>
            {phase === "uploading" || phase === "preparing" || phase === "finalizing" ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Cancel upload"
                onClick={(event) => {
                  event.stopPropagation()
                  abortRef.current?.abort()
                  reset()
                }}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>

          {phase === "preparing" || phase === "uploading" || phase === "finalizing" ? (
            <div className="mt-4">
              <Progress value={progress.percentage}>
                <div className="flex w-full items-center justify-between text-sm">
                  <span>{statusLabel}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                  </span>
                </div>
              </Progress>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{formatSpeed(progress.speed)}</span>
                <span>
                  {progress.percentage >= 97 ? "Finishing up" : `${formatEta(remainingSeconds)} left`}
                </span>
              </div>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <div className="flex gap-2">
                <Button
                  className="h-10"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (file.size > MAX_FILE_SIZE_BYTES) {
                      inputRef.current?.click()
                      return
                    }
                    void startUpload(file)
                  }}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  className="h-10"
                  onClick={(event) => {
                    event.stopPropagation()
                    reset()
                  }}
                >
                  Choose another file
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "selected" ? (
            <div className="mt-4">
              <Button
                className="h-10"
                onClick={(event) => {
                  event.stopPropagation()
                  void startUpload(file)
                }}
              >
                <ArrowUpIcon data-icon="inline-start" />
                Upload
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
