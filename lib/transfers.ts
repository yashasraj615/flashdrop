import "server-only"

import { randomUUID } from "node:crypto"

import {
  ENCRYPTION_CHUNK_BYTES,
  ENCRYPTION_VERSION,
  MAX_TRANSFER_SIZE_BYTES,
  encryptedSize,
} from "@/lib/constants"
import { getSql, toNumber } from "@/lib/db"
import { isPastExpiration, type FileLifecycleStatus } from "@/lib/expiration"
import {
  listFilesForTransfer,
  mapFile,
  publicFileView,
  reservedSizeForTransfer,
  type TransferFile,
} from "@/lib/files"
import { sanitizeFilename, storageContentType } from "@/lib/filenames"
import { createManageToken, hashManageToken, manageTokensMatch } from "@/lib/manage"
import { QuotaError, assertFitsQuota, remainingBytes } from "@/lib/quota"
import { requireLifetimeSeconds, type LifetimeSeconds } from "@/lib/lifetime"
import { createDownloadToken } from "@/lib/tokens"

export type TransferStatus =
  | "uploading"
  | "active"
  | "expired"
  | "deleting"
  | "deleted"
  | "failed"

export type TransferRecord = {
  id: string
  token: string
  manageTokenHash: string
  status: TransferStatus
  totalSize: number
  lifetimeSeconds: number
  expiresAt: string | null
  uploadedAt: string | null
  deletedAt: string | null
  downloadCount: number
  lastDownloadedAt: string | null
  cleanupAttempts: number
  lastCleanupError: string | null
  createdAt: string
  updatedAt: string
}

const TRANSFER_COLUMNS = `
  id, token, manage_token_hash, status, total_size, lifetime_seconds, expires_at, uploaded_at, deleted_at,
  download_count, last_downloaded_at, cleanup_attempts, last_cleanup_error, created_at, updated_at
`

type Row = Record<string, unknown>

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UploadValidationError"
  }
}

export class ManageAuthError extends Error {
  constructor() {
    super("You can view this transfer, but only the original sender can add files.")
    this.name = "ManageAuthError"
  }
}

