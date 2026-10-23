import { getSql } from "@/lib/db"
import { validateManifest } from "@/lib/mode-limits"
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
      key: `wide-create:${clientIp(request)}`,
      limit: 20,
      windowMs: 3600000,
    })
    const body = await boundedJson(request, 768 * 1024)
    let files
    try {
      files = validateManifest(body.files)
    } catch (e) {
      throw new ModeError((e as Error).message)
    }
    const token = opaque(),
      owner = opaque(),
      invite = opaque(),
      sql = getSql()
    const rows =
      await sql`INSERT INTO wide_sessions (token, owner_hash, invite_hash, manifest, total_size)
      VALUES (${token}, ${digest(owner)}, ${digest(invite)}, ${JSON.stringify(files)}::jsonb, ${files.reduce((n, f) => n + f.size, 0)}) RETURNING expires_at`
    return privateJson(
      { token, owner, invite, expiresAt: rows[0].expires_at },
      201
    )
  } catch (e) {
    return modeError(e)
  }
}
