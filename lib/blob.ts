import "server-only"

import {
  del,
  getDownloadUrl,
  head,
  issueSignedToken,
  presignUrl,
} from "@vercel/blob"

import { DOWNLOAD_URL_TTL_MS } from "@/lib/constants"
import { logError } from "@/lib/logger"

export async function verifyStoredBlob(url: string) {
  return head(url)
}

export async function deleteStoredBlob(urlOrPathname: string | null | undefined) {
  if (!urlOrPathname) return { deleted: false as const, missing: true as const }
  try {
    await del(urlOrPathname)
    return { deleted: true as const, missing: false as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown storage error"
    if (/not found|404/i.test(message)) {
      return { deleted: false as const, missing: true as const }
    }
    logError("storage.delete_failed", error)
    throw error
  }
}

export async function createSignedDownloadUrl(pathname: string) {
  const validUntil = Date.now() + DOWNLOAD_URL_TTL_MS
  const signedToken = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  })
  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "get",
    pathname,
    access: "private",
    validUntil,
    useCache: true,
  })
  return getDownloadUrl(presignedUrl)
}