function mapTransfer(row: Row): TransferRecord {
  return {
    id: String(row.id),
    token: String(row.token),
    manageTokenHash: String(row.manage_token_hash),
    status: String(row.status) as TransferStatus,
    totalSize: toNumber(row.total_size),
    lifetimeSeconds: toNumber(row.lifetime_seconds) || 3600,
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    uploadedAt: row.uploaded_at ? new Date(String(row.uploaded_at)).toISOString() : null,
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

export function publicTransferStatus(transfer: TransferRecord, now = new Date()) {
  if (transfer.status === "deleted" || transfer.status === "failed") {
    return "unavailable" as const
  }
  if (transfer.status === "expired" || transfer.status === "deleting") {
    return "expired" as const
  }
  if (isPastExpiration(now, transfer.expiresAt)) {
    return "expired" as const
  }
  if (transfer.status === "active") return "active" as const
  if (transfer.status === "uploading") return "preparing" as const
  return "unavailable" as const
}

export function publicTransferView(
  transfer: TransferRecord,
  files: TransferFile[],
  options: { includeUploading?: boolean } = {}
) {
  const visible = options.includeUploading
    ? files.filter((file) => file.status !== "deleted" && file.status !== "failed")
    : files.filter((file) => file.status === "active")
  const used = visible
    .filter((file) => file.status === "active" || file.status === "uploading" || file.status === "processing")
    .reduce((sum, file) => sum + file.fileSize, 0)

  return {
    token: transfer.token,
    status: publicTransferStatus(transfer),
    totalSize: used,
    remaining: remainingBytes(used),
    limit: MAX_TRANSFER_SIZE_BYTES,
    fileCount: visible.filter((file) => file.status === "active").length,
    lifetimeSeconds: transfer.lifetimeSeconds,
    expiresAt: transfer.expiresAt,
    uploadedAt: transfer.uploadedAt,
    downloadCount: transfer.downloadCount,
    files: visible.map(publicFileView),
  }
}

export async function getTransferByToken(token: string) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE token = $1 LIMIT 1`,
    [token]
  )
  if (!rows[0]) return null
  return mapTransfer(rows[0] as Row)
}

export async function getTransferBundle(token: string) {
  const transfer = await getTransferByToken(token)
  if (!transfer) return null
  const files = await listFilesForTransfer(transfer.id)
  return { transfer, files }
}

export function assertManager(transfer: TransferRecord, manageToken: string | null | undefined) {
  if (!manageTokensMatch(manageToken, transfer.manageTokenHash)) {
    throw new ManageAuthError()
  }
}

type IncomingFile = {
  filename: string
  mimeType?: string
  size: number
}

function preparedFiles(input: IncomingFile[]) {
  if (!input.length) {
    throw new UploadValidationError("Choose a file to upload.")
  }
  return input.map((file) => {
    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new UploadValidationError("Choose a file to upload.")
    }
    if (file.size > MAX_TRANSFER_SIZE_BYTES) {
      throw new UploadValidationError("That file can't be added. Each transfer is limited to 1 GB in total.")
    }
    return {
      filename: sanitizeFilename(file.filename),
      mimeType: storageContentType(file.mimeType),
      size: file.size,
      encryptedSize: encryptedSize(file.size),
      chunkSize: ENCRYPTION_CHUNK_BYTES,
      objectKey: `uploads/${randomUUID()}`,
    }
  })
}

async function insertFileRows(transferId: string, files: ReturnType<typeof preparedFiles>) {
  const sql = getSql()
  const created: TransferFile[] = []
  for (const file of files) {
    const rows = await sql.query(
      `INSERT INTO transfer_files (
         transfer_id, object_key, original_filename, mime_type, file_size,
         encrypted_size, chunk_size, encryption_version, status
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, 'uploading')
       RETURNING id, transfer_id, object_key, original_filename, mime_type, file_size,
         encrypted_size, chunk_size, encryption_version, multipart_upload_id, status,
         uploaded_at, deleted_at, download_count, last_downloaded_at, created_at, updated_at`,
      [
        transferId,
        file.objectKey,
        file.filename,
        file.mimeType,
        file.size,
        file.encryptedSize,
        file.chunkSize,
        ENCRYPTION_VERSION,
      ]
    )
    created.push(mapFile(rows[0] as Row))
  }
  return created
}

export async function createTransfer(input: IncomingFile[], lifetimeSeconds?: unknown) {
  const files = preparedFiles(input)
  const requested = files.reduce((sum, file) => sum + file.size, 0)
  let lifetime: LifetimeSeconds
  try {
    lifetime = requireLifetimeSeconds(lifetimeSeconds ?? 3600)
  } catch (error) {
    throw new UploadValidationError(
      error instanceof Error ? error.message : "Choose a transfer lifetime between 5 minutes and 5 hours."
    )
  }
  assertFitsQuota({
    used: 0,
    requested,
    fileCount: 0,
    additionalFiles: files.length,
  })

  const sql = getSql()
  const manageToken = createManageToken()
  const manageTokenHash = hashManageToken(manageToken)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createDownloadToken()
    try {
      const rows = await sql.query(
        `INSERT INTO transfers (token, manage_token_hash, status, total_size, lifetime_seconds)
         VALUES ($1, $2, 'uploading', 0, $3)
         RETURNING ${TRANSFER_COLUMNS}`,
        [token, manageTokenHash, lifetime]
      )
      const transfer = mapTransfer(rows[0] as Row)
      const createdFiles = await insertFileRows(transfer.id, files)
      return { transfer, files: createdFiles, manageToken }
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (!/unique|duplicate/i.test(message) || attempt === 2) {
        throw error
      }
    }
  }

  throw new Error("Could not create a transfer token")
}

export async function addFilesToTransfer(
  token: string,
  manageToken: string | null | undefined,
  input: IncomingFile[]
) {
  const transfer = await getTransferByToken(token)
  if (!transfer) {
    throw new UploadValidationError("This transfer isn't available.")
  }
  assertManager(transfer, manageToken)

  if (publicTransferStatus(transfer) === "expired") {
    throw new UploadValidationError("This transfer has expired. Temporary files are automatically removed when the transfer expires.")
  }

  const files = preparedFiles(input)
  const reserved = await reservedSizeForTransfer(transfer.id)
  const requested = files.reduce((sum, file) => sum + file.size, 0)
  assertFitsQuota({
    used: reserved.used,
    requested,
    fileCount: reserved.count,
    additionalFiles: files.length,
  })

  const createdFiles = await insertFileRows(transfer.id, files)
  return { transfer, files: createdFiles }
}

export async function activateFileAndTransfer(fileId: string) {
  const sql = getSql()
  const fileRows = await sql.query(
    `UPDATE transfer_files
     SET status = 'active', uploaded_at = COALESCE(uploaded_at, NOW()), updated_at = NOW()
     WHERE id = $1::uuid AND status IN ('uploading', 'processing', 'active')
     RETURNING id, transfer_id, object_key, original_filename, mime_type, file_size,
       encrypted_size, chunk_size, encryption_version, multipart_upload_id, status,
       uploaded_at, deleted_at, download_count, last_downloaded_at, created_at, updated_at`,
    [fileId]
  )
  if (!fileRows[0]) return null
  const file = mapFile(fileRows[0] as Row)

  const totals = await sql.query(
    `SELECT COALESCE(SUM(file_size), 0) AS total
     FROM transfer_files
     WHERE transfer_id = $1::uuid AND status = 'active'`,
    [file.transferId]
  )
  const totalSize = toNumber(totals[0]?.total)

  const transferRows = await sql.query(
    `UPDATE transfers
     SET
       status = 'active',
       total_size = $2,
       uploaded_at = COALESCE(uploaded_at, NOW()),
       expires_at = COALESCE(expires_at, NOW() + make_interval(secs => lifetime_seconds)),
       last_cleanup_error = NULL,
       updated_at = NOW()
     WHERE id = $1::uuid
       AND status IN ('uploading', 'active')
     RETURNING ${TRANSFER_COLUMNS}`,
    [file.transferId, totalSize]
  )

  return {
    file,
    transfer: transferRows[0] ? mapTransfer(transferRows[0] as Row) : null,
  }
}

export async function recordTransferDownload(transferId: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE transfers
     SET download_count = download_count + 1, last_downloaded_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid AND status = 'active'`,
    [transferId]
  )
}

