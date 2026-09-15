import { randomBytes } from "node:crypto"

import { isPlausibleToken, tokenPreview } from "@/lib/token-format"

const TOKEN_BYTES = 32

export function createDownloadToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url")
}

export { isPlausibleToken, tokenPreview }
