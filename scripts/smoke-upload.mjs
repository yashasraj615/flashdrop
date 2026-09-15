import { createHash, webcrypto } from "node:crypto"
import { readFileSync } from "node:fs"

if (!globalThis.crypto) globalThis.crypto = webcrypto

function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const index = trimmed.indexOf("=")
      env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, "")
    }
  } catch {
    // optional
  }
  return env
}

const env = loadEnv()
const base = process.env.SMOKE_BASE || "http://127.0.0.1:3000"
const FILE_INFO = new TextEncoder().encode("flashdrop-file-v1")

function bytesToBase64url(bytes) {
  return Buffer.from(bytes).toString("base64url")
}

function createSecret() {
  return bytesToBase64url(webcrypto.getRandomValues(new Uint8Array(32)))
}

function parseSecret(secret) {
  return new Uint8Array(Buffer.from(secret, "base64url"))
}

async function deriveFileKey(master, fileId) {
  const baseKey = await webcrypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"])
  return webcrypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(fileId), info: FILE_INFO },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

async function encryptAll(fileBytes, fileId, master, chunkSize) {
  const key = await deriveFileKey(master, fileId)
  const chunks = Math.ceil(fileBytes.length / chunkSize)
  const parts = []
  for (let index = 0; index < chunks; index += 1) {
    const start = index * chunkSize
    const slice = fileBytes.subarray(start, start + chunkSize)
    const iv = webcrypto.getRandomValues(new Uint8Array(12))
    const aad = new TextEncoder().encode(`v1:${fileId}:${index}`)
    const ciphertext = new Uint8Array(
      await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, slice)
    )
    const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength)
    packed.set(iv, 0)
    packed.set(ciphertext, iv.byteLength)
    parts.push(packed)
  }
  return Buffer.concat(parts.map((part) => Buffer.from(part)))
}

async function decryptAll(packed, fileId, master, chunkSize, plainSize) {
  const key = await deriveFileKey(master, fileId)
  const out = []
  let offset = 0
  let index = 0
  let remaining = plainSize
  while (remaining > 0) {
    const length = Math.min(chunkSize, remaining)
    const packedLength = length + 28
    const chunk = packed.subarray(offset, offset + packedLength)
    const iv = chunk.subarray(0, 12)
    const ciphertext = chunk.subarray(12)
    const aad = new TextEncoder().encode(`v1:${fileId}:${index}`)
    const plain = new Uint8Array(
      await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, ciphertext)
    )
    out.push(Buffer.from(plain))
    offset += packedLength
    remaining -= plain.byteLength
    index += 1
  }
  return Buffer.concat(out)
}

async function json(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function uploadPlans(token, manageToken, secret, files, plans) {
  const master = parseSecret(secret)
  const byIndex = files
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index]
    const file = byIndex[index]
    const packed = await encryptAll(file.bytes, plan.id, master, plan.chunkSize)
    if (packed.length !== plan.encryptedSize) {
      throw new Error(`encrypted size mismatch for ${plan.filename}`)
    }
    const completedParts = []
    if (plan.mode === "put") {
      const put = await fetch(plan.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: packed,
      })
      if (!put.ok) throw new Error(`put failed ${put.status}`)
    } else {
      for (let partIndex = 0; partIndex < plan.partCount; partIndex += 1) {
        const start = partIndex * plan.partSize
        const part = packed.subarray(start, start + plan.partSize)
        const urlResponse = await fetch(`${base}/api/transfers/${token}/files/${plan.id}/part-url`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-flashdrop-manage": manageToken,
          },
          body: JSON.stringify({ partNumber: partIndex + 1, manageToken }),
        })
        const urlData = await json(urlResponse)
        const put = await fetch(urlData.url, { method: "PUT", body: part })
        if (!put.ok) throw new Error(`part failed ${put.status}`)
        completedParts.push({ partNumber: partIndex + 1, etag: put.headers.get("etag") })
      }
    }
    const complete = await fetch(`${base}/api/transfers/${token}/files/${plan.id}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flashdrop-manage": manageToken,
      },
      body: JSON.stringify({ parts: completedParts, manageToken }),
    })
    if (!complete.ok) throw new Error(`complete failed ${JSON.stringify(await json(complete))}`)
  }
}

const tooBig = await fetch(`${base}/api/transfers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    files: [{ filename: "too-big.bin", mimeType: "application/octet-stream", size: 1073741825 }],
  }),
})
if (tooBig.status !== 413) throw new Error(`expected 413, got ${tooBig.status}`)

