import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import baseline from "./__fixtures__/quick-transfer-69e673a.json"
import { requestTransfer } from "./client-upload"
import { requestTransfer as requestMedia } from "./media-client-upload"
import { transferShareUrl } from "./share-secret"

afterEach(() => vi.unstubAllGlobals())
describe("historical Quick Transfer restoration", () => {
  it.each(Object.entries(baseline.sha256))(
    "matches recovered source exactly: %s",
    (path, expected) => {
      expect(
        createHash("sha256").update(readFileSync(path)).digest("hex")
      ).toBe(expected)
    }
  )
  it("keeps the historical creation request and isolates the media request", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ token: "test-token" }))
    vi.stubGlobal("fetch", fetch)
    const file = new File(["controlled content"], "report.txt", {
      type: "text/plain",
    })
    const signal = new AbortController().signal
    await requestTransfer([file], signal, 600)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe("/api/transfers")
    expect(JSON.parse(options.body)).toEqual({
      lifetimeSeconds: 600,
      files: [
        { filename: "report.txt", mimeType: "text/plain", size: file.size },
      ],
    })
    await requestMedia([file], signal, 600, "media")
    expect(fetch.mock.calls[1][0]).toBe("/api/media")
    expect(JSON.parse(fetch.mock.calls[1][1].body).mode).toBe("media")
  })
  it("keeps fragment keys, the /t link format and the historical frame", () => {
    expect(
      transferShareUrl("token", "secret", "https://flashdrop-three.vercel.app")
    ).toBe("https://flashdrop-three.vercel.app/t/token#secret")
    const frame = readFileSync("components/quick-app-frame.tsx", "utf8")
    expect(frame).toContain("max-w-lg")
    expect(frame).toContain("sm:max-w-xl")
    expect(frame).toContain("Up to 5 hours")
    for (const file of [
      "components/transfer-experience.tsx",
      "lib/client-upload.ts",
      "lib/client-download.ts",
    ])
      expect(readFileSync(file, "utf8")).not.toMatch(
        /WideTransport|RTCPeerConnection|wide-ice|stun:|turns?:|media-client-upload/
      )
  })
})
