import { describe, expect, it } from "vitest"

import { MAX_FILE_SIZE_BYTES } from "@/lib/constants"
import {
  expirationFrom,
  formatRemaining,
  isDownloadable,
  isPastExpiration,
  shouldCleanup,
} from "@/lib/expiration"

describe("expiration", () => {
  it("calculates expires_at 24 hours after upload", () => {
    const uploadedAt = new Date("2026-09-15T12:00:00.000Z")
    const expiresAt = expirationFrom(uploadedAt)
    expect(expiresAt.toISOString()).toBe("2026-09-16T12:00:00.000Z")
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

  it("formats remaining time without querying the server", () => {
    expect(formatRemaining(2 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe("2h 5m remaining")
    expect(formatRemaining(0)).toBe("Expired")
  })
})

describe("size limit", () => {
  it("is exactly 1 GiB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(1073741824)
  })
})
