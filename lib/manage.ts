import { createHash, timingSafeEqual } from "node:crypto"

import { createDownloadToken } from "@/lib/tokens"

export function createManageToken() {
  return createDownloadToken()
}

export function hashManageToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function manageTokensMatch(provided: string | null | undefined, storedHash: string) {
  if (!provided) return false
  const providedHash = hashManageToken(provided)
  const left = Buffer.from(providedHash)
  const right = Buffer.from(storedHash)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
