import { RATE_LIMITS } from "@/lib/constants"
import { runCleanup } from "@/lib/cleanup"
import { getFileById, publicFileStatus, recordFileDownload } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { signedDownloadUrl } from "@/lib/storage"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"
import {
  getTransferByToken,
  markTransferExpired,
  publicTransferStatus,
  recordTransferDownload,
} from "@/lib/transfers"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    await enforceRateLimit({
      key: `download:${clientIp(request)}`,
      ...RATE_LIMITS.download,
    })

    const { token, fileId } = await context.params
    if (!isPlausibleToken(token)) {
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    const transfer = await getTransferByToken(token)
    if (!transfer) {
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    const status = publicTransferStatus(transfer)
    if (status === "expired") {
      if (transfer.status === "active") await markTransferExpired(transfer.id)
      logEvent("download.expired", { token: tokenPreview(token) })
      void runCleanup().catch((error) => logError("cleanup.opportunistic_failed", error))
      return jsonError("This transfer has expired.", 410, { status: "expired" })
    }
    if (status !== "active") {
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    const file = await getFileById(fileId)
    if (!file || file.transferId !== transfer.id || publicFileStatus(file) !== "active") {
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    const url = await signedDownloadUrl({
      key: file.objectKey,
      filename: file.originalFilename,
      contentType: "application/octet-stream",
    })

    void recordFileDownload(file.id).catch((error) => logError("download.count_failed", error))
    void recordTransferDownload(transfer.id).catch((error) => logError("download.count_failed", error))
    logEvent("download.initiated", {
      fileId: file.id,
      token: tokenPreview(token),
      size: file.fileSize,
    })

    return Response.json({
      url,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      size: file.fileSize,
      encryptedSize: file.encryptedSize,
      chunkSize: file.chunkSize,
      encryptionVersion: file.encryptionVersion,
    })
  } catch (error) {
    logError("download.failed", error)
    return handleRouteError(error)
  }
}
