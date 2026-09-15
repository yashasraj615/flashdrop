import { PART_SIZE_BYTES, expectedPartCount } from "@/lib/constants"
import { saveMultipartUploadId, type TransferFile } from "@/lib/files"
import { createMultipartUpload, signedPutUrl } from "@/lib/storage"

export async function createUploadPlan(file: TransferFile) {
  const multipart = file.encryptedSize > PART_SIZE_BYTES
  let uploadUrl: string | undefined
  let uploadId: string | undefined

  if (multipart) {
    uploadId = await createMultipartUpload({
      key: file.objectKey,
      contentType: "application/octet-stream",
    })
    await saveMultipartUploadId(file.id, uploadId)
  } else {
    uploadUrl = await signedPutUrl({
      key: file.objectKey,
      contentType: "application/octet-stream",
    })
  }

  return {
    id: file.id,
    filename: file.originalFilename,
    mimeType: file.mimeType,
    size: file.fileSize,
    encryptedSize: file.encryptedSize,
    chunkSize: file.chunkSize,
    encryptionVersion: file.encryptionVersion,
    mode: multipart ? ("multipart" as const) : ("put" as const),
    partSize: PART_SIZE_BYTES,
    partCount: expectedPartCount(file.encryptedSize),
    uploadUrl,
  }
}

export function readManageToken(request: Request, body?: { manageToken?: string | null }) {
  return request.headers.get("x-flashdrop-manage") || body?.manageToken || null
}
