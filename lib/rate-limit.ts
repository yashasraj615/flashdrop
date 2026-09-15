import "server-only"

import { getSql } from "@/lib/db"

export class RateLimitError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please wait a moment and try again.")
    this.name = "RateLimitError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]!.trim().slice(0, 128)
  }
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  ).slice(0, 128)
}

export async function enforceRateLimit(params: {
  key: string
  limit: number
  windowMs: number
}) {
  const sql = getSql()
  const windowStartCutoff = new Date(Date.now() - params.windowMs).toISOString()
  const rows = await sql`
    INSERT INTO rate_limits (key, window_start, count, updated_at)
    VALUES (${params.key}, NOW(), 1, NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits.window_start < ${windowStartCutoff}::timestamptz THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < ${windowStartCutoff}::timestamptz THEN NOW()
        ELSE rate_limits.window_start
      END,
      updated_at = NOW()
    RETURNING count, window_start
  `

  const count = Number(rows[0]?.count ?? 0)
  if (count > params.limit) {
    throw new RateLimitError(Math.ceil(params.windowMs / 1000))
  }
}

export async function pruneRateLimits() {
  const sql = getSql()
  await sql`DELETE FROM rate_limits WHERE updated_at < NOW() - INTERVAL '2 days'`
}
