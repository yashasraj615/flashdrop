import { listReceivedChunkIndexes } from "@/lib/chunks"
import { CHUNK_SIZE_BYTES, RATE_LIMITS, expectedChunkCount } from "@/lib/constants"
import { getFileByToken } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
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

    const receivedIndexes =
      file.status === "uploading" || file.status === "processing"
        ? await listReceivedChunkIndexes(file.id)
        : []

    return Response.json({
      token: file.token,
      status: file.status,
      size: file.fileSize,
      chunkSize: CHUNK_SIZE_BYTES,
      chunkCount: expectedChunkCount(file.fileSize),
      bytesReceived: file.bytesReceived,
      receivedIndexes,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
