import { CHUNK_SIZE_BYTES, MAX_FILE_SIZE_BYTES, RATE_LIMITS, expectedChunkCount } from "@/lib/constants"
import { UploadValidationError, createUploadRecord } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
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

    if (body.size > MAX_FILE_SIZE_BYTES) {
      return jsonError("That file is larger than 1 GB.", 413)
    }

    const file = await createUploadRecord({
      filename: body.filename,
      mimeType: body.mimeType ?? "application/octet-stream",
      size: body.size,
    })

    logEvent("upload.started", {
      fileId: file.id,
      token: tokenPreview(file.token),
      size: file.fileSize,
    })

    return Response.json({
      token: file.token,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      size: file.fileSize,
      chunkSize: CHUNK_SIZE_BYTES,
      chunkCount: expectedChunkCount(file.fileSize),
    })
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return jsonError(error.message, error.message.includes("1 GB") ? 413 : 400)
    }
    logError("upload.init_failed", error)
    return handleRouteError(error)
  }
}
