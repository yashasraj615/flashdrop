import { describe, expect, it } from "vitest"

import { contentDisposition, sanitizeFilename, storageContentType } from "@/lib/filenames"

describe("sanitizeFilename", () => {
  it("keeps a normal filename", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf")
  })

  it("strips path traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd")
    expect(sanitizeFilename("..\\windows\\system32\\config")).toBe("config")
  })

  it("removes control characters and reserved characters", () => {
    expect(sanitizeFilename("bad:name?.txt")).toBe("bad_name_.txt")
    expect(sanitizeFilename("hi\u0000there")).toBe("hithere")
  })

  it("falls back for empty or dot names", () => {
    expect(sanitizeFilename("")).toBe("file")
    expect(sanitizeFilename(".")).toBe("file")
    expect(sanitizeFilename("..")).toBe("file")
  })

  it("truncates very long names", () => {
    const name = `${"a".repeat(300)}.zip`
    expect(sanitizeFilename(name).length).toBeLessThanOrEqual(180)
  })
})

describe("storageContentType", () => {
  it("does not serve HTML or SVG as renderable documents", () => {
    expect(storageContentType("text/html")).toBe("application/octet-stream")
    expect(storageContentType("image/svg+xml")).toBe("application/octet-stream")
    expect(storageContentType("application/javascript")).toBe("application/octet-stream")
  })

  it("preserves ordinary types and unknown types", () => {
    expect(storageContentType("application/pdf")).toBe("application/pdf")
    expect(storageContentType("application/x-unknown")).toBe("application/x-unknown")
    expect(storageContentType("")).toBe("application/octet-stream")
  })
})

describe("contentDisposition", () => {
  it("forces attachment downloads and encodes the filename", () => {
    const header = contentDisposition('report "final".pdf')
    expect(header).toContain("attachment;")
    expect(header).toContain("filename=")
    expect(header).toContain("filename*=UTF-8''")
  })
})
