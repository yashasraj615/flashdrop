import { deleteStoredBlob } from "@/lib/blob"
import { RATE_LIMITS } from "@/lib/constants"
import { getFileByToken, markUploadFailed } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-abort:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const body = (await request.json()) as { token?: string; url?: string }
    if (!body.token || !isPlausibleToken(body.token)) {
      return jsonError("This transfer isn't valid.", 400)
    }

    const file = await getFileByToken(body.token)
    if (file?.storageUrl || body.url) {
      await deleteStoredBlob(body.url ?? file?.storageUrl).catch(() => undefined)
    }
    await markUploadFailed(body.token)
    logEvent("upload.failed", { token: tokenPreview(body.token) })
    return Response.json({ ok: true })
  } catch (error) {
    return handleRouteError(error)
  }
}
