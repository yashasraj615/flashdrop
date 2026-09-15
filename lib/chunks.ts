import "server-only"

import { Pool } from "@neondatabase/serverless"

import { hashChunk } from "@/lib/checksum"
import { MAX_CHUNK_BYTES } from "@/lib/constants"
import { getSql, toNumber } from "@/lib/db"

export { hashChunk }

export function toByteaHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex")
}

export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return new Uint8Array(value)
  }
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value.replace(/^0x/i, "")
    return Uint8Array.from(Buffer.from(hex, "hex"))
  }
  throw new Error("Invalid binary chunk")
}

type QueryRows = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: Record<string, unknown>[] }).rows
  }
  return []
}

const httpQuery: QueryRows = async (text, params = []) => {
  const sql = getSql()
  return asRows(await sql.query(text, params))
}

export async function upsertChunk(input: {
  fileId: string
  index: number
  offset: number
  bytes: Uint8Array
}) {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_CHUNK_BYTES) {
    throw new Error("Invalid chunk size")
  }

  const checksum = hashChunk(input.bytes)
  await httpQuery(
    `INSERT INTO file_chunks (
       file_id, chunk_index, byte_offset, byte_length, checksum, data
     ) VALUES ($1::uuid, $2, $3, $4, $5, decode($6, 'hex'))
     ON CONFLICT (file_id, chunk_index) DO UPDATE SET
       byte_offset = EXCLUDED.byte_offset,
       byte_length = EXCLUDED.byte_length,
       checksum = EXCLUDED.checksum,
       data = EXCLUDED.data`,
    [input.fileId, input.index, input.offset, input.bytes.byteLength, checksum, toByteaHex(input.bytes)]
  )

  await httpQuery(
    `UPDATE files
     SET
       bytes_received = (
         SELECT COALESCE(SUM(byte_length), 0) FROM file_chunks WHERE file_id = $1::uuid
       ),
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [input.fileId]
  )

  return { checksum, byteLength: input.bytes.byteLength }
}

export async function listReceivedChunkIndexes(fileId: string): Promise<number[]> {
  const rows = await httpQuery(
    `SELECT chunk_index FROM file_chunks WHERE file_id = $1::uuid ORDER BY chunk_index ASC`,
    [fileId]
  )
  return rows.map((row) => toNumber(row.chunk_index))
}

export async function summarizeChunks(fileId: string) {
  const rows = await httpQuery(
    `SELECT
       COUNT(*)::int AS chunk_count,
       COALESCE(SUM(byte_length), 0)::bigint AS total_bytes,
       COALESCE(MIN(chunk_index), -1)::int AS first_index,
       COALESCE(MAX(chunk_index), -1)::int AS last_index
     FROM file_chunks
     WHERE file_id = $1::uuid`,
    [fileId]
  )
  const row = rows[0]
  return {
    chunkCount: toNumber(row?.chunk_count),
    totalBytes: toNumber(row?.total_bytes),
    firstIndex: toNumber(row?.first_index),
    lastIndex: toNumber(row?.last_index),
  }
}

function parseChunkRow(row: Record<string, unknown>): Uint8Array {
  const bytes = toBytes(row.data)
  if (bytes.byteLength !== toNumber(row.byte_length)) {
    throw new Error("Chunk length mismatch")
  }
  if (hashChunk(bytes) !== String(row.checksum)) {
    throw new Error("Chunk checksum mismatch")
  }
  return bytes
}

export async function getChunkBytes(fileId: string, index: number): Promise<Uint8Array | null> {
  const rows = await httpQuery(
    `SELECT data, checksum, byte_length
     FROM file_chunks
     WHERE file_id = $1::uuid AND chunk_index = $2
     LIMIT 1`,
    [fileId, index]
  )
  const row = rows[0]
  if (!row) return null
  return parseChunkRow(row)
}

export async function deleteChunks(fileId: string) {
  await httpQuery(`DELETE FROM file_chunks WHERE file_id = $1::uuid`, [fileId])
}

export function createChunkReadableStream(fileId: string, chunkCount: number): ReadableStream<Uint8Array> {
  let index = 0
  let pool: Pool | null = null
  let client: { query: (text: string, params?: unknown[]) => Promise<unknown>; release: () => void } | null =
    null
  let useHttp = false
  let prefetch: Promise<Uint8Array | null> | null = null

  async function load(i: number): Promise<Uint8Array | null> {
    if (useHttp) return getChunkBytes(fileId, i)
    if (!client) {
      try {
        pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
        client = await pool.connect()
      } catch {
        useHttp = true
        if (pool) {
          await pool.end().catch(() => undefined)
          pool = null
        }
        return getChunkBytes(fileId, i)
      }
    }
    const result = asRows(
      await client.query(
        `SELECT data, checksum, byte_length
         FROM file_chunks
         WHERE file_id = $1::uuid AND chunk_index = $2
         LIMIT 1`,
        [fileId, i]
      )
    )
    const row = result[0]
    if (!row) return null
    return parseChunkRow(row)
  }

  async function release() {
    try {
      client?.release()
    } catch {
      /* ignore */
    }
    client = null
    if (pool) {
      await pool.end().catch(() => undefined)
      pool = null
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (index >= chunkCount) {
          await release()
          controller.close()
          return
        }
        const bytes = prefetch ? await prefetch : await load(index)
        prefetch = index + 1 < chunkCount ? load(index + 1) : null
        if (!bytes) {
          await release()
          controller.error(new Error("Missing chunk"))
          return
        }
        controller.enqueue(bytes)
        index += 1
      } catch (error) {
        await release()
        controller.error(error)
      }
    },
    async cancel() {
      await release()
    },
  })
}
