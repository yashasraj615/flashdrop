# Wide Connect protocol and operational limits

## Scope

One sender, one explicitly approved receiver, immutable ordered manifest, 20 GiB total and at most 1,000 files. Manifest entries contain a safe relative name, size, last modification time, and a fingerprint of size/time/first-and-last source chunks. Empty files are allowed. Backend tables contain no file payload. Text Pad and stored-file quotas are independent.

## Pairing and signaling

1. Creation generates independent 256-bit random URL-safe session, owner and invitation capabilities. Only hashes of secret capabilities are stored in Neon.
2. An invitation can read the offered manifest but cannot read SDP, TURN credentials, pairing code or progress, approve itself, or receive bytes.
3. Receiver presses Accept; the API atomically claims the sole recipient slot with a fresh 256-bit recipient capability and generates a six-digit comparison code. Both participants see the code. Sender compares it with the intended receiver through an already trusted channel and explicitly approves it.
4. An approval is scoped to the current pairing code and generation. Reset revokes the previous receiver capability and clears signaling/progress. Claim races return a useful conflict. A stolen invitation can cause a pairing denial of service; the sender must reject/reset an unrecognized request.
5. Approved peers poll short, bounded HTTPS requests every three seconds. The sender publishes one fully ICE-gathered offer. The receiver publishes an answer for that exact offer generation. No persistent WebSocket service is required. APIs rate-limit requests, issue ICE credentials only through a separate approved-participant action, validate role/message size/type, and bind mutations to current generation, participant and database-time expiration.
6. STUN is configured by default. Optional TURN uses standard short-lived HMAC credentials from a TURN REST-compatible service. SDP includes network-candidate metadata required for ICE; it is accessible only to scoped participants. Do not log SDP or credentials. Each reconnection fetches fresh ICE credentials.

This authorizes a receiver device; it does not prove a person's identity without the code comparison. HTTPS and backend access control protect signaling. WebRTC authenticates DTLS certificates through the negotiated SDP fingerprints and encrypts the DataChannel. The application trusts Flashdrop's signaling service and browser endpoints. It makes no claim against a malicious/compromised endpoint or malicious signaling server, and does not invent another cryptographic key exchange. Traffic is DTLS/SCTP DataChannel traffic; media SRTP is not used.

## File frames and integrity

An ordered reliable DataChannel carries JSON controls and binary frames. Each binary frame has a four-byte big-endian JSON-header length, a small JSON header (RPC ID, file index, offset, chunk hash), then at most **12 KiB** of original bytes. Frames remain under 16 KiB. At most 32 frames (~384 KiB of payload) are outstanding. Browser bufferedAmount backpressure adds a 512 KiB guard. The receiver caps its processing queue and serializes frames.

For each chunk `C`, `H = SHA256(C)`. Starting from `S0 = 64 ASCII zeroes`, the chain is `Snext = SHA256(UTF8(Sprevious + ':' + lowercaseHex(H)))`. Chain values are lowercase hexadecimal. The receiver checks the chunk hash, expected index/offset and file length, writes into OPFS using a dedicated worker's synchronous file handle, flushes data, writes and flushes its checkpoint, **then** acknowledges `{offset, chain}`. The sender compares the returned offset and chain with its own expected values. Sent bytes and verified disk-flushed bytes are displayed separately. Progress snapshots reach Neon at most once every five seconds plus completion; a delayed server snapshot does not move the local resume offset backwards.

Before a file finishes, the receiver rereads its completed local bytes in bounded chunks and recomputes the chain before marking that file verified or making Save available. A final session `done` requires every file verified. Its final acknowledgement drains before the DataChannel and peer connection close. Both endpoints then acknowledge finishing through the backend; after the recipient saves locally and presses Finish, backend capabilities are invalidated, signaling is cleared and a one-hour metadata deadline applies. Checkpoint and finish verification can take time for large files; those control requests allow up to 30 minutes while normal chunk acknowledgements time out after 60 seconds. The complete-file verification happens in a worker. Web Crypto chunk hashes yield asynchronously on the sender.

