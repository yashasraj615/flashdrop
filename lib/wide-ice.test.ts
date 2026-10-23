import { afterEach, describe, expect, it, vi } from "vitest"
import { directIceConfiguration } from "./wide-ice"
import { WideTransport } from "./wide-transport"
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe("direct WebRTC configuration", () => {
  it("uses only the documented public STUN endpoint without credentials", () => {
    const configuration = directIceConfiguration()
    expect(configuration).toEqual({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })
    for (const server of configuration.iceServers!) {
      for (const url of [server.urls].flat()) {
        expect(url).toMatch(/^stun:/)
        expect(url).not.toMatch(/^turns?:/i)
      }
      expect(server).not.toHaveProperty("username")
      expect(server).not.toHaveProperty("credential")
    }
  })
  it("needs no environment variables and returns independent configurations", () => {
    vi.stubGlobal("process", { ...process, env: {} })
    const first = directIceConfiguration()
    first.iceServers![0].urls = "stun:invalid.example"
    expect(directIceConfiguration().iceServers![0].urls).toBe(
      "stun:stun.l.google.com:19302"
    )
  })
  it("constructs peers from the authoritative configuration and reports actionable timeout", () => {
    vi.useFakeTimers()
    const configurations: RTCConfiguration[] = []
    const channel = { close: vi.fn() }
    const close = vi.fn()
    vi.stubGlobal(
      "RTCPeerConnection",
      class {
        constructor(configuration: RTCConfiguration) {
          configurations.push(configuration)
        }
        createDataChannel() {
          return channel
        }
        close = close
      }
    )
    const error = vi.fn()
    const peer = new WideTransport(true, "session", [], [], {
      progress: vi.fn(),
      status: vi.fn(),
      complete: vi.fn(),
      error,
    })
    expect(configurations).toEqual([directIceConfiguration()])
    vi.advanceTimersByTime(60000)
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        /direct connection.*another network.*Retry connection/
      )
    )
    expect(peer.closed).toBe(true)
    expect(close).toHaveBeenCalledOnce()
  })
  it("awaits gathered candidates before publishing offer and answer SDP", async () => {
    class Peer extends EventTarget {
      iceGatheringState = "gathering"
      localDescription: { toJSON: () => RTCSessionDescriptionInit } | null =
        null
      remoteDescription: RTCSessionDescriptionInit | null = null
      createDataChannel() {
        return { close: vi.fn() }
      }
      async createOffer() {
        return { type: "offer" as const, sdp: "initial" }
      }
      async createAnswer() {
        return { type: "answer" as const, sdp: "initial" }
      }
      async setLocalDescription(value: RTCSessionDescriptionInit) {
        this.localDescription = {
          toJSON: () => ({ ...value, sdp: "gathered-candidates" }),
        }
      }
      async setRemoteDescription(value: RTCSessionDescriptionInit) {
        this.remoteDescription = value
      }
      close() {}
    }
    vi.stubGlobal("RTCPeerConnection", Peer)
    for (const owner of [true, false]) {
      const peer = new WideTransport(owner, "session", [], [], {
        progress: vi.fn(),
        status: vi.fn(),
        complete: vi.fn(),
        error: vi.fn(),
      })
      try {
        let resolved = false
        const signaling = (
          owner
            ? peer.offer()
            : peer.answer({ type: "offer", sdp: "remote-candidates" })
        ).then((value) => {
          resolved = true
          return value
        })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(resolved).toBe(false)
        const pc = peer.pc as unknown as Peer
        pc.iceGatheringState = "complete"
        pc.dispatchEvent(new Event("icegatheringstatechange"))
        expect(await signaling).toEqual({
          type: owner ? "offer" : "answer",
          sdp: "gathered-candidates",
        })
        if (!owner) expect(pc.remoteDescription?.sdp).toBe("remote-candidates")
      } finally {
        peer.close()
      }
    }
  })
})
