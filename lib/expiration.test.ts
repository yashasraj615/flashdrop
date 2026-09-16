import { describe, expect, it } from "vitest"

import { FILE_TTL_MS } from "@/lib/constants"
import {
  expirationFrom,
  formatClock,
  formatRemaining,
  isDownloadable,
  isPastExpiration,
  shouldCleanup,
} from "@/lib/expiration"
import { LIFETIME_OPTIONS, parseLifetimeSeconds, requireLifetimeSeconds } from "@/lib/lifetime"

describe("expiration", () => {
  it("calculates expires_at using the selected lifetime", () => {
    const uploadedAt = new Date("2026-09-15T12:00:00.000Z")
    expect(expirationFrom(uploadedAt, 5 * 60_000).toISOString()).toBe("2026-09-15T12:05:00.000Z")
    expect(expirationFrom(uploadedAt, 10 * 60_000).toISOString()).toBe("2026-09-15T12:10:00.000Z")
    expect(expirationFrom(uploadedAt, 30 * 60_000).toISOString()).toBe("2026-09-15T12:30:00.000Z")
    expect(expirationFrom(uploadedAt, 60 * 60_000).toISOString()).toBe("2026-09-15T13:00:00.000Z")
    expect(expirationFrom(uploadedAt, 2 * 60 * 60_000).toISOString()).toBe("2026-09-15T14:00:00.000Z")
    expect(expirationFrom(uploadedAt, 5 * 60 * 60_000).toISOString()).toBe("2026-09-15T17:00:00.000Z")
    expect(FILE_TTL_MS).toBe(5 * 60 * 60 * 1000)
  })

  it("rejects lifetimes outside 5 minutes to 5 hours", () => {
    expect(parseLifetimeSeconds(60)).toBe(3600)
    expect(parseLifetimeSeconds(24 * 60 * 60)).toBe(3600)
    expect(() => requireLifetimeSeconds(60)).toThrow(/5 minutes and 5 hours/)
    expect(() => requireLifetimeSeconds(6 * 60 * 60)).toThrow(/5 minutes and 5 hours/)
    expect(requireLifetimeSeconds(7200)).toBe(7200)
    expect(LIFETIME_OPTIONS.map((option) => option.seconds)).toEqual([300, 600, 1800, 3600, 7200, 18000])
  })

  it("blocks downloads at the expiration instant", () => {
    const expiresAt = new Date("2026-09-16T12:00:00.000Z")
    expect(
      isDownloadable({
        now: new Date("2026-09-16T11:59:59.000Z"),
        status: "active",
        expiresAt,
      })
    ).toBe(true)
    expect(
      isDownloadable({
        now: new Date("2026-09-16T12:00:00.000Z"),
        status: "active",
        expiresAt,
      })
    ).toBe(false)
    expect(isPastExpiration(new Date("2026-09-16T12:00:00.000Z"), expiresAt)).toBe(true)
  })

  it("does not allow deleted or uploading files to download", () => {
    const expiresAt = new Date("2026-09-16T12:00:00.000Z")
    expect(
      isDownloadable({
        now: new Date("2026-09-15T12:00:00.000Z"),
        status: "deleted",
        expiresAt,
      })
    ).toBe(false)
    expect(
      isDownloadable({
        now: new Date("2026-09-15T12:00:00.000Z"),
        status: "uploading",
        expiresAt,
      })
    ).toBe(false)
  })

  it("cleanup is idempotent for already deleted files", () => {
    const now = new Date("2026-09-17T00:00:00.000Z")
    expect(
      shouldCleanup(
        { status: "failed", expiresAt: null, createdAt: "2026-09-15T00:00:00.000Z" },
        now
      )
    ).toBe(true)
    expect(
      shouldCleanup(
        { status: "deleted", expiresAt: "2026-09-16T00:00:00.000Z", createdAt: "2026-09-15T00:00:00.000Z" },
        now
      )
    ).toBe(false)
    expect(
      shouldCleanup(
        { status: "deleting", expiresAt: "2026-09-16T00:00:00.000Z", createdAt: "2026-09-15T00:00:00.000Z" },
        now
      )
    ).toBe(true)
    expect(
      shouldCleanup(
        { status: "active", expiresAt: "2026-09-16T00:00:00.000Z", createdAt: "2026-09-15T00:00:00.000Z" },
        now
      )
    ).toBe(true)
  })

  it("formats remaining time with seconds", () => {
    expect(formatClock(4 * 3600_000 + 32 * 60_000 + 18_000)).toBe("4h 32m 18s")
    expect(formatClock(8 * 60_000 + 7_000)).toBe("8m 07s")
    expect(formatClock(5 * 60_000 + 1_000)).toBe("5m 01s")
    expect(formatClock(59_000)).toBe("59s")
    expect(formatClock(3600_000)).toBe("1h 0m 00s")
    expect(formatRemaining(0)).toBe("Expired")
  })

  it("cleans up a 5-minute transfer at expires_at, not later", () => {
    const now = new Date("2026-09-15T12:05:00.000Z")
    expect(
      shouldCleanup(
        { status: "active", expiresAt: "2026-09-15T12:05:00.000Z", createdAt: "2026-09-15T12:00:00.000Z" },
        now
      )
    ).toBe(true)
    expect(
      shouldCleanup(
        { status: "active", expiresAt: "2026-09-15T12:05:00.000Z", createdAt: "2026-09-15T12:00:00.000Z" },
        new Date("2026-09-15T12:04:59.000Z")
      )
    ).toBe(false)
  })
})
