import { describe, expect, it } from "vitest"

import { MAX_TRANSFER_SIZE_BYTES } from "@/lib/constants"
import { QuotaError, assertFitsQuota, remainingBytes } from "@/lib/quota"

describe("transfer quota", () => {
  it("allows 500 + 200 + 250 MB and rejects the next 100 MB", () => {
    const mb = 1024 * 1024
    const used = (500 + 200) * mb
    expect(() =>
      assertFitsQuota({ used, requested: 250 * mb, fileCount: 2, additionalFiles: 1 })
    ).not.toThrow()
    const after = used + 250 * mb
    expect(remainingBytes(after)).toBe(MAX_TRANSFER_SIZE_BYTES - after)
    expect(() =>
      assertFitsQuota({ used: after, requested: 100 * mb, fileCount: 3, additionalFiles: 1 })
    ).toThrow(QuotaError)
  })

  it("rejects a 1.1 GB pair", () => {
    const mb = 1024 * 1024
    expect(() =>
      assertFitsQuota({
        used: 0,
        requested: (700 + 400) * mb,
        fileCount: 0,
        additionalFiles: 2,
      })
    ).toThrow(QuotaError)
  })
})
