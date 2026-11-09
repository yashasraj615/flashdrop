import { afterEach, describe, expect, it, vi } from "vitest"
import { putEncryptedPart } from "./upload-put"
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe("encrypted upload reliability", () => {
  it("does not start a request for an already aborted upload", async () => {
    const xhr = vi.fn()
    vi.stubGlobal("XMLHttpRequest", xhr)
    const c = new AbortController()
    c.abort()
    await expect(
      putEncryptedPart(
        "https://storage.example",
        new Uint8Array(1),
        undefined,
        () => {},
        c.signal
      )
    ).rejects.toThrow()
    expect(xhr).not.toHaveBeenCalled()
  })
  it("retries a failed connection using the same encrypted part", async () => {
    vi.useFakeTimers()
    const bodies: unknown[] = []
    let attempt = 0
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        upload = {}
        status = 200
        timeout = 0
        onerror = () => {}
        onload = () => {}
        open() {}
        setRequestHeader() {}
        getResponseHeader() {
          return '"etag"'
        }
        send(body: unknown) {
          bodies.push(body)
          attempt++
          queueMicrotask(() => (attempt === 1 ? this.onerror() : this.onload()))
        }
      }
    )
    const result = putEncryptedPart(
      "https://storage.example",
      new Blob(["ciphertext"]),
      undefined,
      () => {},
      new AbortController().signal
    )
    await vi.advanceTimersByTimeAsync(1000)
    await expect(result).resolves.toBe('"etag"')
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toBe(bodies[1])
  })
})
