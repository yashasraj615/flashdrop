import { describe, expect, it } from "vitest"

import { createDownloadToken, isPlausibleToken } from "@/lib/tokens"

describe("download tokens", () => {
  it("creates unique high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createDownloadToken()))
    expect(tokens.size).toBe(50)
    for (const token of tokens) {
      expect(isPlausibleToken(token)).toBe(true)
      expect(token.length).toBeGreaterThanOrEqual(40)
    }
  })

  it("rejects sequential or short identifiers", () => {
    expect(isPlausibleToken("1")).toBe(false)
    expect(isPlausibleToken("file123")).toBe(false)
    expect(isPlausibleToken("../secret")).toBe(false)
  })
})
