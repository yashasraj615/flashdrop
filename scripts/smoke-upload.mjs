import { createHash } from "node:crypto"

const base = "http://127.0.0.1:3000"
const payload = Buffer.alloc(Number(process.env.SMOKE_BYTES || 600 * 1024), 7)
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
if (!initResponse.ok || !init.token) {
  throw new Error(`init failed: ${JSON.stringify(init)}`)
}

const chunkSize = init.chunkSize
const chunkCount = init.chunkCount
if (chunkCount !== Math.ceil(payload.length / chunkSize)) {
  throw new Error(`expected ${Math.ceil(payload.length / chunkSize)} chunks, got ${chunkCount}`)
}

for (let index = 0; index < chunkCount; index += 1) {
  const start = index * chunkSize
  const end = Math.min(start + chunkSize, payload.length)
  const chunk = payload.subarray(start, end)
  const checksum = createHash("sha256").update(chunk).digest("hex")
  const chunkResponse = await fetch(`${base}/api/upload/chunk`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-upload-token": init.token,
      "x-chunk-index": String(index),
      "x-chunk-checksum": checksum,
    },
    body: chunk,
  })
  const chunkData = await json(chunkResponse)
  if (!chunkResponse.ok) throw new Error(`chunk ${index} failed: ${JSON.stringify(chunkData)}`)
}

const completeResponse = await fetch(`${base}/api/upload/complete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: init.token }),
})
const completed = await json(completeResponse)
if (!completeResponse.ok || !completed.expiresAt) {
  throw new Error(`complete failed: ${JSON.stringify(completed)}`)
}

const firstDownload = await fetch(`${base}/api/download/${init.token}`)
if (!firstDownload.ok) throw new Error(`download failed: ${firstDownload.status}`)
const disposition = firstDownload.headers.get("content-disposition") ?? ""
const type = firstDownload.headers.get("content-type") ?? ""
const length = Number(firstDownload.headers.get("content-length") ?? "0")
if (!disposition.includes("attachment")) throw new Error(`missing attachment header: ${disposition}`)
if (type !== "application/octet-stream") throw new Error(`unexpected type ${type}`)
if (length !== payload.length) throw new Error(`length ${length} != ${payload.length}`)
const downloaded = Buffer.from(await firstDownload.arrayBuffer())
const downloadedDigest = createHash("sha256").update(downloaded).digest("hex")
if (downloadedDigest !== digest) throw new Error("checksum mismatch")

const secondDownload = await fetch(`${base}/api/download/${init.token}`)
if (!secondDownload.ok) throw new Error("second download failed")
await secondDownload.arrayBuffer()

const metadata = await json(await fetch(`${base}/api/files/${init.token}`))
if (metadata.size !== payload.length) throw new Error("metadata size mismatch")

process.stdout.write(
  JSON.stringify({
    ok: true,
    size: payload.length,
    chunks: chunkCount,
    digest,
    expiresAt: completed.expiresAt,
    tokenLength: String(init.token).length,
  })
)
