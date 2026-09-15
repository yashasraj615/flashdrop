import { RATE_LIMITS, expectedPartCount } from "@/lib/constants"
import { getFileById } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { signedPartUrl } from "@/lib/storage"
import { isPlausibleToken } from "@/lib/tokens"
import { ManageAuthError, assertManager, getTransferByToken } from "@/lib/transfers"
import { readManageToken } from "@/lib/upload-session"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    await enforceRateLimit({
      key: `upload-part:${clientIp(request)}`,
      ...RATE_LIMITS.part,
    })

    const { token, fileId } = await context.params
    const body = (await request.json()) as { partNumber?: number; manageToken?: string }
    if (!isPlausibleToken(token) || !Number.isInteger(body.partNumber)) {
      return jsonError("Upload could not be verified.", 400)
    }

    const transfer = await getTransferByToken(token)
    if (!transfer) return jsonError("This transfer isn't available.", 404)
    assertManager(transfer, readManageToken(request, body))

    const file = await getFileById(fileId)
    if (!file || file.transferId !== transfer.id || file.status !== "uploading" || !file.multipartUploadId) {
      return jsonError("This transfer is no longer available.", 409)
    }

    const partCount = expectedPartCount(file.encryptedSize)
    if (body.partNumber! < 1 || body.partNumber! > partCount) {
      return jsonError("Upload could not be verified.", 400)
    }

    const url = await signedPartUrl({
      key: file.objectKey,
      uploadId: file.multipartUploadId,
      partNumber: body.partNumber!,
    })

    return Response.json({ url, partNumber: body.partNumber })
  } catch (error) {
    if (error instanceof ManageAuthError) {
      return jsonError(error.message, 403)
    }
    return handleRouteError(error)
  }
}
