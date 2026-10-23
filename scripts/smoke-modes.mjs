// Run only against an isolated validation deployment/branch. Prints no capabilities or payloads.
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3107"
const capability = () => randomBytes(32).toString("base64url")
async function call(path, { body, access } = {}) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(access ? { "x-flashdrop-access": access } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, body: await r.json(), headers: r.headers }
}
const pad = await call("/api/text", {
  body: {
    content: '# Original note\n\n```js\nconst quality = "original";\n```',
    format: "markdown",
    lifetimeSeconds: 300,
  },
})
assert.equal(pad.status, 201)
assert.ok(pad.body.token)
assert.equal(pad.headers.get("cache-control"), "private, no-store")
const padPath = `/api/text/${pad.body.token}`
assert.equal((await call(padPath)).status, 404)
assert.equal(
  (await call(padPath, { access: pad.body.access })).body.content.includes(
    "Original note"
  ),
  true
)
assert.equal(
  (
    await call("/api/text", {
      body: { content: "bad lifetime", lifetimeSeconds: 60 },
    })
  ).status,
  400
)
console.log(
  "Text Pad: create, scoped read, private response and lifetime validation passed"
)
const files = [
  {
    name: "folder/original.bin",
    size: 24576,
    modified: 42,
    fingerprint: "a".repeat(64),
  },
]
const created = await call("/api/wide", { body: { files } })
assert.equal(created.status, 201)
const path = `/api/wide/${created.body.token}`,
  owner = created.body.owner,
  invite = created.body.invite,
  recipient = capability()
assert.equal((await call(path, { access: capability() })).status, 403)
const guest = await call(path, { access: invite })
assert.equal(guest.status, 200)
assert.equal(guest.body.role, "invite")
assert.ok(!("offer" in guest.body))
assert.ok(!("iceServers" in guest.body))
assert.equal(
  (
    await call(path, {
      access: invite,
      body: { action: "progress", progress: {} },
    })
  ).status,
  403
)
assert.equal(
  (await call(path, { access: invite, body: { action: "accept", recipient } }))
    .status,
  200
)
assert.equal(
  (
    await call(path, {
      access: invite,
      body: { action: "accept", recipient: capability() },
    })
  ).status,
  409
)
const pending = await call(path, { access: owner })
assert.equal(pending.body.status, "pending")
assert.ok(pending.body.pairingCode)
assert.equal(
  (
    await call(path, {
      access: recipient,
      body: { action: "approve", code: pending.body.pairingCode },
    })
  ).status,
  403
)
assert.equal(
  (
    await call(path, {
      access: owner,
      body: { action: "approve", code: pending.body.pairingCode },
    })
  ).status,
  200
)
const offer = {
  type: "offer",
  sdp: "v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n",
}
assert.equal(
  (
    await call(path, {
      access: owner,
      body: { action: "signal", signal: offer },
    })
  ).status,
  200
)
const accepted = await call(path, { access: recipient })
assert.equal(accepted.body.offer.sdp, offer.sdp)
assert.ok(
  (await call(path, { access: recipient, body: { action: "ice" } })).body
    .iceServers
)
assert.equal((await call(path, { access: invite })).body.offer, undefined)
assert.equal(
  (
    await call(path, {
      access: recipient,
      body: {
        action: "signal",
        generation: accepted.body.generation - 1,
        signal: { ...offer, type: "answer" },
      },
    })
  ).status,
  409
)
assert.equal(
  (
    await call(path, {
      access: recipient,
      body: {
        action: "signal",
        generation: accepted.body.generation,
        signal: { ...offer, type: "answer" },
      },
    })
  ).status,
  200
)
const progress = {
  0: { offset: 12288, chain: "b".repeat(64), verified: false },
}
assert.equal(
  (
    await call(path, {
      access: recipient,
      body: { action: "progress", progress },
    })
  ).status,
  200
)
assert.equal(
  (await call(path, { access: owner })).body.progress["0"].offset,
  12288
)
assert.equal(
  (
    await call(path, {
      access: recipient,
      body: {
        action: "progress",
        progress: { 0: { ...progress["0"], offset: 3 } },
      },
    })
  ).status,
  400
)
assert.equal(
  (await call(path, { access: owner, body: { action: "reset" } })).status,
  200
)
assert.equal((await call(path, { access: recipient })).status, 403)
assert.equal((await call(path, { access: owner })).body.status, "waiting")
console.log(
  "Wide Connect: invitation, atomic claim, consent, scoped signaling, generation, progress and revocation passed"
)
const over = await call("/api/wide", {
  body: { files: [{ ...files[0], size: 20 * 1024 ** 3 + 1 }] },
})
assert.equal(over.status, 400)
console.log("Wide Connect: independent 20 GB quota enforced")

// Finalization invalidates application credentials after both endpoints finish.
assert.equal(
  (await call(path, { access: invite, body: { action: "accept", recipient } }))
    .status,
  200
)
const secondPair = await call(path, { access: owner })
assert.equal(
  (
    await call(path, {
      access: owner,
      body: { action: "approve", code: secondPair.body.pairingCode },
    })
  ).status,
  200
)
assert.equal(
  (
    await call(path, {
      access: recipient,
      body: {
        action: "progress",
        progress: {
          0: { offset: 24576, chain: "b".repeat(64), verified: true },
        },
      },
    })
  ).status,
  200
)
assert.equal(
  (await call(path, { access: owner, body: { action: "finish" } })).body.closed,
  false
)
assert.equal(
  (await call(path, { access: recipient, body: { action: "finish" } })).body
    .closed,
  true
)
for (const access of [owner, recipient, invite])
  assert.equal((await call(path, { access })).status, 410)
console.log(
  "Wide Connect: both finish acknowledgements invalidate all old session capabilities"
)
console.log(
  "HTTP smoke checks passed. No Wide Connect file payload sent to HTTP or storage."
)

// Optional expiry checks with an isolated database URL supplied by the caller.
// Never infer a database from .env.local: smoke tests must not mutate production.
if (process.env.SMOKE_DATABASE_URL) {
  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(process.env.SMOKE_DATABASE_URL)
  await sql`UPDATE text_pads SET expires_at = NOW() - INTERVAL '1 second' WHERE token = ${pad.body.token}`
  assert.equal((await call(padPath, { access: pad.body.access })).status, 404)
  await sql`UPDATE wide_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE token = ${created.body.token}`
  assert.equal((await call(path, { access: owner })).status, 410)
  console.log(
    "Database-time expiration: text and Wide Connect access denied after expiry"
  )
}
