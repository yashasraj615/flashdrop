import "server-only"

import { MAX_FILE_SIZE_BYTES } from "@/lib/constants"
import { getSql, toNumber } from "@/lib/db"
import { shareUrl } from "@/lib/env"
import {
  isDownloadable,
  isPastExpiration,
  type FileLifecycleStatus,
} from "@/lib/expiration"
import { sanitizeFilename, storageContentType } from "@/lib/filenames"
import { createDownloadToken } from "@/lib/tokens"

export type TransferFile = {
  id: string
  token: string
  originalFilename: string
  mimeType: string
  fileSize: number
  storageKey: string | null
  storageUrl: string | null
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
    storageKey: row.storage_key ? String(row.storage_key) : null,
    storageUrl: row.storage_url ? String(row.storage_url) : null,
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
  if (file.status === "deleted") return "deleted" as const
  if (file.status === "failed") return "failed" as const
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createDownloadToken()
    try {
      const rows = await sql`
        INSERT INTO files (
          token,
          original_filename,
          mime_type,
          file_size,
          status
        )
        VALUES (
          ${token},
          ${filename},
          ${mimeType},
          ${input.size},
          'uploading'
        )
        RETURNING *
      `
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
  const rows = await sql`SELECT * FROM files WHERE token = ${token} LIMIT 1`
  if (!rows[0]) return null
  return mapFile(rows[0] as FileRow)
}

export async function markUploadComplete(input: {
  token: string
  storageKey: string
  storageUrl: string
  mimeType?: string
}) {
  const sql = getSql()
  const rows = await sql`
    UPDATE files
    SET
      status = 'active',
      storage_key = ${input.storageKey},
      storage_url = ${input.storageUrl},
      mime_type = COALESCE(${input.mimeType ?? null}, mime_type),
      uploaded_at = COALESCE(uploaded_at, NOW()),
      expires_at = COALESCE(expires_at, NOW() + INTERVAL '24 hours'),
      last_cleanup_error = NULL,
      updated_at = NOW()
    WHERE token = ${input.token}
      AND status IN ('uploading', 'processing', 'active')
    RETURNING *
  `
  if (!rows[0]) return null
  return mapFile(rows[0] as FileRow)
}

export async function markUploadFailed(token: string) {
  const sql = getSql()
  await sql`
    UPDATE files
    SET status = 'failed', updated_at = NOW()
    WHERE token = ${token}
      AND status IN ('uploading', 'processing')
  `
}

export async function recordDownload(token: string) {
  const sql = getSql()
  await sql`
    UPDATE files
    SET
      download_count = download_count + 1,
      last_downloaded_at = NOW(),
      updated_at = NOW()
    WHERE token = ${token}
      AND status = 'active'
  `
}

export async function listCleanupCandidates(limit = 40) {
  const sql = getSql()
  const rows = await sql`
    SELECT *
    FROM files
    WHERE
      status IN ('expired', 'deleting')
      OR (status = 'active' AND expires_at <= NOW())
      OR (
        status IN ('uploading', 'processing')
        AND created_at <= NOW() - INTERVAL '6 hours'
      )
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
  return rows.map((row) => mapFile(row as FileRow))
}

export async function markDeleting(id: string) {
  const sql = getSql()
  const rows = await sql`
    UPDATE files
    SET status = 'deleting', updated_at = NOW()
    WHERE id = ${id}::uuid
      AND status IN ('active', 'expired', 'uploading', 'processing', 'deleting')
    RETURNING *
  `
  return rows[0] ? mapFile(rows[0] as FileRow) : null
}

export async function markDeleted(id: string) {
  const sql = getSql()
  await sql`
    UPDATE files
    SET
      status = 'deleted',
      deleted_at = NOW(),
      last_cleanup_error = NULL,
      updated_at = NOW()
    WHERE id = ${id}::uuid
  `
}

export async function markExpired(id: string) {
  const sql = getSql()
  await sql`
    UPDATE files
    SET status = 'expired', updated_at = NOW()
    WHERE id = ${id}::uuid
      AND status = 'active'
  `
}

export async function recordCleanupFailure(id: string, error: string) {
  const sql = getSql()
  await sql`
    UPDATE files
    SET
      cleanup_attempts = cleanup_attempts + 1,
      last_cleanup_error = ${error.slice(0, 500)},
      updated_at = NOW()
    WHERE id = ${id}::uuid
  `
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
  await sql`
    INSERT INTO cleanup_runs (
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
      ${stats.scanned},
      ${stats.deletedObjects},
      ${stats.deletedRecords},
      ${stats.retried},
      ${stats.failed},
      ${stats.error ?? null}
    )
  `
}
