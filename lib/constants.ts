export const APP_NAME = "Flashdrop"
export const APP_TAGLINE = "Send files. Simply."
export const APP_DESCRIPTION =
  "Upload a file up to 1 GB and share it with a temporary link that expires after 24 hours."

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024
export const FILE_TTL_MS = 24 * 60 * 60 * 1000
export const FILE_TTL_HOURS = 24
export const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000
export const DOWNLOAD_URL_TTL_MS = 2 * 60 * 1000
export const UPLOAD_TOKEN_TTL_MS = 2 * 60 * 60 * 1000
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024

export const RATE_LIMITS = {
  upload: { limit: 12, windowMs: 60 * 60 * 1000 },
  download: { limit: 60, windowMs: 60 * 60 * 1000 },
  metadata: { limit: 120, windowMs: 60 * 60 * 1000 },
} as const

export const DANGEROUS_MIME_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
] as const
