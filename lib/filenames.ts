const MAX_FILENAME_LENGTH = 180

export function sanitizeFilename(input: string | null | undefined): string {
  const raw = (input ?? "").toString()
  const base = raw.split(/[/\\]/).pop()?.trim() || "file"
  const withoutControls = base.replace(/[\u0000-\u001f\u007f]/g, "")
  const cleaned = withoutControls.replace(/[<>:"|?*]/g, "_").replace(/\s+/g, " ").trim()
  const strippedDots = cleaned.replace(/^\.+/, "") || "file"
  const truncated = strippedDots.slice(0, MAX_FILENAME_LENGTH)
  if (truncated === "." || truncated === "..") return "file"
  return truncated || "file"
}

export function storageContentType(mimeType: string | null | undefined): string {
  const mime = (mimeType || "application/octet-stream").split(";")[0]!.trim().toLowerCase()
  if (
    mime.includes("html") ||
    mime.includes("javascript") ||
    mime === "image/svg+xml" ||
    mime === "application/xml" ||
    mime === "text/xml" ||
    mime === "application/xhtml+xml"
  ) {
    return "application/octet-stream"
  }
  if (!mime || mime === "null" || mime === "undefined") {
    return "application/octet-stream"
  }
  return mime
}
