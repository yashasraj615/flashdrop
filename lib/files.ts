import "server-only"

import {
  CHUNK_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  expectedChunkCount,
  isCompleteUpload,
} from "@/lib/constants"
import { summarizeChunks } from "@/lib/chunks"
import { getSql, toNumber } from "@/lib/db"
import { shareUrl } from "@/lib/env"
import {
  isDownloadable,
  isPastExpiration,
  type FileLifecycleStatus,
} from "@/lib/expiration"
import { sanitizeFilename, storageContentType } from "@/lib/filenames"
import { createDownloadToken } from "@/lib/tokens"

const FILE_COLUMNS = `
  id, token, original_filename, mime_type, file_size, chunk_count, bytes_received,
  status, uploaded_at, expires_at, deleted_at, download_count, last_downloaded_at,
  cleanup_attempts, last_cleanup_error, created_at, updated_at
`

export type TransferFile = {
  id: string
  token: string
  originalFilename: string
  mimeType: string
  fileSize: number
  chunkCount: number | null
  bytesReceived: number
  status: FileLifecycleStatus
  uploadedAt: string | null
  expiresAt: string | null
  deletedAt: string | null
  downloadCount: number
  lastDownloadedAt: string | null
  cleanupAttempts: number
  lastCleanupError: string | null
  createdAt: string
  updatedAt: string
}

type FileRow = Record<string, unknown>

function mapFile(row: FileRow): TransferFile {
  return {
    id: String(row.id),
    token: String(row.token),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    fileSize: toNumber(row.file_size),
    chunkCount: row.chunk_count == null ? null : toNumber(row.chunk_count),
    bytesReceived: toNumber(row.bytes_received),
    status: String(row.status) as FileLifecycleStatus,
    uploadedAt: row.uploaded_at ? new Date(String(row.uploaded_at)).toISOString() : null,
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : null,
    downloadCount: toNumber(row.download_count),
    lastDownloadedAt: row.last_downloaded_at
      ? new Date(String(row.last_downloaded_at)).toISOString()
      : null,
    cleanupAttempts: toNumber(row.cleanup_attempts),
    lastCleanupError: row.last_cleanup_error ? String(row.last_cleanup_error) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UploadValidationError"
  }
}

export function publicFileStatus(file: TransferFile, now = new Date()) {
  if (file.status === "deleted") return "expired" as const
  if (file.status === "failed") return "unavailable" as const
  if (file.status === "uploading" || file.status === "processing") {
    return "unavailable" as const
  }
  if (
    file.status === "expired" ||
    file.status === "deleting" ||
    isPastExpiration(now, file.expiresAt)
  ) {
    return "expired" as const
  }
  if (isDownloadable({ now, status: file.status, expiresAt: file.expiresAt })) {
    return "active" as const
  }
  return "unavailable" as const
}

export function publicFileView(file: TransferFile) {
  return {
    token: file.token,
    filename: file.originalFilename,
    mimeType: file.mimeType,
    size: file.fileSize,
    status: publicFileStatus(file),
    uploadedAt: file.uploadedAt,
    expiresAt: file.expiresAt,
    downloadCount: file.downloadCount,
    shareUrl: shareUrl(file.token),
    chunkSize: CHUNK_SIZE_BYTES,
    chunkCount: expectedChunkCount(file.fileSize),
  }
}

export async function createUploadRecord(input: {
  filename: string
  mimeType: string
  size: number
}) {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new UploadValidationError("Choose a file to upload.")
  }
  if (input.size > MAX_FILE_SIZE_BYTES) {
    throw new UploadValidationError("That file is larger than 1 GB.")
  }

  const sql = getSql()
  const filename = sanitizeFilename(input.filename)
  const mimeType = storageContentType(input.mimeType)
  const chunkCount = expectedChunkCount(input.size)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createDownloadToken()
    try {
      const rows = await sql.query(
        `INSERT INTO files (
           token,
           original_filename,
           mime_type,
           file_size,
           chunk_count,
           bytes_received,
           status
         )
         VALUES ($1, $2, $3, $4, $5, 0, 'uploading')
         RETURNING ${FILE_COLUMNS}`,
        [token, filename, mimeType, input.size, chunkCount]
      )
      return mapFile(rows[0] as FileRow)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (!/unique|duplicate/i.test(message) || attempt === 2) {
        throw error
      }
    }
  }

  throw new Error("Could not create a transfer token")
}

