import { afterEach, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const cleanup = vi.hoisted(() => vi.fn(async () => ({ scanned: 0 })))
vi.mock("./mode-cleanup", () => ({ runCleanup: cleanup }))
import { GET } from "../app/api/cleanup/route"
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
it("does not trust a cron-looking user agent when its secret is absent", async () => {
  vi.stubEnv("CRON_SECRET", "")
  const r = await GET(
    new Request("https://flashdrop.test/api/cleanup", {
      headers: { "user-agent": "vercel-cron/1.0" },
    })
  )
  expect(r.status).toBe(401)
  expect(cleanup).not.toHaveBeenCalled()
})
it("allows the configured cron bearer secret", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret")
  const r = await GET(
    new Request("https://flashdrop.test/api/cleanup", {
      headers: { authorization: "Bearer test-secret" },
    })
  )
  expect(r.status).toBe(200)
  expect(cleanup).toHaveBeenCalledOnce()
})
