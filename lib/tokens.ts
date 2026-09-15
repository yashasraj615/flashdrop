import { randomBytes } from "node:crypto"

const TOKEN_BYTES = 32

export function createDownloadToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url")
}

export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token)
}

export function tokenPreview(token: string): string {
  return `${token.slice(0, 6)}…${token.slice(-4)}`
}
