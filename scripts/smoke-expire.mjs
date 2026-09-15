import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
import { webcrypto } from "node:crypto"

if (!globalThis.crypto) globalThis.crypto = webcrypto

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

const initResponse = await fetch(`${base}/api/transfers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    files: [{ filename: "expire.bin", mimeType: "application/octet-stream", size: payload.length }],
  }),
})
const init = await initResponse.json()
if (!init.token || !init.files?.[0]?.uploadUrl) throw new Error("init failed")

const FILE_INFO = new TextEncoder().encode("flashdrop-file-v1")
const secret = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)))
const fileId = init.files[0].id
const baseKey = await webcrypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"])
const key = await webcrypto.subtle.deriveKey(
  { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(fileId), info: FILE_INFO },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"]
)
const iv = webcrypto.getRandomValues(new Uint8Array(12))
const aad = new TextEncoder().encode(`v1:${fileId}:0`)
const ciphertext = new Uint8Array(
  await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, payload)
)
const packed = Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext)])
if (packed.length !== init.files[0].encryptedSize) throw new Error("encrypted size mismatch")

const put = await fetch(init.files[0].uploadUrl, {
  method: "PUT",
  headers: { "content-type": "application/octet-stream" },
  body: packed,
})
if (!put.ok) throw new Error(`put failed: ${put.status}`)

const completeResponse = await fetch(`${base}/api/transfers/${init.token}/files/${fileId}/complete`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-flashdrop-manage": init.manageToken,
  },
  body: JSON.stringify({ manageToken: init.manageToken }),
})
if (!completeResponse.ok) throw new Error("complete failed")

await sql`UPDATE transfers SET expires_at = NOW() - INTERVAL '1 minute' WHERE token = ${init.token}`

const expiredDownload = await fetch(`${base}/api/transfers/${init.token}/files/${fileId}/download`, {
  headers: { accept: "application/json" },
})
if (expiredDownload.status !== 410) {
  throw new Error(`expected 410, got ${expiredDownload.status}`)
}

const cleanupResponse = await fetch(`${base}/api/cleanup`, {
  headers: { authorization: `Bearer ${env.CRON_SECRET}` },
})
const cleanup = await cleanupResponse.json()
if (!cleanupResponse.ok) throw new Error(`cleanup failed: ${JSON.stringify(cleanup)}`)

const leftover = await sql`SELECT COUNT(*)::int AS count FROM transfers WHERE token = ${init.token}`

process.stdout.write(
  JSON.stringify({
    ok: true,
    expiredStatus: expiredDownload.status,
    leftoverTransfers: leftover[0].count,
    cleanupDeleted: cleanup.deletedRecords,
  })
)
