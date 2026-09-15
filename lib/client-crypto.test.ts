import { describe, expect, it } from "vitest"

import {
  ENCRYPTION_CHUNK_BYTES,
  ENCRYPTION_OVERHEAD_PER_CHUNK,
  MAX_TRANSFER_SIZE_BYTES,
  chunkCount,
  encryptedSize,
} from "@/lib/constants"
import {
  decryptChunk,
  deriveFileKey,
  encryptChunk,
  parseTransferSecret,
  createTransferSecret,
} from "@/lib/client-crypto"

describe("encryption format", () => {
  it("adds a unique IV and GCM tag per chunk", () => {
    expect(encryptedSize(ENCRYPTION_CHUNK_BYTES)).toBe(
      ENCRYPTION_CHUNK_BYTES + ENCRYPTION_OVERHEAD_PER_CHUNK
    )
    expect(chunkCount(MAX_TRANSFER_SIZE_BYTES)).toBeGreaterThan(100)
    expect(encryptedSize(MAX_TRANSFER_SIZE_BYTES)).toBeGreaterThan(MAX_TRANSFER_SIZE_BYTES)
  })
})

describe("webcrypto roundtrip", () => {
  it("encrypts and decrypts a chunk with the transfer secret", async () => {
    const secret = createTransferSecret()
    const master = parseTransferSecret(secret)
    expect(master).not.toBeNull()
    const key = await deriveFileKey(master!, "11111111-2222-4333-8444-555555555555")
    const plain = new TextEncoder().encode("flashdrop-e2e")
    const packed = await encryptChunk(key, plain, "11111111-2222-4333-8444-555555555555", 0)
    const decoded = await decryptChunk(key, packed, "11111111-2222-4333-8444-555555555555", 0)
    expect(new TextDecoder().decode(decoded)).toBe("flashdrop-e2e")
  })

  it("rejects a wrong secret", async () => {
    const keyA = await deriveFileKey(parseTransferSecret(createTransferSecret())!, "file-a")
    const keyB = await deriveFileKey(parseTransferSecret(createTransferSecret())!, "file-a")
    const packed = await encryptChunk(keyA, new TextEncoder().encode("secret"), "file-a", 0)
    await expect(decryptChunk(keyB, packed, "file-a", 0)).rejects.toThrow("Unable to decrypt this file.")
  })

  it("rejects truncated ciphertext", async () => {
    const key = await deriveFileKey(parseTransferSecret(createTransferSecret())!, "file-b")
    await expect(decryptChunk(key, new Uint8Array(10), "file-b", 0)).rejects.toThrow(
      "Unable to decrypt this file."
    )
  })
})
