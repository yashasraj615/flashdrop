import { describe, expect, it } from "vitest"

import { formatBytes } from "@/lib/format"

describe("formatBytes", () => {
  it("formats the 1 GB boundary clearly", () => {
    expect(formatBytes(1073741824)).toBe("1 GB")
    expect(formatBytes(1024)).toBe("1 KB")
  })
})
