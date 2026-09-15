import { RATE_LIMITS } from "@/lib/constants"
import { runCleanup } from "@/lib/cleanup"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"
import {
  getTransferBundle,
  markTransferExpired,
  publicTransferStatus,
  publicTransferView,
} from "@/lib/transfers"
import { manageTokensMatch } from "@/lib/manage"
import { readManageToken } from "@/lib/upload-session"

export const runtime = "nodejs"

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
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    const bundle = await getTransferBundle(token)
    if (!bundle) {
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    const status = publicTransferStatus(bundle.transfer)
    if (status === "expired") {
      if (bundle.transfer.status === "active") {
        await markTransferExpired(bundle.transfer.id)
      }
      logEvent("transfer.expired", { token: tokenPreview(token) })
      void runCleanup().catch((error) => logError("cleanup.opportunistic_failed", error))
      return jsonError("This transfer has expired.", 410, { status: "expired" })
    }

    const isOwner = manageTokensMatch(readManageToken(request), bundle.transfer.manageTokenHash)
    const view = publicTransferView(bundle.transfer, bundle.files, { includeUploading: isOwner })

    if (view.status === "unavailable") {
      return jsonError("This transfer isn't available.", 404, { status: "invalid" })
    }

    return Response.json({
      ...view,
      isOwner,
    })
  } catch (error) {
    logError("transfer.lookup_failed", error)
    return handleRouteError(error)
  }
}
