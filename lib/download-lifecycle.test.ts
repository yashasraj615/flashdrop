import { afterEach, expect, it, vi } from "vitest"
vi.mock("./client-crypto", () => ({
  deriveFileKey: async () => ({}),
  decryptChunk: async () => new Uint8Array([7]),
  DecryptError: class extends Error {},
}))
import { decryptAndSave } from "./client-download"
afterEach(() => vi.unstubAllGlobals())
it("aborts a failed disk save without silently downloading the file again", async () => {
  const abort = vi.fn().mockResolvedValue(undefined),
    close = vi.fn()
  vi.stubGlobal("window", {
    showSaveFilePicker: async () => ({
      createWritable: async () => ({
        write: async () => {
          throw Error("Disk full")
        },
        close,
        abort,
      }),
    }),
  })
  const fetch = vi
    .fn()
    .mockImplementation(async (url: string) =>
      url.includes("/download")
        ? Response.json({ url: "https://storage.example/cipher", chunkSize: 1 })
        : new Response(new Uint8Array(29))
    )
  vi.stubGlobal("fetch", fetch)
  await expect(
    decryptAndSave(
      "token",
      {
        id: "file",
        filename: "original.bin",
        mimeType: "application/octet-stream",
        size: 1,
        encryptedSize: 29,
        chunkSize: 1,
      },
      new Uint8Array(32)
    )
  ).rejects.toThrow("Disk full")
  expect(abort).toHaveBeenCalledOnce()
  expect(close).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(2)
})
