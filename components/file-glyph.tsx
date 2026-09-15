import {
  ArchiveIcon,
  AudioLinesIcon,
  FileCode2Icon,
  FileIcon,
  FileTextIcon,
  FilmIcon,
  ImageIcon,
} from "lucide-react"

import { fileKind, type FileKind } from "@/lib/file-kind"
import { cn } from "@/lib/utils"

const ICONS: Record<FileKind, typeof FileIcon> = {
  image: ImageIcon,
  video: FilmIcon,
  audio: AudioLinesIcon,
  pdf: FileTextIcon,
  archive: ArchiveIcon,
  document: FileTextIcon,
  code: FileCode2Icon,
  file: FileIcon,
}

export function FileGlyph({
  filename,
  mimeType,
  className,
}: {
  filename: string
  mimeType: string
  className?: string
}) {
  const kind = fileKind(filename, mimeType)
  const Icon = ICONS[kind]
  return (
    <span
      className={cn(
        "flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20",
        className
      )}
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  )
}
