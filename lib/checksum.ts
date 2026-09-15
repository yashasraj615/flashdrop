import { createHash } from "node:crypto"

export function hashChunk(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
