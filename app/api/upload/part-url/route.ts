import { RATE_LIMITS, expectedPartCount } from "@/lib/constants"
import { getFileByToken } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { signedPartUrl } from "@/lib/storage"
import { isPlausibleToken } from "@/lib/tokens"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-part:${clientIp(request)}`,
      ...RATE_LIMITS.part,
    })

    const body = (await request.json()) as { token?: string; partNumber?: number }
    if (!body.token || !isPlausibleToken(body.token) || !Number.isInteger(body.partNumber)) {
      return jsonError("Upload could not be verified.", 400)
    }

    const file = await getFileByToken(body.token)
    if (!file || file.status !== "uploading" || !file.multipartUploadId) {
      return jsonError("This transfer is no longer available.", 409)
    }

    const partCount = expectedPartCount(file.fileSize)
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
    return handleRouteError(error)
  }
}
