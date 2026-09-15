import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"

import { MAX_FILE_SIZE_BYTES, RATE_LIMITS, UPLOAD_TOKEN_TTL_MS } from "@/lib/constants"
import { markUploadComplete } from "@/lib/files"
import { getFileByToken } from "@/lib/files"
import { jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return jsonError("Malformed upload request.", 400)
  }

  try {
    if (body.type === "blob.generate-client-token") {
      await enforceRateLimit({
        key: `upload-token:${clientIp(request)}`,
        ...RATE_LIMITS.upload,
      })
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parsePayload(clientPayload)
        if (!payload?.token) {
          throw new Error("Missing upload token")
        }

        const file = await getFileByToken(payload.token)
        if (!file || file.status !== "uploading") {
          throw new Error("This transfer is no longer available")
        }
        if (payload.size && payload.size !== file.fileSize) {
          throw new Error("File size does not match the prepared transfer")
        }
        if (file.fileSize > MAX_FILE_SIZE_BYTES) {
          throw new Error("That file is larger than 1 GB.")
        }

        logEvent("upload.token_issued", {
          fileId: file.id,
          token: tokenPreview(file.token),
        })

        return {
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({ token: file.token }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parsePayload(tokenPayload)
        if (!payload?.token) return
        const completed = await markUploadComplete({
          token: payload.token,
          storageKey: blob.pathname,
          storageUrl: blob.url,
          mimeType: blob.contentType,
        })
        logEvent("upload.completed", {
          fileId: completed?.id,
          token: tokenPreview(payload.token),
          size: completed?.fileSize,
        })
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    logError("upload.token_failed", error)
    const message = error instanceof Error ? error.message : "Upload failed"
    return jsonError(message, 400)
  }
}

function parsePayload(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as { token?: string; size?: number }
  } catch {
    return null
  }
}
