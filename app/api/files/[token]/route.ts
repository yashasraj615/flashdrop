import { RATE_LIMITS } from "@/lib/constants"
import { getFileByToken, markExpired, publicFileStatus } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"

const EXPIRED_MESSAGE = "This file has expired."

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    await enforceRateLimit({
      key: `metadata:${clientIp(request)}`,
      ...RATE_LIMITS.metadata,
    })

    const { token } = await context.params
    if (!isPlausibleToken(token)) {
      return jsonError("This transfer link isn't valid.", 404, { status: "invalid" })
    }

    const file = await getFileByToken(token)
    if (!file) {
      return jsonError(EXPIRED_MESSAGE, 410, { status: "expired" })
    }

    const status = publicFileStatus(file)
    if (status === "expired" && file.status === "active") {
      await markExpired(file.id)
      logEvent("download.expired", { token: tokenPreview(token) })
    }

    if (status !== "active") {
      return jsonError(EXPIRED_MESSAGE, 410, { status: "expired" })
    }

    return Response.json({
      filename: file.originalFilename,
      mimeType: file.mimeType,
      size: file.fileSize,
      status,
      expiresAt: file.expiresAt,
      uploadedAt: file.uploadedAt,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
