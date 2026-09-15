import { hashChunk } from "@/lib/checksum"
import { upsertChunk } from "@/lib/chunks"
import { CHUNK_SIZE_BYTES, MAX_CHUNK_BYTES, RATE_LIMITS, chunkByteRange, expectedChunkCount } from "@/lib/constants"
import { getFileByToken } from "@/lib/files"
import { handleRouteError, jsonError } from "@/lib/http"
import { logError } from "@/lib/logger"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { isPlausibleToken } from "@/lib/tokens"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `upload-chunk:${clientIp(request)}`,
      ...RATE_LIMITS.chunk,
    })

    const token = request.headers.get("x-upload-token") ?? ""
    const indexRaw = request.headers.get("x-chunk-index") ?? ""
    const checksum = (request.headers.get("x-chunk-checksum") ?? "").toLowerCase()
    const index = Number.parseInt(indexRaw, 10)

    if (!isPlausibleToken(token) || !Number.isInteger(index) || index < 0) {
      return jsonError("Upload could not be verified.", 400)
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0")
    if (contentLength > MAX_CHUNK_BYTES) {
      return jsonError("That chunk is too large.", 413)
    }

    const file = await getFileByToken(token)
    if (!file || (file.status !== "uploading" && file.status !== "processing")) {
      return jsonError("This transfer is no longer available.", 409)
    }

    const expectedChunks = expectedChunkCount(file.fileSize)
    if (index >= expectedChunks) {
      return jsonError("Upload could not be verified.", 400)
    }

    const expected = chunkByteRange(index, file.fileSize, CHUNK_SIZE_BYTES)
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHUNK_BYTES) {
      return jsonError("That chunk is too large.", 413)
    }
    if (bytes.byteLength !== expected.length) {
      return jsonError("Upload interrupted.", 400)
    }
    if (checksum && checksum !== hashChunk(bytes)) {
      return jsonError("Upload interrupted.", 400)
    }

    const stored = await upsertChunk({
      fileId: file.id,
      index,
      offset: expected.offset,
      bytes,
    })

    return Response.json({
      index,
      byteLength: stored.byteLength,
      checksum: stored.checksum,
    })
  } catch (error) {
    logError("upload.chunk_failed", error)
    return handleRouteError(error)
  }
}
