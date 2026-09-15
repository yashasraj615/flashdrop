export const APP_NAME = "Flashdrop"
export const APP_TAGLINE = "Send files. Simply."
export const APP_DESCRIPTION =
  "Upload up to 1 GB and share it with a temporary link that expires after 24 hours."

export const MAX_TRANSFER_SIZE_BYTES = 1024 * 1024 * 1024
/** @deprecated Use MAX_TRANSFER_SIZE_BYTES. Kept for existing tests. */
export const MAX_FILE_SIZE_BYTES = MAX_TRANSFER_SIZE_BYTES
export const MAX_FILES_PER_TRANSFER = 100
export const FILE_TTL_MS = 24 * 60 * 60 * 1000
export const FILE_TTL_HOURS = 24
export const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000

export const GCM_IV_BYTES = 12
export const GCM_TAG_BYTES = 16
export const ENCRYPTION_OVERHEAD_PER_CHUNK = GCM_IV_BYTES + GCM_TAG_BYTES
export const ENCRYPTION_VERSION = "v1"

/** 8 MiB ciphertext parts stay above the S3 5 MiB minimum. */
export const PART_SIZE_BYTES = 8 * 1024 * 1024
export const ENCRYPTION_CHUNK_BYTES = PART_SIZE_BYTES - ENCRYPTION_OVERHEAD_PER_CHUNK
export const UPLOAD_CONCURRENCY = 4
export const UPLOAD_URL_TTL_SECONDS = 60 * 60
export const DOWNLOAD_URL_TTL_SECONDS = 2 * 60

export const RATE_LIMITS = {
  upload: { limit: 20, windowMs: 60 * 60 * 1000 },
  part: { limit: 2400, windowMs: 60 * 60 * 1000 },
  download: { limit: 120, windowMs: 60 * 60 * 1000 },
  metadata: { limit: 180, windowMs: 60 * 60 * 1000 },
} as const

export function chunkCount(fileSize: number, chunkSize = ENCRYPTION_CHUNK_BYTES): number {
  if (fileSize <= 0) return 0
  return Math.ceil(fileSize / chunkSize)
}

export function encryptedSize(fileSize: number, chunkSize = ENCRYPTION_CHUNK_BYTES): number {
  return fileSize + chunkCount(fileSize, chunkSize) * ENCRYPTION_OVERHEAD_PER_CHUNK
}

export function expectedPartCount(fileSize: number, partSize = PART_SIZE_BYTES): number {
  if (fileSize <= 0) return 0
  return Math.ceil(fileSize / partSize)
}

export function partByteRange(index: number, fileSize: number, partSize = PART_SIZE_BYTES) {
  const offset = index * partSize
  const length = Math.min(partSize, fileSize - offset)
  return { offset, length }
}

export function plaintextChunkRange(index: number, fileSize: number, chunkSize = ENCRYPTION_CHUNK_BYTES) {
  const offset = index * chunkSize
  const length = Math.min(chunkSize, fileSize - offset)
  return { offset, length }
}

export function encryptedChunkLength(plaintextLength: number) {
  return plaintextLength + ENCRYPTION_OVERHEAD_PER_CHUNK
}
