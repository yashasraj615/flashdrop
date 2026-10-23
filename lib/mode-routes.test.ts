import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const database = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  queries: [] as { sql: string; values: unknown[] }[],
}))
vi.mock("@/lib/db", () => ({
  getSql:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      database.queries.push({ sql: strings.join("?"), values })
      return database.rows
    },
}))
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  clientIp: () => "test-ip",
  RateLimitError: class extends Error {},
}))
import { boundedJson, digest } from "./mode-server"
import { GET as textGet } from "../app/api/text/[token]/route"
import { POST as textCreate } from "../app/api/text/route"
import { GET as wideGet, POST as widePost } from "../app/api/wide/[token]/route"
import { wideSession } from "./wide-server"
const token = "t".repeat(43),
  owner = "o".repeat(43),
  invite = "i".repeat(43),
  recipient = "r".repeat(43)
const params = { params: Promise.resolve({ token }) }
const files = [
  { name: "test.bin", size: 12288, modified: 1, fingerprint: "a".repeat(64) },
]
function session(status = "approved") {
  return {
    token,
    owner_hash: digest(owner),
    invite_hash: digest(invite),
    recipient_hash: digest(recipient),
    pairing_code: "123456",
    status,
    manifest: files,
    total_size: 12288,
    progress: {},
    generation: 1,
    offer: { type: "offer", sdp: "secret-sdp" },
    answer: { type: "answer", sdp: "secret-sdp" },
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    server_now: new Date().toISOString(),
  }
}
function request(credential: string, body?: Record<string, unknown>) {
  return new Request(`https://flashdrop.test/api/wide/${token}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      "x-flashdrop-access": credential,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
beforeEach(() => {
  database.rows = []
  database.queries = []
})
describe("bounded requests and expiring text routes", () => {
  it("rejects cross-origin writes and limits actual streamed bytes without content-length", async () => {
    await expect(
      boundedJson(
        new Request("https://flashdrop.test/api/text", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://other.test",
          },
          body: "{}",
        })
      )
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      boundedJson(
        new Request("https://flashdrop.test/api/text", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "x".repeat(200) }),
        }),
        100
      )
    ).rejects.toMatchObject({ status: 413 })
  })
  it("accepts the actual browser Host when Next normalizes localhost, without trusting spoofed forwarding headers", async () => {
    const body = JSON.stringify({ content: "safe" })
    await expect(
      boundedJson(
        new Request("http://localhost:3107/api/text", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3107",
            origin: "http://127.0.0.1:3107",
            "content-type": "application/json",
          },
          body,
        })
      )
    ).resolves.toEqual({ content: "safe" })
    await expect(
      boundedJson(
        new Request("https://flashdrop.test/api/text", {
          method: "POST",
          headers: {
            host: "flashdrop.test",
            origin: "https://evil.test",
            "x-forwarded-host": "evil.test",
            "content-type": "application/json",
          },
          body,
        })
      )
    ).rejects.toMatchObject({ status: 403 })
  })
  it("enforces text size and lifetime before insertion", async () => {
    const r = await textCreate(
      new Request("https://flashdrop.test/api/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "safe", lifetimeSeconds: 60 }),
      })
    )
    expect(r.status).toBe(400)
    expect(database.queries).toHaveLength(0)
  })
  it("requires the full fragment capability and returns no private columns", async () => {
    database.rows = [
      {
        content: "hello",
        format: "markdown",
        access_hash: digest(recipient),
        expires_at: "2099-01-01",
        server_now: "2026-01-01",
      },
    ]
    const denied = await textGet(
      new Request(`https://flashdrop.test/api/text/${token}`),
      params
    )
    expect(denied.status).toBe(404)
    const allowed = await textGet(
      new Request(`https://flashdrop.test/api/text/${token}`, {
        headers: { "x-flashdrop-access": recipient },
      }),
      params
    )
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get("cache-control")).toContain("no-store")
    expect(await allowed.json()).not.toHaveProperty("access_hash")
    expect(database.queries[0].sql).toContain("expires_at > NOW()")
  })
})
describe("Wide Connect authorization boundaries", () => {
  it("rejects unknown and expired sessions using database-time predicates", async () => {
    await expect(wideSession(token, owner)).rejects.toMatchObject({
      status: 410,
    })
    expect(database.queries[0].sql).toContain("expires_at > NOW()")
    expect(database.queries[0].sql).toContain("INTERVAL '2 hours'")
  })
  it("invitation alone never discloses SDP, pairing code, progress or TURN credentials", async () => {
    database.rows = [session()]
    const r = await wideGet(request(invite), params),
      body = await r.json()
    expect(r.status).toBe(200)
    for (const key of [
      "offer",
      "answer",
      "pairingCode",
      "progress",
      "iceServers",
      "owner_hash",
      "recipient_hash",
    ])
      expect(body).not.toHaveProperty(key)
  })
  it("a recipient cannot approve itself or send an owner offer", async () => {
    database.rows = [session("pending")]
    expect(
      (
        await widePost(
          request(recipient, { action: "approve", code: "123456" }),
          params
        )
      ).status
    ).toBe(403)
    database.rows = [session()]
    expect(
      (
        await widePost(
          request(recipient, {
            action: "signal",
            signal: { type: "offer", sdp: "m=application" },
          }),
          params
        )
      ).status
    ).toBe(400)
  })
  it("an invitation cannot read signaling or mutate transfer progress", async () => {
    database.rows = [session()]
    expect(
      (
        await widePost(
          request(invite, { action: "progress", progress: {} }),
          params
        )
      ).status
    ).toBe(403)
    expect(
      (
        await widePost(
          request(invite, {
            action: "signal",
            signal: { type: "answer", sdp: "m=application" },
          }),
          params
        )
      ).status
    ).toBe(403)
  })
  it("requires verified completion before either participant can finalize", async () => {
    database.rows = [session("approved")]
    expect(
      (await widePost(request(owner, { action: "finish" }), params)).status
    ).toBe(403)
    database.rows = [session("complete")]
    expect(
      (await widePost(request(invite, { action: "finish" }), params)).status
    ).toBe(403)
    expect(
      (await widePost(request(recipient, { action: "finish" }), params)).status
    ).toBe(200)
    const sql = database.queries.at(-1)!.sql
    expect(sql).toContain("sender_finished_at")
    expect(sql).toContain("recipient_finished_at")
    expect(sql).toContain("owner_hash = CASE")
    expect(sql).toContain("offer=NULL")
  })
  it("rejects every old capability once a session is closed", async () => {
    database.rows = [session("closed")]
    for (const key of [owner, recipient, invite])
      await expect(wideSession(token, key)).rejects.toMatchObject({
        status: 410,
      })
  })
  it("never issues signaling or relay credentials for completed sessions", async () => {
    database.rows = [session("complete")]
    const body = await (await wideGet(request(recipient), params)).json()
    expect(body).not.toHaveProperty("offer")
    expect(body).not.toHaveProperty("iceServers")
    expect(
      (await widePost(request(owner, { action: "reset" }), params)).status
    ).toBe(403)
  })
  it("rejects out-of-range and unaligned acknowledgements", async () => {
    database.rows = [session()]
    for (const offset of [-1, 3, 12289])
      expect(
        (
          await widePost(
            request(recipient, {
              action: "progress",
              progress: { "0": { offset, chain: "b".repeat(64) } },
            }),
            params
          )
        ).status
      ).toBe(400)
  })
  it("a complete byte count alone cannot mark a session complete", async () => {
    database.rows = [session()]
    const r = await widePost(
      request(recipient, {
        action: "progress",
        progress: {
          "0": { offset: 12288, chain: "b".repeat(64), verified: false },
        },
      }),
      params
    )
    expect(r.status).toBe(200)
    expect(database.queries.at(-1)?.values).toContain("approved")
    expect(database.queries.at(-1)?.sql).toContain("generation =")
    expect(database.queries.at(-1)?.sql).toContain(
      "recipient_hash IS NOT DISTINCT FROM"
    )
  })
})
