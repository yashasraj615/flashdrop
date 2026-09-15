import { describe, expect, it } from "vitest"

import { hashChunk } from "@/lib/checksum"
import {
  CHUNK_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  chunkByteRange,
  expectedChunkCount,
} from "@/lib/constants"
import { isCompleteUpload } from "@/lib/constants"

describe("chunk planning", () => {
  it("splits a 1 GB file into 512 KiB chunks", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(1073741824)
    expect(CHUNK_SIZE_BYTES).toBe(512 * 1024)
    expect(expectedChunkCount(MAX_FILE_SIZE_BYTES)).toBe(2048)
    expect(chunkByteRange(0, MAX_FILE_SIZE_BYTES)).toEqual({
      offset: 0,
      length: CHUNK_SIZE_BYTES,
    })
    expect(chunkByteRange(2047, MAX_FILE_SIZE_BYTES)).toEqual({
      offset: 2047 * CHUNK_SIZE_BYTES,
      length: CHUNK_SIZE_BYTES,
    })
  })

  it("handles a remainder on the last chunk", () => {
    expect(expectedChunkCount(CHUNK_SIZE_BYTES + 12)).toBe(2)
    expect(chunkByteRange(1, CHUNK_SIZE_BYTES + 12)).toEqual({
      offset: CHUNK_SIZE_BYTES,
      length: 12,
    })
  })

  it("treats a transfer as complete only when every byte is present", () => {
    expect(isCompleteUpload(100, { chunkCount: 1, totalBytes: 100 })).toBe(true)
    expect(isCompleteUpload(100, { chunkCount: 1, totalBytes: 99 })).toBe(false)
  })
})

describe("checksums", () => {
  it("hashes chunk bytes with SHA-256", () => {
    expect(hashChunk(new Uint8Array([1, 2, 3]))).toBe(
      "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81"
    )
  })
})
