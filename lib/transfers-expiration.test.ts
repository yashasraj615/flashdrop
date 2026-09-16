import { describe, expect, it } from "vitest"

import { expirationFrom } from "@/lib/expiration"

describe("adding files does not extend expiration", () => {
  it("keeps the original selected lifetime window", () => {
    const uploadedAt = new Date("2026-09-15T10:00:00.000Z")
    const expiresAt = expirationFrom(uploadedAt, 10 * 60_000)
    const addedLater = new Date("2026-09-15T10:05:00.000Z")
    expect(expiresAt.toISOString()).toBe("2026-09-15T10:10:00.000Z")
    expect(expirationFrom(addedLater, 10 * 60_000).toISOString()).not.toBe(expiresAt.toISOString())
  })
})
