import { RATE_LIMITS } from "@/lib/constants"
import { runCleanup } from "@/lib/cleanup"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { tokenPreview } from "@/lib/tokens"
import {
  QuotaError,
  UploadValidationError,
  createTransfer,
} from "@/lib/transfers"
import { createUploadPlan } from "@/lib/upload-session"

export const runtime = "nodejs"

type IncomingFile = { filename?: string; mimeType?: string; size?: number }

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })
    void runCleanup().catch((error) => logError("cleanup.opportunistic_failed", error))

    const body = (await request.json()) as { files?: IncomingFile[]; lifetimeSeconds?: unknown }
    const incoming = (body.files ?? []).filter(
      (file): file is { filename: string; mimeType?: string; size: number } =>
        typeof file.filename === "string" && typeof file.size === "number"
    )

    const created = await createTransfer(incoming, body.lifetimeSeconds)
    const uploads = []
    for (const file of created.files) {
      uploads.push(await createUploadPlan(file))
    }

    logEvent("transfer.created", {
      transferId: created.transfer.id,
      token: tokenPreview(created.transfer.token),
      files: uploads.length,
    })

    return Response.json({
      token: created.transfer.token,
      manageToken: created.manageToken,
      status: "uploading",
      files: uploads,
    })
  } catch (error) {
    if (error instanceof QuotaError) {
      return jsonError(error.message, 413, {
        remaining: error.remaining,
        used: error.used,
        requested: error.requested,
      })
    }
    if (error instanceof UploadValidationError) {
      return jsonError(error.message, error.message.includes("1 GB") ? 413 : 400)
    }
    logError("transfer.create_failed", error)
    return handleRouteError(error)
  }
}
