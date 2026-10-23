import { getSql } from "@/lib/db"
import {
  matches,
  ModeError,
  modeError,
  privateJson,
  validCapability,
} from "@/lib/mode-server"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
export const runtime = "nodejs"
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    await enforceRateLimit({
      key: `text-read:${clientIp(request)}`,
      limit: 180,
      windowMs: 3600000,
    })
    const { token } = await context.params
    if (!validCapability(token))
      throw new ModeError("This Text Pad is unavailable.", 404)
    const sql = getSql(),
      access = request.headers.get("x-flashdrop-access") || ""
    const rows =
      await sql`SELECT content, format, access_hash, expires_at, NOW() AS server_now FROM text_pads WHERE token = ${token} AND expires_at > NOW()`
    const row = rows[0]
    if (!row || !matches(access, String(row.access_hash)))
      throw new ModeError(
        "This Text Pad has expired or the link is incomplete. Ask the sender for a new full link.",
        404
      )
    return privateJson({
      content: row.content,
      format: row.format,
      expiresAt: row.expires_at,
      serverNow: row.server_now,
    })
  } catch (e) {
    return modeError(e)
  }
}
