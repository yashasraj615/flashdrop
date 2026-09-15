import "server-only"

import { abortMultipartUpload, deleteObject } from "@/lib/storage"
import { listFilesForTransfer, type TransferFile } from "@/lib/files"
import { logError, logEvent } from "@/lib/logger"
import { pruneRateLimits } from "@/lib/rate-limit"
import {
  deleteTransferRecord,
  listCleanupCandidates,
  markTransferDeleting,
  recordCleanupFailure,
  recordCleanupRun,
  type TransferRecord,
} from "@/lib/transfers"

export type CleanupResult = {
  scanned: number
  deletedObjects: number
  deletedRecords: number
  retried: number
  failed: number
}

async function removeStoredObject(file: TransferFile) {
  if (file.multipartUploadId) {
    await abortMultipartUpload(file.objectKey, file.multipartUploadId).catch(() => undefined)
  }
  await deleteObject(file.objectKey)
}

async function cleanupOne(transfer: TransferRecord): Promise<"deleted" | "retried" | "failed"> {
  const target = await markTransferDeleting(transfer.id)
  const current = target ?? transfer
  const files = await listFilesForTransfer(current.id)

  try {
    for (const file of files) {
      await removeStoredObject(file)
    }
    await deleteTransferRecord(current.id)
    logEvent("cleanup.transfer_deleted", { transferId: current.id, files: files.length })
    return "deleted"
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed"
    await recordCleanupFailure(current.id, message).catch(() => undefined)
    logError("cleanup.transfer_failed", error, { transferId: current.id })
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

    for (const transfer of candidates) {
      const files = await listFilesForTransfer(transfer.id)
      const outcome = await cleanupOne(transfer)
      if (outcome === "deleted") {
        stats.deletedObjects += files.length
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
