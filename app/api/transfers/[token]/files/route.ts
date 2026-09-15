import { RATE_LIMITS } from "@/lib/constants"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"
import {
  ManageAuthError,
  QuotaError,
  UploadValidationError,
  addFilesToTransfer,
} from "@/lib/transfers"
import { createUploadPlan, readManageToken } from "@/lib/upload-session"

export const runtime = "nodejs"

type IncomingFile = { filename?: string; mimeType?: string; size?: number }

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    await enforceRateLimit({
      key: `upload:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const { token } = await context.params
    if (!isPlausibleToken(token)) {
      return jsonError("This transfer isn't available.", 404)
    }

    const body = (await request.json()) as { files?: IncomingFile[]; manageToken?: string }
    const incoming = (body.files ?? []).filter(
      (file): file is { filename: string; mimeType?: string; size: number } =>
        typeof file.filename === "string" && typeof file.size === "number"
    )

    const added = await addFilesToTransfer(token, readManageToken(request, body), incoming)
    const uploads = []
    for (const file of added.files) {
      uploads.push(await createUploadPlan(file))
    }

    logEvent("transfer.files_added", {
      token: tokenPreview(token),
      files: uploads.length,
    })

    return Response.json({
      token: added.transfer.token,
      expiresAt: added.transfer.expiresAt,
      files: uploads,
    })
  } catch (error) {
    if (error instanceof ManageAuthError) {
      return jsonError(error.message, 403)
    }
    if (error instanceof QuotaError) {
      return jsonError(error.message, 413, {
        remaining: error.remaining,
        used: error.used,
        requested: error.requested,
      })
    }
    if (error instanceof UploadValidationError) {
      const expired = error.message.toLowerCase().includes("expired")
      return jsonError(error.message, expired ? 410 : 400)
    }
    logError("transfer.add_failed", error)
    return handleRouteError(error)
  }
}
