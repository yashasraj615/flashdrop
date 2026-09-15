import { fileExtension } from "@/lib/format"

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "document"
  | "code"
  | "file"

const CODE_EXTENSIONS = new Set([
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "cs",
  "php",
  "html",
  "css",
  "json",
  "yml",
  "yaml",
  "md",
  "sql",
  "sh",
])

const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"])
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "pages", "numbers"])

export function fileKind(filename: string, mimeType: string): FileKind {
  const mime = mimeType.toLowerCase()
  const ext = fileExtension(filename)
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime === "application/pdf" || ext === "pdf") return "pdf"
  if (ARCHIVE_EXTENSIONS.has(ext) || mime.includes("zip") || mime.includes("compressed")) return "archive"
  if (CODE_EXTENSIONS.has(ext)) return "code"
  if (DOCUMENT_EXTENSIONS.has(ext) || mime.includes("officedocument") || mime.startsWith("text/")) {
    return "document"
  }
  return "file"
}

export function kindLabel(kind: FileKind, mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.split("+")[0]?.toUpperCase()
  switch (kind) {
    case "image":
      return subtype ? `Image • ${subtype}` : "Image"
    case "video":
      return subtype ? `Video • ${subtype}` : "Video"
    case "audio":
      return subtype ? `Audio • ${subtype}` : "Audio"
    case "pdf":
      return "Document • PDF"
    case "archive":
      return "Archive"
    case "code":
      return "Source code"
    case "document":
      return "Document"
    default:
      return subtype ? `File • ${subtype}` : "File"
  }
}