export async function getFileByToken(token: string) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT ${FILE_COLUMNS} FROM files WHERE token = $1 LIMIT 1`,
    [token]
  )
  if (!rows[0]) return null
  return mapFile(rows[0] as FileRow)
}

export async function markUploadComplete(token: string) {
  const file = await getFileByToken(token)
  if (!file) return null
  if (file.status === "active") return file
  if (file.status !== "uploading" && file.status !== "processing") return null

  const summary = await summarizeChunks(file.id)
  if (!isCompleteUpload(file.fileSize, summary)) {
    throw new UploadValidationError("Upload interrupted.")
  }

  const sql = getSql()
  const rows = await sql.query(
    `UPDATE files
     SET
       status = 'active',
       chunk_count = $2,
       bytes_received = $3,
       uploaded_at = COALESCE(uploaded_at, NOW()),
       expires_at = COALESCE(expires_at, NOW() + INTERVAL '24 hours'),
       last_cleanup_error = NULL,
       updated_at = NOW()
     WHERE token = $1
       AND status IN ('uploading', 'processing')
     RETURNING ${FILE_COLUMNS}`,
    [token, summary.chunkCount, summary.totalBytes]
  )
  if (!rows[0]) return getFileByToken(token)
  return mapFile(rows[0] as FileRow)
}

export async function markUploadFailed(token: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE files
     SET status = 'failed', updated_at = NOW()
     WHERE token = $1
       AND status IN ('uploading', 'processing')`,
    [token]
  )
}

export async function deleteIncompleteUpload(token: string) {
  const sql = getSql()
  await sql.query(
    `DELETE FROM files
     WHERE token = $1
       AND status IN ('uploading', 'processing', 'failed')`,
    [token]
  )
}

export async function recordDownload(token: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE files
     SET
       download_count = download_count + 1,
       last_downloaded_at = NOW(),
       updated_at = NOW()
     WHERE token = $1
       AND status = 'active'`,
    [token]
  )
}

export async function listCleanupCandidates(limit = 40) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT ${FILE_COLUMNS}
     FROM files
     WHERE
       status IN ('expired', 'deleting', 'failed')
       OR (status = 'active' AND expires_at <= NOW())
       OR (
         status IN ('uploading', 'processing')
         AND created_at <= NOW() - INTERVAL '6 hours'
       )
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  )
  return rows.map((row) => mapFile(row as FileRow))
}

export async function markDeleting(id: string) {
  const sql = getSql()
  const rows = await sql.query(
    `UPDATE files
     SET status = 'deleting', updated_at = NOW()
     WHERE id = $1::uuid
       AND status IN ('active', 'expired', 'uploading', 'processing', 'deleting', 'failed')
     RETURNING ${FILE_COLUMNS}`,
    [id]
  )
  return rows[0] ? mapFile(rows[0] as FileRow) : null
}

export async function deleteFileRecord(id: string) {
  const sql = getSql()
  await sql.query(`DELETE FROM files WHERE id = $1::uuid`, [id])
}

export async function markExpired(id: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE files
     SET status = 'expired', updated_at = NOW()
     WHERE id = $1::uuid
       AND status = 'active'`,
    [id]
  )
}

export async function recordCleanupFailure(id: string, error: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE files
     SET
       cleanup_attempts = cleanup_attempts + 1,
       last_cleanup_error = $2,
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [id, error.slice(0, 500)]
  )
}

export async function recordCleanupRun(stats: {
  scanned: number
  deletedObjects: number
  deletedRecords: number
  retried: number
  failed: number
  error?: string
}) {
  const sql = getSql()
  await sql.query(
    `INSERT INTO cleanup_runs (
       started_at,
       finished_at,
       scanned,
       deleted_objects,
       deleted_records,
       retried,
       failed,
       error
     )
     VALUES (
       NOW(),
       NOW(),
       $1, $2, $3, $4, $5, $6
     )`,
    [
      stats.scanned,
      stats.deletedObjects,
      stats.deletedRecords,
      stats.retried,
      stats.failed,
      stats.error ?? null,
    ]
  )
}
