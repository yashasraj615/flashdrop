import { getSql } from "@/lib/db"
import { requireLifetimeSeconds } from "@/lib/lifetime"
import { validateText } from "@/lib/mode-limits"
import {
  boundedJson,
  digest,
  ModeError,
  modeError,
  opaque,
  privateJson,
} from "@/lib/mode-server"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: `text-create:${clientIp(request)}`,
      limit: 20,
      windowMs: 3600000,
    })
    const body = await boundedJson(request, 2 * 1024 * 1024)
    let lifetime: number
    try {
      validateText(body.content)
      lifetime = requireLifetimeSeconds(body.lifetimeSeconds)
    } catch (e) {
      throw new ModeError((e as Error).message)
    }
    const format = body.format === "plain" ? "plain" : "markdown"
    const token = opaque(),
      access = opaque(),
      sql = getSql()
    const rows =
      await sql`INSERT INTO text_pads (token, access_hash, content, format, expires_at)
      VALUES (${token}, ${digest(access)}, ${body.content as string}, ${format}, NOW() + make_interval(secs => ${lifetime})) RETURNING expires_at`
    return privateJson({ token, access, expiresAt: rows[0].expires_at }, 201)
  } catch (e) {
    return modeError(e)
  }
}
