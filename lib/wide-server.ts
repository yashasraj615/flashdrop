import "server-only"
import { getSql } from "@/lib/db"
import { matches, ModeError, validCapability } from "@/lib/mode-server"
export async function wideSession(token: string, credential: string) {
  if (!validCapability(token) || !validCapability(credential))
    throw new ModeError(
      "This invitation is incomplete. Ask the sender for the full link.",
      403
    )
  const sql = getSql()
  const rows =
    await sql`SELECT *, NOW() AS server_now FROM wide_sessions WHERE token = ${token} AND expires_at > NOW() AND last_activity > NOW() - INTERVAL '2 hours'`
  const row = rows[0]
  if (!row)
    throw new ModeError(
      "This session has expired. Create a new invitation.",
      410
    )
  if (row.status === "closed")
    throw new ModeError(
      "This session is finished. Its connection and credentials have been closed; received local files are still yours.",
      410
    )
  const role = matches(credential, String(row.owner_hash))
    ? "owner"
    : row.recipient_hash && matches(credential, String(row.recipient_hash))
      ? "recipient"
      : matches(credential, String(row.invite_hash))
        ? "invite"
        : null
  if (!role)
    throw new ModeError(
      "This device is not authorized. Open the full invitation link.",
      403
    )
  return { row, role }
}
