import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({
  expired: false,
  signed: vi.fn(),
  cleanup: vi.fn(),
  expiredUpdate: vi.fn(),
}))
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "test",
  enforceRateLimit: vi.fn(),
  RateLimitError: class extends Error {},
}))
vi.mock("@/lib/cleanup", () => ({
  runCleanup: () => {
    state.cleanup()
    return Promise.resolve()
  },
}))
vi.mock("@/lib/transfers", () => ({
  getTransferByToken: async () => ({ id: "transfer-id", status: "active" }),
  publicTransferStatus: () => (state.expired ? "expired" : "active"),
  markTransferExpired: async () => {
    state.expiredUpdate()
  },
  recordTransferDownload: async () => {},
}))
vi.mock("@/lib/files", () => ({
  getFileById: async () => ({
    id: "file-id",
    transferId: "transfer-id",
    objectKey: "uploads/original-object",
    originalFilename: "Company report 2026.txt",
    mimeType: "text/plain",
    fileSize: 42,
    encryptedSize: 70,
    chunkSize: 8388580,
    encryptionVersion: "v1",
  }),
  publicFileStatus: () => "active",
  recordFileDownload: async () => {},
}))
vi.mock("@/lib/storage", () => ({
  signedDownloadUrl: (args: unknown) => {
    state.signed(args)
    return Promise.resolve("https://storage.example/original-signed-url")
  },
}))
import { GET } from "../app/api/transfers/[token]/files/[fileId]/download/route"
beforeEach(() => {
  state.expired = false
  vi.clearAllMocks()
})
const token = "a".repeat(43)
const context = { params: Promise.resolve({ token, fileId: "file-id" }) }
describe("historical download API behavior", () => {
  it("returns signed-storage metadata without redirecting or serving plaintext", async () => {
    const response = await GET(
      new Request(
        `https://flashdrop.test/api/transfers/${token}/files/file-id/download`
      ),
      context
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(state.signed).toHaveBeenCalledWith({
      key: "uploads/original-object",
      filename: "Company report 2026.txt",
      contentType: "application/octet-stream",
    })
    expect(await response.json()).toEqual({
      url: "https://storage.example/original-signed-url",
      filename: "Company report 2026.txt",
      mimeType: "text/plain",
      size: 42,
      encryptedSize: 70,
      chunkSize: 8388580,
      encryptionVersion: "v1",
    })
  })
  it("denies expired downloads and schedules the original cleanup path", async () => {
    state.expired = true
    const response = await GET(
      new Request(
        `https://flashdrop.test/api/transfers/${token}/files/file-id/download`
      ),
      context
    )
    expect(response.status).toBe(410)
    expect(state.signed).not.toHaveBeenCalled()
    expect(state.expiredUpdate).toHaveBeenCalledOnce()
    expect(state.cleanup).toHaveBeenCalledOnce()
  })
})
