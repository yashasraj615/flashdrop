import { RateLimitError } from "@/lib/rate-limit"

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status })
}

export function handleRouteError(error: unknown) {
  if (error instanceof RateLimitError) {
    return jsonError(error.message, 429, { retryAfterSeconds: error.retryAfterSeconds })
  }
  const message = error instanceof Error ? error.message : "Something went wrong"
  if (message.includes("not configured")) {
    return jsonError("We couldn't prepare your file. Please try again.", 503)
  }
  return jsonError("Something went wrong. Please try again.", 500)
}
