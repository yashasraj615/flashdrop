import { describe, expect, it } from "vitest"

import { expirationFrom } from "@/lib/expiration"

describe("adding files does not extend expiration", () => {
  it("keeps the original 24-hour window", () => {
    const uploadedAt = new Date("2026-09-15T21:00:00.000Z")
    const expiresAt = expirationFrom(uploadedAt)
    const addedLater = new Date("2026-09-15T23:00:00.000Z")
    expect(expiresAt.toISOString()).toBe("2026-09-16T21:00:00.000Z")
    expect(expirationFrom(addedLater).toISOString()).not.toBe(expiresAt.toISOString())
  })
})
