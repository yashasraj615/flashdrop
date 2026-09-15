import { RATE_LIMITS } from "@/lib/constants"
import { shareUrl } from "@/lib/env"
import { getFileByToken, markUploadComplete, publicFileView } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { completeMultipartUpload, headObject } from "@/lib/storage"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"
export const maxDuration = 60

type CompletedPart = { partNumber?: number; etag?: string }

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-complete:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const body = (await request.json()) as { token?: string; parts?: CompletedPart[] }
    if (!body.token || !isPlausibleToken(body.token)) {
      return jsonError("Upload could not be verified.", 400)
    }

    const file = await getFileByToken(body.token)
    if (!file || (file.status !== "uploading" && file.status !== "processing" && file.status !== "active")) {
      return jsonError("This transfer isn't valid.", 404)
    }

    if (file.status !== "active") {
      if (file.multipartUploadId) {
        const parts = (body.parts ?? [])
          .filter((part): part is { partNumber: number; etag: string } =>
            Number.isInteger(part.partNumber) && Boolean(part.etag)
          )
          .map((part) => ({ partNumber: part.partNumber, etag: part.etag }))
        if (!parts.length) {
          return jsonError("Upload interrupted.", 409)
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
        return jsonError("Upload interrupted.", 409)
      }

      if (metadata.size !== file.fileSize) {
        logEvent("upload.size_mismatch", {
          token: tokenPreview(file.token),
          expected: file.fileSize,
          actual: metadata.size,
        })
        return jsonError("Upload interrupted.", 409)
      }
    }

    const completed = await markUploadComplete(file.token)
    if (!completed) {
      return jsonError("This transfer is no longer available.", 409)
    }

    logEvent("upload.completed", {
      fileId: completed.id,
      token: tokenPreview(completed.token),
      size: completed.fileSize,
    })

    return Response.json({
      ...publicFileView(completed),
      shareUrl: shareUrl(completed.token),
    })
  } catch (error) {
    logError("upload.complete_failed", error)
    return handleRouteError(error)
  }
}
