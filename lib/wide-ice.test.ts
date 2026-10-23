import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { iceServers, relayConfigured } from "./wide-ice"
beforeEach(() => {
  for (const key of [
    "CLOUDFLARE_TURN_KEY_ID",
    "CLOUDFLARE_TURN_API_TOKEN",
    "WIDE_TURN_SECRET",
    "WIDE_TURN_URLS",
    "WIDE_STUN_URL",
  ])
    vi.stubEnv(key, "")
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe("scoped ICE credentials", () => {
  it("makes no relay claim without a configured provider", async () => {
    expect(relayConfigured()).toBe(false)
    expect(await iceServers()).toHaveLength(1)
  })
  it("uses standard short-lived TURN REST credentials", async () => {
    vi.stubEnv("WIDE_TURN_SECRET", "server-secret")
    vi.stubEnv("WIDE_TURN_URLS", "turn:relay.example:3478")
    const s = await iceServers()
    expect(s[1].username).toMatch(/^\d+:flashdrop$/)
    expect(s[1].credential).not.toContain("server-secret")
  })
  it("calls the managed provider only server-side and filters browser-blocked ports", async () => {
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "a".repeat(32))
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "scoped-api-secret")
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          iceServers: [
            {
              urls: [
                "turn:turn.cloudflare.com:3478?transport=udp",
                "turn:turn.cloudflare.com:53?transport=udp",
              ],
              username: "temporary-user",
              credential: "temporary-password",
            },
          ],
        })
      )
    vi.stubGlobal("fetch", fetch)
    const servers = await iceServers()
    expect(fetch).toHaveBeenCalledOnce()
    expect(servers[1].urls).toEqual([
      "turn:turn.cloudflare.com:3478?transport=udp",
    ])
    expect(JSON.stringify(servers)).not.toContain("scoped-api-secret")
  })
  it("returns a professional failure without leaking provider credentials or response details", async () => {
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "a".repeat(32))
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "scoped-api-secret")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private-provider-debug", { status: 403 })
        )
    )
    await expect(iceServers()).rejects.toMatchObject({
      status: 503,
      message:
        "The configured relay is temporarily unavailable. Retry shortly or try another network.",
    })
  })
})
