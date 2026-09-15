import { createChunkReadableStream } from "@/lib/chunks"
import { RATE_LIMITS, expectedChunkCount } from "@/lib/constants"
import { runCleanup } from "@/lib/cleanup"
import {
  getFileByToken,
  markExpired,
  publicFileStatus,
  recordDownload,
} from "@/lib/files"
import { contentDisposition, storageContentType } from "@/lib/filenames"
import { handleRouteError, jsonError, redirectToDownloadPage, wantsHtml } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"
export const maxDuration = 300

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

    const chunkCount = file.chunkCount ?? expectedChunkCount(file.fileSize)
    logEvent("download.requested", {
      fileId: file.id,
      token: tokenPreview(token),
      size: file.fileSize,
    })

    void recordDownload(token).catch((error) => logError("download.count_failed", error))

    const stream = createChunkReadableStream(file.id, chunkCount)
    return new Response(stream, {
      headers: {
        "Content-Type": storageContentType(file.mimeType),
        "Content-Disposition": contentDisposition(file.originalFilename),
        "Content-Length": String(file.fileSize),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    logError("download.failed", error)
    return handleRouteError(error)
  }
}
