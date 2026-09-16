import { describe, expect, it } from "vitest"

import {
  DEFAULT_LIFETIME_SECONDS,
  LIFETIME_OPTIONS,
  MAX_LIFETIME_SECONDS,
  MIN_LIFETIME_SECONDS,
  isLifetimeSeconds,
  parseLifetimeSeconds,
  requireLifetimeSeconds,
} from "@/lib/lifetime"

describe("transfer lifetime options", () => {
  it("only allows 5 minutes through 5 hours", () => {
    expect(LIFETIME_OPTIONS.map((option) => option.seconds)).toEqual([300, 600, 1800, 3600, 7200, 18000])
    expect(MIN_LIFETIME_SECONDS).toBe(300)
    expect(MAX_LIFETIME_SECONDS).toBe(18000)
    expect(DEFAULT_LIFETIME_SECONDS).toBe(3600)
    expect(isLifetimeSeconds(60)).toBe(false)
    expect(isLifetimeSeconds(86400)).toBe(false)
    expect(isLifetimeSeconds(18000)).toBe(true)
  })

  it("falls back instead of accepting an invalid lifetime", () => {
    expect(parseLifetimeSeconds(60)).toBe(3600)
    expect(parseLifetimeSeconds(24 * 60 * 60)).toBe(3600)
    expect(parseLifetimeSeconds("7200")).toBe(7200)
    expect(() => requireLifetimeSeconds(60)).toThrow(/5 minutes and 5 hours/)
    expect(() => requireLifetimeSeconds(6 * 60 * 60)).toThrow(/5 minutes and 5 hours/)
  })
})
