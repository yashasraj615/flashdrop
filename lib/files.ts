import "server-only"

import { getSql, toNumber } from "@/lib/db"
import {
  isDownloadable,
  isPastExpiration,
  type FileLifecycleStatus,
} from "@/lib/expiration"

const FILE_COLUMNS = `
  id, transfer_id, object_key, original_filename, mime_type, file_size, encrypted_size,
  chunk_size, encryption_version, multipart_upload_id, status, uploaded_at, deleted_at,
  download_count, last_downloaded_at, created_at, updated_at
`

export type TransferFile = {
  id: string
  transferId: string
  objectKey: string
  originalFilename: string
  mimeType: string
  fileSize: number
  encryptedSize: number
  chunkSize: number
  encryptionVersion: string
  multipartUploadId: string | null
  status: FileLifecycleStatus
  uploadedAt: string | null
  deletedAt: string | null
  downloadCount: number
  lastDownloadedAt: string | null
  createdAt: string
  updatedAt: string
}

type FileRow = Record<string, unknown>

export function mapFile(row: FileRow): TransferFile {
  return {
    id: String(row.id),
    transferId: String(row.transfer_id),
    objectKey: String(row.object_key),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    fileSize: toNumber(row.file_size),
    encryptedSize: toNumber(row.encrypted_size),
    chunkSize: toNumber(row.chunk_size),
    encryptionVersion: String(row.encryption_version ?? "v1"),
    multipartUploadId: row.multipart_upload_id ? String(row.multipart_upload_id) : null,
    status: String(row.status) as FileLifecycleStatus,
    uploadedAt: row.uploaded_at ? new Date(String(row.uploaded_at)).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : null,
    downloadCount: toNumber(row.download_count),
    lastDownloadedAt: row.last_downloaded_at
      ? new Date(String(row.last_downloaded_at)).toISOString()
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

export function publicFileStatus(file: TransferFile, now = new Date()) {
  if (file.status === "deleted" || file.status === "failed") return "unavailable" as const
  if (file.status === "uploading" || file.status === "processing") {
    return "unavailable" as const
  }
  if (file.status === "expired" || file.status === "deleting") {
    return "expired" as const
  }
  if (file.status === "active") return "active" as const
  if (isPastExpiration(now, null)) return "expired" as const
  return "unavailable" as const
}

export function publicFileView(file: TransferFile) {
  return {
    id: file.id,
    filename: file.originalFilename,
    mimeType: file.mimeType,
    size: file.fileSize,
    encryptedSize: file.encryptedSize,
    chunkSize: file.chunkSize,
    encryptionVersion: file.encryptionVersion,
    status: publicFileStatus(file),
    uploadedAt: file.uploadedAt,
  }
}

export async function listFilesForTransfer(transferId: string) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT ${FILE_COLUMNS}
     FROM transfer_files
     WHERE transfer_id = $1::uuid
     ORDER BY created_at ASC`,
    [transferId]
  )
  return rows.map((row) => mapFile(row as FileRow))
}

export async function getFileById(fileId: string) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT ${FILE_COLUMNS} FROM transfer_files WHERE id = $1::uuid LIMIT 1`,
    [fileId]
  )
  if (!rows[0]) return null
  return mapFile(rows[0] as FileRow)
}

export async function saveMultipartUploadId(fileId: string, uploadId: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE transfer_files
     SET multipart_upload_id = $2, updated_at = NOW()
     WHERE id = $1::uuid AND status IN ('uploading', 'processing')`,
    [fileId, uploadId]
  )
}

export async function markFileActive(fileId: string) {
  const sql = getSql()
  const rows = await sql.query(
    `UPDATE transfer_files
     SET
       status = 'active',
       uploaded_at = COALESCE(uploaded_at, NOW()),
       updated_at = NOW()
     WHERE id = $1::uuid
       AND status IN ('uploading', 'processing', 'active')
     RETURNING ${FILE_COLUMNS}`,
    [fileId]
  )
  if (!rows[0]) return null
  return mapFile(rows[0] as FileRow)
}

export async function deleteIncompleteFile(fileId: string) {
  const sql = getSql()
  const rows = await sql.query(
    `DELETE FROM transfer_files
     WHERE id = $1::uuid
       AND status IN ('uploading', 'processing', 'failed')
     RETURNING ${FILE_COLUMNS}`,
    [fileId]
  )
  return rows[0] ? mapFile(rows[0] as FileRow) : null
}

export async function recordFileDownload(fileId: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE transfer_files
     SET
       download_count = download_count + 1,
       last_downloaded_at = NOW(),
       updated_at = NOW()
     WHERE id = $1::uuid
       AND status = 'active'`,
    [fileId]
  )
}

export async function reservedSizeForTransfer(transferId: string) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT COALESCE(SUM(file_size), 0) AS used, COUNT(*)::int AS count
     FROM transfer_files
     WHERE transfer_id = $1::uuid
       AND status IN ('uploading', 'processing', 'active')`,
    [transferId]
  )
  return {
    used: toNumber(rows[0]?.used),
    count: toNumber(rows[0]?.count),
  }
}

export { isDownloadable }
