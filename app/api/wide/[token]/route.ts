import { randomInt } from "node:crypto"
import { getSql } from "@/lib/db"
import {
  boundedJson,
  digest,
  ModeError,
  modeError,
  opaque,
  privateJson,
  validCapability,
} from "@/lib/mode-server"
import { validOffset, type WideFile } from "@/lib/mode-limits"
import { clientIp, enforceRateLimit } from "@/lib/rate-limit"
import { wideSession } from "@/lib/wide-server"
export const runtime = "nodejs"
type Context = { params: Promise<{ token: string }> }
async function context(request: Request, ctx: Context) {
  await enforceRateLimit({
    key: `wide-request:${clientIp(request)}`,
    limit: 6000,
    windowMs: 3600000,
  })
  const { token } = await ctx.params
  return {
    token,
    ...(await wideSession(
      token,
      request.headers.get("x-flashdrop-access") || ""
    )),
  }
}
export async function GET(request: Request, ctx: Context) {
  try {
    const { row, role, token } = await context(request, ctx),
      sql = getSql()
    if (role !== "invite")
      await sql`UPDATE wide_sessions SET last_activity = NOW() WHERE token = ${token} AND generation = ${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
    const approved = ["approved", "interrupted"].includes(String(row.status))
    return privateJson({
      role,
      status: row.status,
      files: row.manifest,
      totalSize: Number(row.total_size),
      expiresAt: row.expires_at,
      serverNow: row.server_now,
      pairingCode: role === "invite" ? undefined : row.pairing_code,
      senderFinished: Boolean(row.sender_finished_at),
      recipientFinished: Boolean(row.recipient_finished_at),
      generation: row.generation,
      progress: role === "invite" ? undefined : row.progress,
      offer: role === "recipient" && approved ? row.offer : undefined,
      answer: role === "owner" && approved ? row.answer : undefined,
    })
  } catch (e) {
    return modeError(e)
  }
}
export async function POST(request: Request, ctx: Context) {
  try {
    const { row, role, token } = await context(request, ctx),
      sql = getSql(),
      body = await boundedJson(request, 128 * 1024)
    const active = ["approved", "interrupted"].includes(String(row.status))
    if (body.action === "accept" && role === "invite") {
      if (!validCapability(body.recipient))
        throw new ModeError("Recipient credential is invalid.")
      const code = String(randomInt(100000, 1000000))
      const rows =
        await sql`UPDATE wide_sessions SET recipient_hash = ${digest(body.recipient)}, pairing_code = ${code}, status = 'pending', last_activity = NOW()
        WHERE token = ${token} AND status = 'waiting' AND recipient_hash IS NULL AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours' RETURNING token`
      if (!rows.length)
        throw new ModeError(
          "Another device has already requested this session. Ask the sender to reset pairing.",
          409
        )
    } else if (body.action === "approve" && role === "owner") {
      const rows =
        await sql`UPDATE wide_sessions SET status = 'approved', last_activity = NOW() WHERE token = ${token} AND status = 'pending' AND pairing_code = ${String(body.code)} AND generation = ${row.generation} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours' RETURNING token`
      if (!rows.length)
        throw new ModeError(
          "Pairing has changed. Compare the current code with the recipient and try again.",
          409
        )
    } else if (
      body.action === "finish" &&
      role !== "invite" &&
      row.status === "complete"
    ) {
      const sender = role === "owner"
      // One UPDATE evaluates both acknowledgements atomically against the current row.
      const rows = await sql`UPDATE wide_sessions SET
        sender_finished_at = CASE WHEN ${sender} THEN COALESCE(sender_finished_at,NOW()) ELSE sender_finished_at END,
        recipient_finished_at = CASE WHEN ${!sender} THEN COALESCE(recipient_finished_at,NOW()) ELSE recipient_finished_at END,
        finished_at = CASE WHEN (${sender} OR sender_finished_at IS NOT NULL) AND (${!sender} OR recipient_finished_at IS NOT NULL) THEN NOW() ELSE NULL END,
        status = CASE WHEN (${sender} OR sender_finished_at IS NOT NULL) AND (${!sender} OR recipient_finished_at IS NOT NULL) THEN 'closed' ELSE 'complete' END,
        owner_hash = CASE WHEN (${sender} OR sender_finished_at IS NOT NULL) AND (${!sender} OR recipient_finished_at IS NOT NULL) THEN ${digest(opaque())} ELSE owner_hash END,
        invite_hash = CASE WHEN (${sender} OR sender_finished_at IS NOT NULL) AND (${!sender} OR recipient_finished_at IS NOT NULL) THEN ${digest(opaque())} ELSE invite_hash END,
        recipient_hash = CASE WHEN (${sender} OR sender_finished_at IS NOT NULL) AND (${!sender} OR recipient_finished_at IS NOT NULL) THEN NULL ELSE recipient_hash END,
        offer=NULL, answer=NULL, pairing_code=NULL, last_activity=NOW(),
        expires_at=CASE WHEN (${sender} OR sender_finished_at IS NOT NULL) AND (${!sender} OR recipient_finished_at IS NOT NULL) THEN LEAST(expires_at,NOW()+INTERVAL '1 hour') ELSE expires_at END
        WHERE token=${token} AND status='complete' AND generation=${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash}
        AND expires_at>NOW() AND last_activity>NOW()-INTERVAL '2 hours' RETURNING status`
      if (!rows.length)
        throw new ModeError(
          "Session status changed. Refresh and try again.",
          409
        )
      return privateJson({ ok: true, closed: rows[0].status === "closed" })
    } else if (
      body.action === "reset" &&
      role === "owner" &&
      row.status !== "complete"
    ) {
      await sql`UPDATE wide_sessions SET recipient_hash = NULL, pairing_code = NULL, status = 'waiting', offer = NULL, answer = NULL, progress = '{}', sender_finished_at=NULL, recipient_finished_at=NULL, completed_at=NULL, generation = generation + 1, last_activity = NOW() WHERE token = ${token} AND generation = ${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
    } else if (body.action === "decline" && role !== "invite") {
      await sql`UPDATE wide_sessions SET status = 'declined', offer = NULL, answer = NULL, last_activity = NOW() WHERE token = ${token} AND generation = ${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
    } else if (body.action === "signal" && role !== "invite" && active) {
      const s = body.signal as Record<string, unknown> | undefined
      if (
        !s ||
        typeof s.sdp !== "string" ||
        s.sdp.length > 65536 ||
        !s.sdp.includes("m=application") ||
        s.type !== (role === "owner" ? "offer" : "answer")
      )
        throw new ModeError(
          "The connection message is invalid. Retry the connection."
        )
      if (role === "owner") {
        await sql`UPDATE wide_sessions SET offer = ${JSON.stringify({ type: s.type, sdp: s.sdp })}::jsonb, answer = NULL, generation = generation + 1, last_activity = NOW() WHERE token = ${token} AND status IN ('approved','interrupted') AND generation = ${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
      } else {
        const rows =
          await sql`UPDATE wide_sessions SET answer = ${JSON.stringify({ type: s.type, sdp: s.sdp })}::jsonb, last_activity = NOW() WHERE token = ${token} AND generation = ${Number(body.generation)} AND status IN ('approved','interrupted') AND recipient_hash = ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours' RETURNING token`
        if (!rows.length)
          throw new ModeError(
            "The sender restarted the connection. Retry to reconnect.",
            409
          )
      }
    } else if (
      body.action === "progress" &&
      role === "recipient" &&
      (active || row.status === "complete")
    ) {
      const files = row.manifest as WideFile[],
        progress = body.progress as
          Record<string, { offset: number; chain: string }> | undefined
      if (
        !progress ||
        typeof progress !== "object" ||
        Array.isArray(progress) ||
        Object.keys(progress).length > files.length
      )
        throw new ModeError("Invalid transfer progress.")
      for (const [key, p] of Object.entries(progress)) {
        const i = Number(key)
        if (
          !Number.isInteger(i) ||
          String(i) !== key ||
          !files[i] ||
          !p ||
          !validOffset(p.offset, files[i].size) ||
          !/^[a-f0-9]{64}$/.test(p.chain)
        )
          throw new ModeError("Invalid acknowledged offset.")
      }
      const complete = files.every(
        (f, i) =>
          progress[String(i)]?.offset === f.size &&
          (progress[String(i)] as { verified?: boolean })?.verified === true
      )
      await sql`UPDATE wide_sessions SET progress = ${JSON.stringify(progress)}::jsonb, status = ${complete ? "complete" : "approved"}, completed_at = CASE WHEN ${complete} THEN COALESCE(completed_at,NOW()) ELSE NULL END, last_activity = NOW() WHERE (status IN ('approved','interrupted') OR (status='complete' AND ${complete})) AND token = ${token} AND generation = ${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
    } else if (body.action === "interrupt" && role !== "invite" && active) {
      await sql`UPDATE wide_sessions SET status = 'interrupted', last_activity = NOW() WHERE token = ${token} AND generation = ${row.generation} AND recipient_hash IS NOT DISTINCT FROM ${row.recipient_hash} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
    } else
      throw new ModeError(
        "This action is unavailable for this device or session. Refresh its status.",
        403
      )
    return privateJson({ ok: true })
  } catch (e) {
    return modeError(e)
  }
}
