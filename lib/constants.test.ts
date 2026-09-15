import { describe, expect, it } from "vitest"

import {
  MAX_FILE_SIZE_BYTES,
  PART_SIZE_BYTES,
  expectedPartCount,
  partByteRange,
} from "@/lib/constants"

describe("part planning", () => {
  it("splits a 1 GB file into 8 MiB parts", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(1073741824)
    expect(PART_SIZE_BYTES).toBe(8 * 1024 * 1024)
    expect(expectedPartCount(MAX_FILE_SIZE_BYTES)).toBe(128)
    expect(partByteRange(0, MAX_FILE_SIZE_BYTES)).toEqual({
      offset: 0,
      length: PART_SIZE_BYTES,
    })
    expect(partByteRange(127, MAX_FILE_SIZE_BYTES)).toEqual({
      offset: 127 * PART_SIZE_BYTES,
      length: PART_SIZE_BYTES,
    })
  })

  it("handles a remainder on the last part", () => {
    expect(expectedPartCount(PART_SIZE_BYTES + 12)).toBe(2)
    expect(partByteRange(1, PART_SIZE_BYTES + 12)).toEqual({
      offset: PART_SIZE_BYTES,
      length: 12,
    })
  })
})
