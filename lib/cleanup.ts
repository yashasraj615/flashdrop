import "server-only"

import { deleteChunks } from "@/lib/chunks"
import {
  deleteFileRecord,
  listCleanupCandidates,
  markDeleting,
  recordCleanupFailure,
  recordCleanupRun,
  type TransferFile,
} from "@/lib/files"
import { logError, logEvent } from "@/lib/logger"
import { pruneRateLimits } from "@/lib/rate-limit"

export type CleanupResult = {
  scanned: number
  deletedObjects: number
  deletedRecords: number
  retried: number
  failed: number
}

async function cleanupOne(file: TransferFile): Promise<"deleted" | "retried" | "failed"> {
  const target = await markDeleting(file.id)
  const current = target ?? file

  try {
    await deleteChunks(current.id)
    await deleteFileRecord(current.id)
    logEvent("cleanup.file_deleted", { fileId: current.id })
    return "deleted"
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed"
    await recordCleanupFailure(current.id, message).catch(() => undefined)
    logError("cleanup.file_failed", error, { fileId: current.id })
    return current.cleanupAttempts > 0 ? "retried" : "failed"
  }
}

export async function runCleanup(): Promise<CleanupResult> {
  logEvent("cleanup.started")
  const stats: CleanupResult = {
    scanned: 0,
    deletedObjects: 0,
    deletedRecords: 0,
    retried: 0,
    failed: 0,
  }

  try {
    const candidates = await listCleanupCandidates(50)
    stats.scanned = candidates.length

    for (const file of candidates) {
      const outcome = await cleanupOne(file)
      if (outcome === "deleted") {
        stats.deletedObjects += 1
        stats.deletedRecords += 1
      } else if (outcome === "retried") {
        stats.retried += 1
        stats.failed += 1
      } else {
        stats.failed += 1
      }
    }

    await pruneRateLimits()
    await recordCleanupRun(stats)
    logEvent("cleanup.completed", stats)
    return stats
  } catch (error) {
    logError("cleanup.failed", error, stats)
    await recordCleanupRun({
      ...stats,
      error: error instanceof Error ? error.message : "Cleanup failed",
    })
    throw error
  }
}
