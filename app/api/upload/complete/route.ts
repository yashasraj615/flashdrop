import { RATE_LIMITS } from "@/lib/constants"
import { shareUrl } from "@/lib/env"
import { UploadValidationError, getFileByToken, markUploadComplete, publicFileView } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-complete:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const body = (await request.json()) as { token?: string }
    if (!body.token || !isPlausibleToken(body.token)) {
      return jsonError("Upload could not be verified.", 400)
    }

    const file = await getFileByToken(body.token)
    if (!file) {
      return jsonError("This transfer isn't valid.", 404)
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
    if (error instanceof UploadValidationError) {
      return jsonError(error.message, 409)
    }
    logError("upload.complete_failed", error)
    return handleRouteError(error)
  }
}
