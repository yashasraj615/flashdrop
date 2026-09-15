import { neon } from "@neondatabase/serverless"
import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

const sql = neon(process.env.DATABASE_URL!)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
})
const bucket = process.env.NEON_STORAGE_BUCKET || "temporary-files"

async function removeObject(objectKey: string, uploadId: string | null) {
  if (uploadId) {
    await s3
      .send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: objectKey,
          UploadId: uploadId,
        })
      )
      .catch(() => undefined)
  }
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
}

export default {
  async fetch() {
    const transfers = await sql`
      SELECT id
      FROM transfers
      WHERE
        status IN ('expired', 'deleting', 'failed')
        OR (status = 'active' AND expires_at <= NOW())
        OR (
          status = 'uploading'
          AND created_at <= NOW() - INTERVAL '6 hours'
        )
      ORDER BY created_at ASC
      LIMIT 50
    `

    let deleted = 0
    let failed = 0
    for (const transfer of transfers) {
      try {
        await sql`UPDATE transfers SET status = 'deleting', updated_at = NOW() WHERE id = ${transfer.id}::uuid`
        const files = await sql`
          SELECT object_key, multipart_upload_id
          FROM transfer_files
          WHERE transfer_id = ${transfer.id}::uuid
        `
        for (const file of files) {
          await removeObject(String(file.object_key), file.multipart_upload_id ? String(file.multipart_upload_id) : null)
        }
        await sql`DELETE FROM transfers WHERE id = ${transfer.id}::uuid`
        deleted += 1
      } catch {
        failed += 1
      }
    }

    return Response.json({ ok: true, scanned: transfers.length, deleted, failed })
  },
}