A crash after data flush but before checkpoint flush leaves unacknowledged bytes beyond the last durable checkpoint. Reopening truncates that tail. A missing/torn checkpoint restarts that file instead of trusting unknown data. Storage loss, quota errors and integrity errors cannot be called success.

## Recovery

- Pause on sender stops new batches after already bounded in-flight data. Resume continues the same channel.
- Pause on receiver closes the connection safely and retains verified checkpoints; Retry starts a new connection. Sender also retries when notified.
- Network loss, failed ICE, sleeping/suspended tabs or channel closure retain durable local state. Retry creates a new offer generation. Receiver follows the new offer; if it already has a failed transport, it can explicitly retry.
- Reloaded sender restores its device capability from localStorage and must reselect the immutable manifest's matching files/folder. File metadata/fingerprints validate the selection. Before resuming a file, the sender rehashes its entire acknowledged prefix against the receiver's chain, preventing an altered middle of a reselected file from being silently accepted.
- Receiver restores its credential and OPFS data in the same browser profile and origin. It verifies retained bytes and reconciles the actual local checkpoint with the sender. Backend offsets alone are never trusted as proof the endpoint still has the data.
- Completed recipients can use Check retained local files after reload, reverify the data, and Save again. A local manifest supports exporting their own OPFS files after the backend session is closed; it grants no backend access. Lost/evicted browser storage requires retransmission; the sender must reset pairing if the old session is already marked complete.
- Credentials and local data are origin-specific. Clearing site data or changing deployment origin destroys that recovery path. Concurrent receiver tabs cannot open the same exclusive OPFS writer.

## Saving and limits

The receiver stores original bytes in browser-private disk storage, not a growing in-memory Blob. On supported browsers, Save file pipes the local File stream into a user-selected writable file. Other browsers use a Blob URL only for files at most 128 MiB; larger exports are explicitly blocked. No arbitrary filesystem paths are accessed. Folder input uses webkitdirectory when detected and otherwise multiple file selection. Directory structure is preserved in the manifest; export is per-file using its basename.

Available OPFS quota, free disk space, permissions, supported APIs, device CPU and network govern actual capacity. Export may need additional disk space for a copy. A 20 GiB quota is a validated session allowance, not a claim that all browser/device combinations can receive/export that size. Rates/ETA are estimates based on acknowledged bytes; integrity checks and pauses affect them.

## Lifetime and operations

Fixed maximum lifetime: 24 hours from database creation. Inactivity: two hours without an authorized participant request; invitation-only reads cannot keep a session alive. Queries deny access at these boundaries and cleanup deletes signaling, hashes, manifests and progress. Active clients close connections when polling reports expiry. Cleanup never deletes local files. A malicious endpoint can retain already received data and cannot be remotely revoked.

Keep both browsers open and devices awake. No service worker, PWA installation or wake lock can promise continuity after OS suspension, restart or termination. TURN improves reachability but adds bandwidth costs and cannot guarantee every network works. Direct vs relay status comes from the selected WebRTC candidate pair.

## Verification still required before a broad launch

Deterministic tests exercise the actual framing and worker implementation, durable receipt ordering, corrupted chunks, local tampering, zero-byte files and recreated endpoint resume. API tests cover invitation/participant authorization and bounded requests. A real two-device matrix (desktop/mobile, LAN/cellular, restrictive NAT with configured TURN, sleep/reload, low disk and large exports) must validate performance and browser-specific behavior. A 20 GiB transfer has not been empirically verified by the automated adapter tests.

Production supports the managed Cloudflare TURN credential API in addition to standard TURN REST HMAC. The scoped provider secret stays server-side. Only approved active participants may request temporary ICE credentials, limited to 30 requests per hour per role/session. TURN credentials last at most one hour; application session capabilities are invalidated immediately after both finish acknowledgements.
