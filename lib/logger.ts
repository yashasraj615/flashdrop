type LogFields = Record<string, unknown>

const REDACTED_KEYS = new Set([
  "authorization",
  "token",
  "password",
  "secret",
  "url",
  "presignedurl",
  "signedurl",
  "downloadurl",
  "storageurl",
  "database_url",
])

function sanitize(value: unknown, key = ""): unknown {
  if (REDACTED_KEYS.has(key.toLowerCase())) return "[redacted]"
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nextKey, nextValue]) => [
        nextKey,
        sanitize(nextValue, nextKey),
      ])
    )
  }
  return value
}

export function logEvent(event: string, fields: LogFields = {}) {
  console.info(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...((sanitize(fields) as LogFields) ?? {}),
    })
  )
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      message,
      ...((sanitize(fields) as LogFields) ?? {}),
    })
  )
}
