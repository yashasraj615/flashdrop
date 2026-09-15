import { PART_SIZE_BYTES, RATE_LIMITS, expectedPartCount } from "@/lib/constants"
import { UploadValidationError, createUploadRecord, saveMultipartUploadId } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { createMultipartUpload, signedPutUrl } from "@/lib/storage"
import { tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const body = (await request.json()) as {
      filename?: string
      mimeType?: string
      size?: number
    }

    if (!body.filename || typeof body.size !== "number") {
      return jsonError("Choose a file to upload.", 400)
    }

    const file = await createUploadRecord({
      filename: body.filename,
      mimeType: body.mimeType ?? "application/octet-stream",
      size: body.size,
    })

    const partCount = expectedPartCount(file.fileSize)
    const multipart = file.fileSize > PART_SIZE_BYTES
    let uploadUrl: string | undefined
    let uploadId: string | undefined

    if (multipart) {
      uploadId = await createMultipartUpload({
        key: file.objectKey,
        contentType: file.mimeType,
      })
      await saveMultipartUploadId(file.token, uploadId)
    } else {
      uploadUrl = await signedPutUrl({
        key: file.objectKey,
        contentType: file.mimeType,
      })
    }

    logEvent("upload.started", {
      fileId: file.id,
      token: tokenPreview(file.token),
      size: file.fileSize,
      multipart,
    })

    return Response.json({
      token: file.token,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      size: file.fileSize,
      mode: multipart ? "multipart" : "put",
      partSize: PART_SIZE_BYTES,
      partCount,
      uploadUrl,
      contentType: file.mimeType,
    })
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return jsonError(error.message, error.message.includes("1 GB") ? 413 : 400)
    }
    logError("upload.init_failed", error)
    return handleRouteError(error)
  }
}
