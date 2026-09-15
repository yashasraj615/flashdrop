import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

function loadEnv() {
  const env = {}
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, "")
  }
  return env
}

const env = loadEnv()
const sql = neon(env.DATABASE_URL)
const base = "http://127.0.0.1:3000"
const payload = Buffer.from("flashdrop-expire-check")
const digest = createHash("sha256").update(payload).digest("hex")

const initResponse = await fetch(`${base}/api/upload/init`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    filename: "expire.bin",
    mimeType: "application/octet-stream",
    size: payload.length,
  }),
})
const init = await initResponse.json()
if (!init.token || !init.uploadUrl) throw new Error("init failed")

const put = await fetch(init.uploadUrl, {
  method: "PUT",
  headers: { "content-type": init.contentType },
  body: payload,
})
if (!put.ok) throw new Error(`put failed: ${put.status}`)

const completeResponse = await fetch(`${base}/api/upload/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: init.token }),
})
if (!completeResponse.ok) throw new Error("complete failed")

await sql`UPDATE files SET expires_at = NOW() - INTERVAL '1 minute' WHERE token = ${init.token}`

const expiredDownload = await fetch(`${base}/api/download/${init.token}`, {
  headers: { accept: "application/json" },
  redirect: "manual",
})
if (expiredDownload.status !== 410) {
  throw new Error(`expected 410, got ${expiredDownload.status}`)
}

const cleanupResponse = await fetch(`${base}/api/cleanup`, {
  headers: { authorization: `Bearer ${env.CRON_SECRET}` },
})
const cleanup = await cleanupResponse.json()
if (!cleanupResponse.ok) throw new Error(`cleanup failed: ${JSON.stringify(cleanup)}`)

const leftover = await sql`SELECT COUNT(*)::int AS count FROM files WHERE token = ${init.token}`

process.stdout.write(
  JSON.stringify({
    ok: true,
    digest,
    expiredStatus: expiredDownload.status,
    leftoverFiles: leftover[0].count,
    cleanupDeleted: cleanup.deletedRecords,
  })
)
