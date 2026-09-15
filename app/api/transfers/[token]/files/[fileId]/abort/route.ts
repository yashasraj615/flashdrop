import { RATE_LIMITS } from "@/lib/constants"
import { deleteIncompleteFile, getFileById } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logEvent } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { abortMultipartUpload, deleteObject } from "@/lib/storage"
import { isPlausibleToken, tokenPreview } from "@/lib/tokens"
import { ManageAuthError, assertManager, getTransferByToken } from "@/lib/transfers"
import { readManageToken } from "@/lib/upload-session"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    await enforceRateLimit({
      key: `upload-abort:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const { token, fileId } = await context.params
    const body = (await request.json().catch(() => ({}))) as { manageToken?: string }
    if (!isPlausibleToken(token)) {
      return jsonError("This transfer isn't valid.", 400)
    }

    const transfer = await getTransferByToken(token)
    if (!transfer) return jsonError("This transfer isn't available.", 404)
    assertManager(transfer, readManageToken(request, body))

    const existing = await getFileById(fileId)
    if (!existing || existing.transferId !== transfer.id) {
      return Response.json({ ok: true })
    }

    const file = await deleteIncompleteFile(fileId)
    if (file) {
      if (file.multipartUploadId) {
        await abortMultipartUpload(file.objectKey, file.multipartUploadId).catch(() => undefined)
      }
      await deleteObject(file.objectKey).catch(() => undefined)
    }

    logEvent("upload.aborted", { token: tokenPreview(token), fileId })
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof ManageAuthError) {
      return jsonError(error.message, 403)
    }
    return handleRouteError(error)
  }
}
