import { FILE_TTL_MS, STALE_UPLOAD_MS } from "@/lib/constants"

export type FileLifecycleStatus =
  | "uploading"
  | "processing"
  | "active"
  | "expired"
  | "deleting"
  | "deleted"
  | "failed"

export type CleanupCandidate = {
  status: FileLifecycleStatus
  expiresAt: Date | string | null
  createdAt: Date | string
}

export function expirationFrom(uploadedAt: Date, ttlMs = FILE_TTL_MS): Date {
  return new Date(uploadedAt.getTime() + ttlMs)
}

export function isPastExpiration(
  now: Date,
  expiresAt: Date | string | null | undefined
): boolean {
  if (!expiresAt) return false
  return now.getTime() >= new Date(expiresAt).getTime()
}

export function isDownloadable(params: {
  now: Date
  status: FileLifecycleStatus
  expiresAt: Date | string | null
}): boolean {
  if (params.status !== "active") return false
  return !isPastExpiration(params.now, params.expiresAt)
}

export function shouldCleanup(record: CleanupCandidate, now: Date): boolean {
  if (record.status === "deleted") return false
  if (record.status === "failed" || record.status === "deleting" || record.status === "expired") {
    return true
  }
  if (record.status === "active" && isPastExpiration(now, record.expiresAt)) {
    return true
  }
  if (record.status === "uploading" || record.status === "processing") {
    return now.getTime() - new Date(record.createdAt).getTime() >= STALE_UPLOAD_MS
  }
  return false
}

export function remainingMs(now: Date, expiresAt: Date | string): number {
  return Math.max(0, new Date(expiresAt).getTime() - now.getTime())
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired"
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  if (minutes > 0) return `${minutes}m ${seconds}s remaining`
  return `${seconds}s remaining`
}
