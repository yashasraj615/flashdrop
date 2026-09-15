import { RATE_LIMITS, expectedPartCount } from "@/lib/constants"
import { getFileByToken } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { listUploadedPartNumbers } from "@/lib/storage"
import { isPlausibleToken } from "@/lib/tokens"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-status:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    })

    const token = new URL(request.url).searchParams.get("token") ?? ""
    if (!isPlausibleToken(token)) {
      return jsonError("This transfer isn't valid.", 400)
    }

    const file = await getFileByToken(token)
    if (!file) {
      return jsonError("This transfer isn't valid.", 404)
    }

    const receivedParts =
      file.multipartUploadId && file.status === "uploading"
        ? await listUploadedPartNumbers(file.objectKey, file.multipartUploadId)
        : []

    return Response.json({
      token: file.token,
      status: file.status,
      size: file.fileSize,
      partCount: expectedPartCount(file.fileSize),
      receivedParts,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
