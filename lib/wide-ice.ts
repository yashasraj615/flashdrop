// Public endpoint documented at https://webrtc.org/getting-started/peer-connections.
// Return fresh objects so a peer cannot mutate configuration for subsequent peers.
export function directIceConfiguration(): RTCConfiguration {
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
}
