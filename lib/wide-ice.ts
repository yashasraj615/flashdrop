import "server-only"
import { createHmac } from "node:crypto"
import { ModeError } from "@/lib/mode-server"
export function relayConfigured() {
  return Boolean(
    (process.env.WIDE_TURN_URLS && process.env.WIDE_TURN_SECRET) ||
    (process.env.CLOUDFLARE_TURN_KEY_ID &&
      process.env.CLOUDFLARE_TURN_API_TOKEN)
  )
}
export async function iceServers(): Promise<RTCIceServer[]> {
  const servers: RTCIceServer[] = [
    { urls: process.env.WIDE_STUN_URL || "stun:stun.l.google.com:19302" },
  ]
  const id = process.env.CLOUDFLARE_TURN_KEY_ID,
    token = process.env.CLOUDFLARE_TURN_API_TOKEN
  if (id && token) {
    if (!/^[a-f0-9]{32}$/i.test(id))
      throw new ModeError(
        "The relay configuration needs attention. Ask the sender to retry later.",
        503
      )
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 3600 }),
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        }
      )
      if (!r.ok) throw Error("Relay credential service unavailable")
      const d = (await r.json()) as { iceServers?: RTCIceServer[] }
      if (
        !Array.isArray(d.iceServers) ||
        !d.iceServers.some((s) => s.username && s.credential)
      )
        throw Error("Invalid relay response")
      for (const s of d.iceServers) {
        const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(
          (u) => /^(stun|turn|turns):/.test(u) && !/:53(?:\?|$)/.test(u)
        )
        if (urls.length)
          servers.push({ urls, username: s.username, credential: s.credential })
      }
    } catch {
      throw new ModeError(
        "The configured relay is temporarily unavailable. Retry shortly or try another network.",
        503
      )
    }
  } else if (process.env.WIDE_TURN_SECRET && process.env.WIDE_TURN_URLS) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:flashdrop`
    servers.push({
      urls: process.env.WIDE_TURN_URLS.split(",").map((u) => u.trim()),
      username,
      credential: createHmac("sha1", process.env.WIDE_TURN_SECRET)
        .update(username)
        .digest("base64"),
    })
  }
  return servers
}
