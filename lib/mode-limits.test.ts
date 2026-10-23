import { describe, expect, it } from "vitest"
import {
  lineCount,
  TEXT_MAX_BYTES,
  validateText,
  validateManifest,
  WIDE_MAX_BYTES,
  WIDE_CHUNK_BYTES,
  validOffset,
} from "./mode-limits"
const file = {
  name: "folder/photo.raw",
  size: 1,
  modified: 1,
  fingerprint: "a".repeat(64),
}
describe("Text Pad resource limits", () => {
  it("counts CRLF, CR and LF and accepts exactly 15,000 lines", () => {
    expect(lineCount("a\r\nb\rc\nd")).toBe(4)
    expect(() => validateText("x\n".repeat(14999) + "x")).not.toThrow()
    expect(() => validateText("x\n".repeat(15000) + "x")).toThrow("15,000")
  })
  it("enforces actual UTF-8 bytes independently of lines", () => {
    expect(() => validateText("x".repeat(TEXT_MAX_BYTES))).not.toThrow()
    expect(() =>
      validateText("€".repeat(Math.ceil(TEXT_MAX_BYTES / 3)))
    ).toThrow("1 MiB")
    expect(() => validateText("  ")).toThrow()
  })
})
describe("Wide Connect independent quota and paths", () => {
  it("accepts 20 GB aggregate, including zero-byte files", () => {
    expect(
      validateManifest([
        { ...file, size: WIDE_MAX_BYTES },
        { ...file, name: "empty", size: 0 },
      ])
    ).toHaveLength(2)
    expect(() =>
      validateManifest([
        { ...file, size: WIDE_MAX_BYTES },
        { ...file, name: "extra" },
      ])
    ).toThrow("20 GB")
  })
  it("rejects ambiguous paths, duplicates and invalid metadata", () => {
    for (const name of [
      "../secret",
      "folder/../secret",
      "/absolute",
      "a//b",
      "a\u0000b",
    ])
      expect(() => validateManifest([{ ...file, name }])).toThrow()
    expect(() => validateManifest([file, file])).toThrow("distinct")
    expect(() => validateManifest([{ ...file, size: 1.5 }])).toThrow()
    expect(() =>
      validateManifest([{ ...file, fingerprint: "wrong" }])
    ).toThrow()
  })
  it("only accepts aligned checkpoints or exact end of file", () => {
    expect(validOffset(WIDE_CHUNK_BYTES, WIDE_CHUNK_BYTES + 3)).toBe(true)
    expect(validOffset(3, 3)).toBe(true)
    expect(validOffset(3, 4)).toBe(false)
    expect(validOffset(-1, 4)).toBe(false)
    expect(validOffset(5, 4)).toBe(false)
  })
})
