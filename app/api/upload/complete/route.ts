import { BlobNotFoundError } from "@vercel/blob"

import { RATE_LIMITS } from "@/lib/constants"
import { verifyStoredBlob } from "@/lib/blob"
import { shareUrl } from "@/lib/env"
import { getFileByToken, markUploadComplete, publicFileView } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-complete:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const body = (await request.json()) as {
      token?: string
      url?: string
      pathname?: string
      contentType?: string
    }

    if (!body.token || !isPlausibleToken(body.token) || !body.url || !body.pathname) {
      return jsonError("Upload could not be verified.", 400)
    }

    const file = await getFileByToken(body.token)
    if (!file) {
      return jsonError("This transfer isn't valid.", 404)
    }

    let metadata
    try {
      metadata = await verifyStoredBlob(body.url)
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return jsonError("Upload interrupted.", 409)
      }
      throw error
    }

    if (metadata.size !== file.fileSize) {
      logEvent("upload.size_mismatch", {
        token: tokenPreview(file.token),
        expected: file.fileSize,
        actual: metadata.size,
      })
      return jsonError("Upload interrupted.", 409)
    }

    const completed = await markUploadComplete({
      token: file.token,
      storageKey: body.pathname,
      storageUrl: body.url,
      mimeType: body.contentType ?? metadata.contentType,
    })

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