const fileA = { filename: "a.bin", mimeType: "application/octet-stream", size: 32 * 1024, bytes: Buffer.alloc(32 * 1024, 7) }
const fileB = { filename: "b.bin", mimeType: "application/octet-stream", size: 48 * 1024, bytes: Buffer.alloc(48 * 1024, 9) }
fileA.bytes[0] = 0x11
fileB.bytes[0] = 0x22

const secret = createSecret()
const initResponse = await fetch(`${base}/api/transfers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    files: [
      { filename: fileA.filename, mimeType: fileA.mimeType, size: fileA.size },
      { filename: fileB.filename, mimeType: fileB.mimeType, size: fileB.size },
    ],
  }),
})
const init = await json(initResponse)
if (!initResponse.ok || !init.token || !init.manageToken) throw new Error(`init failed ${JSON.stringify(init)}`)
const token = init.token
await uploadPlans(token, init.manageToken, secret, [fileA, fileB], init.files)

const meta = await json(await fetch(`${base}/api/transfers/${token}`))
if (meta.fileCount !== 2) throw new Error("expected 2 files")
const sameToken = meta.token

const fileC = { filename: "c.bin", mimeType: "application/octet-stream", size: 16 * 1024, bytes: Buffer.alloc(16 * 1024, 3) }
const addResponse = await fetch(`${base}/api/transfers/${token}/files`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-flashdrop-manage": init.manageToken,
  },
  body: JSON.stringify({
    manageToken: init.manageToken,
    files: [{ filename: fileC.filename, mimeType: fileC.mimeType, size: fileC.size }],
  }),
})
const added = await json(addResponse)
if (!addResponse.ok) throw new Error(`add failed ${JSON.stringify(added)}`)
if (added.token !== sameToken) throw new Error("token changed after adding files")
await uploadPlans(token, init.manageToken, secret, [fileC], added.files)

const afterAdd = await json(await fetch(`${base}/api/transfers/${token}`))
if (afterAdd.fileCount !== 3) throw new Error("expected 3 files")
if (afterAdd.token !== token) throw new Error("token drifted")

const oversize = await fetch(`${base}/api/transfers/${token}/files`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-flashdrop-manage": init.manageToken,
  },
  body: JSON.stringify({
    manageToken: init.manageToken,
    files: [{ filename: "huge.bin", mimeType: "application/octet-stream", size: 1073741824 }],
  }),
})
if (oversize.status !== 413) throw new Error(`expected add 413, got ${oversize.status}`)

const forbidden = await fetch(`${base}/api/transfers/${token}/files`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ files: [{ filename: "x.bin", size: 10 }] }),
})
if (forbidden.status !== 403) throw new Error(`expected 403, got ${forbidden.status}`)

const master = parseSecret(secret)
let downloaded = 0
for (const file of afterAdd.files) {
  const downloadMeta = await json(await fetch(`${base}/api/transfers/${token}/files/${file.id}/download`))
  const cipherResponse = await fetch(downloadMeta.url)
  const packed = Buffer.from(await cipherResponse.arrayBuffer())
  if (packed.equals(file.filename === "a.bin" ? fileA.bytes : Buffer.alloc(0)) === true) {
    throw new Error("storage returned plaintext")
  }
  const plain = await decryptAll(packed, file.id, master, file.chunkSize, file.size)
  const expected = file.filename === "a.bin" ? fileA.bytes : file.filename === "b.bin" ? fileB.bytes : fileC.bytes
  if (createHash("sha256").update(plain).digest("hex") !== createHash("sha256").update(expected).digest("hex")) {
    throw new Error(`checksum mismatch for ${file.filename}`)
  }
  downloaded += 1
}

if (downloaded !== 3) throw new Error("missing downloads")

process.stdout.write(
  JSON.stringify({
    ok: true,
    tokenLength: token.length,
    sameToken: true,
    files: 3,
    totalSize: afterAdd.totalSize,
  })
)

void env
