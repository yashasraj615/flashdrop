import "server-only"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { handleRouteError, jsonError } from "@/lib/http"
export class ModeError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}
export const opaque = () => randomBytes(32).toString("base64url")
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export const validCapability = (v: unknown): v is string =>
  typeof v === "string" && /^[\w-]{43}$/.test(v)
export function matches(value: string, hash: string) {
  return (
    validCapability(value) &&
    hash.length === 64 &&
    timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash))
  )
}
export function privateJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}
export async function boundedJson(request: Request, limit = 128 * 1024) {
  const origin = request.headers.get("origin")
  if (origin) {
    let allowed = false
    try {
      const source = new URL(origin),
        host = request.headers.get("host") || new URL(request.url).host
      // Next may normalize its internal request URL to localhost. HTTP Host still
      // identifies the browser destination; browsers cannot forge it. Never trust
      // a client-supplied x-forwarded-host as an origin authorization bypass.
      allowed =
        ["http:", "https:"].includes(source.protocol) &&
        source.host.toLowerCase() === host.toLowerCase() &&
        source.pathname === "/" &&
        !source.search &&
        !source.hash
    } catch {}
    if (!allowed)
      throw new ModeError("Open this transfer on Flashdrop to continue.", 403)
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ModeError("Send a JSON request.", 415)
  const reader = request.body?.getReader()
  if (!reader) throw new ModeError("The request is empty.")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) {
        await reader.cancel()
        throw new ModeError(
          "This request is too large. Reduce the content and try again.",
          413
        )
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) {
      bytes.set(c, offset)
      offset += c.length
    }
    const value = JSON.parse(new TextDecoder().decode(bytes))
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid object")
    return value as Record<string, unknown>
  } catch (e) {
    if (e instanceof ModeError) throw e
    throw new ModeError("This request could not be read. Try again.")
  }
}
export function modeError(e: unknown) {
  return e instanceof ModeError
    ? jsonError(e.message, e.status)
    : handleRouteError(e)
}
