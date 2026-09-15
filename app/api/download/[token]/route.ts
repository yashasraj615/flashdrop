import { RATE_LIMITS } from "@/lib/constants"
import { runCleanup } from "@/lib/cleanup"
import {
  getFileByToken,
  markExpired,
  publicFileStatus,
  recordDownload,
} from "@/lib/files"
import { handleRouteError, jsonError, redirectToDownloadPage, wantsHtml } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { signedDownloadUrl } from "@/lib/storage"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"

function unavailable(request: Request, token: string, status: "expired" | "invalid") {
  if (wantsHtml(request)) {
    return redirectToDownloadPage(request, token)
  }
  if (status === "expired") {
    return jsonError("This file has expired.", 410, { status: "expired" })
  }
  return jsonError("This transfer link isn't valid.", 404, { status: "invalid" })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    await enforceRateLimit({
      key: `download:${clientIp(request)}`,
      ...RATE_LIMITS.download,
    })

    const { token } = await context.params
    if (!isPlausibleToken(token)) {
      return unavailable(request, token, "invalid")
    }

    const file = await getFileByToken(token)
    if (!file) {
      return unavailable(request, token, "expired")
    }

    const status = publicFileStatus(file)
    if (status === "expired") {
      if (file.status === "active") await markExpired(file.id)
      logEvent("download.expired", { token: tokenPreview(token) })
      void runCleanup().catch((error) => logError("cleanup.opportunistic_failed", error))
      return unavailable(request, token, "expired")
    }
    if (status !== "active") {
      return unavailable(request, token, "expired")
    }

    const url = await signedDownloadUrl({
      key: file.objectKey,
      filename: file.originalFilename,
      contentType: file.mimeType,
    })

    void recordDownload(token).catch((error) => logError("download.count_failed", error))
    logEvent("download.initiated", {
      fileId: file.id,
      token: tokenPreview(token),
      size: file.fileSize,
    })

    return Response.redirect(url, 302)
  } catch (error) {
    logError("download.failed", error)
    return handleRouteError(error)
  }
}
