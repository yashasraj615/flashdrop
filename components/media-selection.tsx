"use client"
import { useEffect, useState } from "react"
import { MagneticButton } from "@/components/magnetic-button"
import { formatBytes } from "@/lib/format"
export function MediaSelection({
  files,
  onRemove,
}: {
  files: File[]
  onRemove: (index: number) => void
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((file, index) => (
        <MediaItem
          key={`${file.name}-${file.size}-${index}`}
          file={file}
          onRemove={() => onRemove(index)}
        />
      ))}
    </ul>
  )
}
function MediaItem({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("")
  const [previewError, setPreviewError] = useState(false)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    // Object URLs are browser resources and must be created/revoked with the component lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <li className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      {previewError ? (
        <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-white/60">
          Preview unavailable. The original file will be shared.
        </div>
      ) : file.type.startsWith("video/") ? (
        <video
          src={url}
          controls
          preload="metadata"
          onError={() => setPreviewError(true)}
          className="aspect-square w-full object-contain"
          aria-label={`Preview ${file.name}`}
        />
      ) : (
        <img
          src={url}
          alt={file.name}
          onError={() => setPreviewError(true)}
          className="aspect-square w-full object-cover"
        />
      )}
      <div className="p-3">
        <p className="truncate text-xs" title={file.name}>
          {file.name}
        </p>
        <p className="mt-1 text-xs text-white/55">
          {formatBytes(file.size)} · Original
        </p>
        <MagneticButton
          className="mt-2 w-full"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
        >
          Remove
        </MagneticButton>
      </div>
    </li>
  )
}
