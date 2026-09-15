export const APP_NAME = "Flashdrop"
export const APP_TAGLINE = "Send files. Simply."
export const APP_DESCRIPTION =
  "Upload a file up to 1 GB and share it with a temporary link that expires after 24 hours."

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024
export const FILE_TTL_MS = 24 * 60 * 60 * 1000
export const FILE_TTL_HOURS = 24
export const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000

/** 512 KiB stays well under Vercel body limits and the Neon HTTP 64 MB query cap. */
export const CHUNK_SIZE_BYTES = 512 * 1024
export const MAX_CHUNK_BYTES = 1024 * 1024
export const UPLOAD_CONCURRENCY = 3

export const RATE_LIMITS = {
  upload: { limit: 12, windowMs: 60 * 60 * 1000 },
  chunk: { limit: 2400, windowMs: 60 * 60 * 1000 },
  download: { limit: 60, windowMs: 60 * 60 * 1000 },
  metadata: { limit: 120, windowMs: 60 * 60 * 1000 },
} as const

export function expectedChunkCount(fileSize: number, chunkSize = CHUNK_SIZE_BYTES): number {
  if (fileSize <= 0) return 0
  return Math.ceil(fileSize / chunkSize)
}

export function chunkByteRange(index: number, fileSize: number, chunkSize = CHUNK_SIZE_BYTES) {
  const offset = index * chunkSize
  const length = Math.min(chunkSize, fileSize - offset)
  return { offset, length }
}

export function isCompleteUpload(
  fileSize: number,
  summary: { chunkCount: number; totalBytes: number },
  chunkSize = CHUNK_SIZE_BYTES
) {
  return summary.chunkCount === expectedChunkCount(fileSize, chunkSize) && summary.totalBytes === fileSize
}
