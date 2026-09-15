import {
  ENCRYPTION_CHUNK_BYTES,
  ENCRYPTION_VERSION,
  GCM_IV_BYTES,
  chunkCount,
  encryptedChunkLength,
  encryptedSize,
  plaintextChunkRange,
} from "@/lib/constants"
import { isPlausibleToken } from "@/lib/token-format"

const FILE_INFO = new TextEncoder().encode("flashdrop-file-v1")

export class DecryptError extends Error {
  constructor() {
    super("Unable to decrypt this file.")
    this.name = "DecryptError"
  }
}

export function createTransferSecret() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToBase64url(bytes)
}

export function parseTransferSecret(secret: string | null | undefined) {
  if (!secret || !isPlausibleToken(secret)) return null
  try {
    const bytes = base64urlToBytes(secret)
    return bytes.byteLength === 32 ? bytes : null
  } catch {
    return null
  }
}

export function bytesToBase64url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function base64urlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((value.length * 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function deriveFileKey(masterKey: Uint8Array, fileId: string) {
  const baseKey = await crypto.subtle.importKey("raw", asBufferSource(masterKey), "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(fileId),
      info: FILE_INFO,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

function additionalData(fileId: string, chunkIndex: number) {
  return new TextEncoder().encode(`${ENCRYPTION_VERSION}:${fileId}:${chunkIndex}`)
}

export async function encryptChunk(
  key: CryptoKey,
  plaintext: BufferSource,
  fileId: string,
  chunkIndex: number
) {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asBufferSource(iv), additionalData: additionalData(fileId, chunkIndex) },
      key,
      plaintext
    )
  )
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(ciphertext, iv.byteLength)
  return packed
}

export async function decryptChunk(
  key: CryptoKey,
  packed: Uint8Array,
  fileId: string,
  chunkIndex: number
) {
  if (packed.byteLength < GCM_IV_BYTES + 16) {
    throw new DecryptError()
  }
  const iv = packed.subarray(0, GCM_IV_BYTES)
  const ciphertext = packed.subarray(GCM_IV_BYTES)
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asBufferSource(iv), additionalData: additionalData(fileId, chunkIndex) },
        key,
        asBufferSource(ciphertext)
      )
    )
  } catch {
    throw new DecryptError()
  }
}

export async function encryptFileChunk(
  file: Blob,
  key: CryptoKey,
  fileId: string,
  chunkIndex: number,
  chunkSize = ENCRYPTION_CHUNK_BYTES
) {
  const { offset, length } = plaintextChunkRange(chunkIndex, file.size, chunkSize)
  const plaintext = await file.slice(offset, offset + length).arrayBuffer()
  return encryptChunk(key, plaintext, fileId, chunkIndex)
}

export { chunkCount, encryptedChunkLength, encryptedSize }
