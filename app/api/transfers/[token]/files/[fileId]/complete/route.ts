import { RATE_LIMITS } from "@/lib/constants"
import { getFileById } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { completeMultipartUpload, headObject } from "@/lib/storage"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"
import {
  ManageAuthError,
  activateFileAndTransfer,
  assertManager,
  getTransferByToken,
  publicTransferView,
} from "@/lib/transfers"
import { listFilesForTransfer } from "@/lib/files"
import { readManageToken } from "@/lib/upload-session"

export const runtime = "nodejs"
export const maxDuration = 60

type CompletedPart = { partNumber?: number; etag?: string }

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    await enforceRateLimit({
      key: `upload-complete:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const { token, fileId } = await context.params
    const body = (await request.json()) as { parts?: CompletedPart[]; manageToken?: string }
    if (!isPlausibleToken(token)) {
      return jsonError("Upload could not be verified.", 400)
    }

    const transfer = await getTransferByToken(token)
    if (!transfer) return jsonError("This transfer isn't available.", 404)
    assertManager(transfer, readManageToken(request, body))

    const file = await getFileById(fileId)
    if (!file || file.transferId !== transfer.id) {
      return jsonError("This transfer isn't valid.", 404)
    }

    if (file.status !== "active") {
      if (file.multipartUploadId) {
        const parts = (body.parts ?? [])
          .filter(
            (part): part is { partNumber: number; etag: string } =>
              Number.isInteger(part.partNumber) && Boolean(part.etag)
          )
          .map((part) => ({ partNumber: part.partNumber, etag: part.etag }))
        if (!parts.length) {
          return jsonError("Upload couldn't be completed.", 409)
        }
        await completeMultipartUpload({
          key: file.objectKey,
          uploadId: file.multipartUploadId,
          parts,
        })
      }

      let metadata
      try {
        metadata = await headObject(file.objectKey)
      } catch {
        return jsonError("Upload couldn't be completed.", 409)
      }

      if (metadata.size !== file.encryptedSize) {
        logEvent("upload.size_mismatch", {
          token: tokenPreview(token),
          expected: file.encryptedSize,
          actual: metadata.size,
        })
        return jsonError("Upload couldn't be completed.", 409)
      }
    }

    const completed = await activateFileAndTransfer(file.id)
    if (!completed?.transfer) {
      return jsonError("This transfer is no longer available.", 409)
    }

    const files = await listFilesForTransfer(completed.transfer.id)
    logEvent("upload.completed", {
      fileId: file.id,
      token: tokenPreview(token),
      size: file.fileSize,
    })

    return Response.json({
      file: {
        id: file.id,
        filename: file.originalFilename,
        size: file.fileSize,
      },
      transfer: publicTransferView(completed.transfer, files, { includeUploading: true }),
    })
  } catch (error) {
    if (error instanceof ManageAuthError) {
      return jsonError(error.message, 403)
    }
    logError("upload.complete_failed", error)
    return handleRouteError(error)
  }
}
