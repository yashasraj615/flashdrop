export const APP_NAME = "Flashdrop"
export const APP_TAGLINE = "Send files. Simply."
export const APP_DESCRIPTION =
  "Upload a file up to 1 GB and share it with a temporary link that expires after 24 hours."

export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024
export const FILE_TTL_MS = 24 * 60 * 60 * 1000
export const FILE_TTL_HOURS = 24
export const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000

/** 8 MiB parts stay above the S3 5 MiB minimum and keep 1 GB to 128 parts. */
export const PART_SIZE_BYTES = 8 * 1024 * 1024
export const UPLOAD_CONCURRENCY = 4
export const UPLOAD_URL_TTL_SECONDS = 60 * 60
export const DOWNLOAD_URL_TTL_SECONDS = 2 * 60

export const RATE_LIMITS = {
  upload: { limit: 12, windowMs: 60 * 60 * 1000 },
  part: { limit: 2400, windowMs: 60 * 60 * 1000 },
  download: { limit: 60, windowMs: 60 * 60 * 1000 },
  metadata: { limit: 120, windowMs: 60 * 60 * 1000 },
} as const

export function expectedPartCount(fileSize: number, partSize = PART_SIZE_BYTES): number {
  if (fileSize <= 0) return 0
  return Math.ceil(fileSize / partSize)
}

export function partByteRange(index: number, fileSize: number, partSize = PART_SIZE_BYTES) {
  const offset = index * partSize
  const length = Math.min(partSize, fileSize - offset)
  return { offset, length }
}
