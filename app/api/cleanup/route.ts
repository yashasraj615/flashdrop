import { runCleanup } from "@/lib/cleanup"
import { jsonError } from "@/lib/http"
import { logError, logEvent } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 60

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (secret) {
    return authorization === `Bearer ${secret}`
  }
  const userAgent = request.headers.get("user-agent") ?? ""
  return userAgent.startsWith("vercel-cron/")
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    logEvent("cleanup.unauthorized")
    return jsonError("Unauthorized", 401)
  }

  try {
    const result = await runCleanup()
    return Response.json({ ok: true, ...result })
  } catch (error) {
    logError("cleanup.endpoint_failed", error)
    return jsonError("Cleanup failed", 500)
  }
}

export async function POST(request: Request) {
  return GET(request)
}
