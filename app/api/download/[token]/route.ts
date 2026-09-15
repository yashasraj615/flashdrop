import { RATE_LIMITS } from "@/lib/constants"
import { createSignedDownloadUrl } from "@/lib/blob"
import { runCleanup } from "@/lib/cleanup"
import {
  getFileByToken,
  markExpired,
  publicFileStatus,
  recordDownload,
} from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"

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
      return jsonError("This transfer link isn't valid.", 404, { status: "invalid" })
    }

    const file = await getFileByToken(token)
    if (!file) {
      return jsonError("This transfer link isn't valid.", 404, { status: "invalid" })
    }

    const status = publicFileStatus(file)
    if (status === "expired") {
      if (file.status === "active") await markExpired(file.id)
      logEvent("download.expired", { token: tokenPreview(token) })
      void runCleanup().catch((error) => logError("cleanup.opportunistic_failed", error))
      return jsonError("This file has expired.", 410, { status: "expired" })
    }
    if (status !== "active") {
      return jsonError("This file is no longer available.", 410, { status })
    }
    if (!file.storageKey) {
      return jsonError("We couldn't prepare your file. Please try again.", 503)
    }

    logEvent("download.requested", {
      fileId: file.id,
      token: tokenPreview(token),
    })

    const url = await createSignedDownloadUrl(file.storageKey)
    await recordDownload(token)
    logEvent("download.initiated", {
      fileId: file.id,
      token: tokenPreview(token),
    })

    return Response.json({ url })
  } catch (error) {
    logError("download.failed", error)
    return handleRouteError(error)
  }
}
