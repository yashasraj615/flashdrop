import { MAX_FILES_PER_TRANSFER, MAX_TRANSFER_SIZE_BYTES } from "@/lib/constants"

export class QuotaError extends Error {
  remaining: number
  used: number
  requested: number

  constructor(message: string, remaining: number, used: number, requested: number) {
    super(message)
    this.name = "QuotaError"
    this.remaining = remaining
    this.used = used
    this.requested = requested
  }
}

export function remainingBytes(used: number, limit = MAX_TRANSFER_SIZE_BYTES) {
  return Math.max(0, limit - Math.max(0, used))
}

export function assertFitsQuota(params: {
  used: number
  requested: number
  fileCount: number
  additionalFiles: number
  limit?: number
  maxFiles?: number
}) {
  const limit = params.limit ?? MAX_TRANSFER_SIZE_BYTES
  const maxFiles = params.maxFiles ?? MAX_FILES_PER_TRANSFER
  const remaining = remainingBytes(params.used, limit)

  if (params.fileCount + params.additionalFiles > maxFiles) {
    throw new QuotaError(
      `A transfer can include up to ${maxFiles} files.`,
      remaining,
      params.used,
      params.requested
    )
  }

  if (params.requested <= 0) {
    throw new QuotaError("Choose at least one file.", remaining, params.used, params.requested)
  }

  if (params.requested > remaining) {
    throw new QuotaError(
      remaining === 0
        ? "This transfer already contains 1 GB of files."
        : `That selection is too large for this transfer.`,
      remaining,
      params.used,
      params.requested
    )
  }
}
