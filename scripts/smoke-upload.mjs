import { createHash } from "node:crypto"

const base = process.env.SMOKE_BASE || "http://127.0.0.1:3000"
const payload = Buffer.alloc(Number(process.env.SMOKE_BYTES || 256 * 1024), 7)
payload[0] = 0x11
payload[payload.length - 1] = 0x22
const digest = createHash("sha256").update(payload).digest("hex")

async function json(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const tooBig = await fetch(`${base}/api/upload/init`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    filename: "too-big.bin",
    mimeType: "application/octet-stream",
    size: 1073741825,
  }),
})
if (tooBig.status !== 413) throw new Error(`expected 413, got ${tooBig.status}`)

const initResponse = await fetch(`${base}/api/upload/init`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    filename: "smoke.bin",
    mimeType: "application/octet-stream",
    size: payload.length,
  }),
})
const init = await json(initResponse)
if (!initResponse.ok || !init.token) throw new Error(`init failed: ${JSON.stringify(init)}`)

const completedParts = []
if (init.mode === "put") {
  const put = await fetch(init.uploadUrl, {
    method: "PUT",
    headers: { "content-type": init.contentType },
    body: payload,
  })
  if (!put.ok) throw new Error(`put failed: ${put.status}`)
} else {
  const partSize = init.partSize
  for (let index = 0; index < init.partCount; index += 1) {
    const partNumber = index + 1
    const start = index * partSize
    const chunk = payload.subarray(start, Math.min(start + partSize, payload.length))
    const urlResponse = await fetch(`${base}/api/upload/part-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: init.token, partNumber }),
    })
    const urlData = await json(urlResponse)
    if (!urlResponse.ok || !urlData.url) throw new Error(`part url failed: ${JSON.stringify(urlData)}`)
    const put = await fetch(urlData.url, { method: "PUT", body: chunk })
    if (!put.ok) throw new Error(`part ${partNumber} failed: ${put.status}`)
    completedParts.push({ partNumber, etag: put.headers.get("etag") })
  }
}

const completeResponse = await fetch(`${base}/api/upload/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: init.token, parts: completedParts }),
})
const completed = await json(completeResponse)
if (!completeResponse.ok || !completed.expiresAt) {
  throw new Error(`complete failed: ${JSON.stringify(completed)}`)
}

const firstDownload = await fetch(`${base}/api/download/${init.token}`, { redirect: "follow" })
if (!firstDownload.ok) throw new Error(`download failed: ${firstDownload.status}`)
const downloaded = Buffer.from(await firstDownload.arrayBuffer())
if (createHash("sha256").update(downloaded).digest("hex") !== digest) {
  throw new Error("checksum mismatch")
}

const secondDownload = await fetch(`${base}/api/download/${init.token}`, { redirect: "follow" })
if (!secondDownload.ok) throw new Error("second download failed")
await secondDownload.arrayBuffer()

process.stdout.write(
  JSON.stringify({
    ok: true,
    size: payload.length,
    mode: init.mode,
    digest,
    expiresAt: completed.expiresAt,
    tokenLength: String(init.token).length,
  })
)