export async function markTransferExpired(id: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE transfers
     SET status = 'expired', updated_at = NOW()
     WHERE id = $1::uuid AND status = 'active'`,
    [id]
  )
}

export async function listCleanupCandidates(limit = 40) {
  const sql = getSql()
  const rows = await sql.query(
    `SELECT ${TRANSFER_COLUMNS}
     FROM transfers
     WHERE
       status IN ('expired', 'deleting', 'failed')
       OR (status = 'active' AND expires_at <= NOW())
       OR (
         status = 'uploading'
         AND created_at <= NOW() - INTERVAL '6 hours'
       )
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  )
  return rows.map((row) => mapTransfer(row as Row))
}

export async function markTransferDeleting(id: string) {
  const sql = getSql()
  const rows = await sql.query(
    `UPDATE transfers
     SET status = 'deleting', updated_at = NOW()
     WHERE id = $1::uuid
       AND status IN ('active', 'expired', 'uploading', 'deleting', 'failed')
     RETURNING ${TRANSFER_COLUMNS}`,
    [id]
  )
  return rows[0] ? mapTransfer(rows[0] as Row) : null
}

export async function deleteTransferRecord(id: string) {
  const sql = getSql()
  await sql.query(`DELETE FROM transfers WHERE id = $1::uuid`, [id])
}

export async function recordCleanupFailure(id: string, error: string) {
  const sql = getSql()
  await sql.query(
    `UPDATE transfers
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
       started_at, finished_at, scanned, deleted_objects, deleted_records, retried, failed, error
     )
     VALUES (NOW(), NOW(), $1, $2, $3, $4, $5, $6)`,
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

export { QuotaError }
export type { FileLifecycleStatus }
