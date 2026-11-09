# Transfer performance and clipboard workspace — 9 November 2026

## Research and implementation decisions

Primary references reviewed:

- [WebRTC interoperable file-transfer sample](https://webrtc.github.io/samples/src/content/datachannel/filetransfer/): reliable ordered chunks, explicit metadata and bounded receipt. Its in-memory Blob demo is not suitable for 20 GiB, so Flashdrop retains disk-backed receipt.
- [DataChannel send limits](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send) and [buffer-low notifications](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold): preserve interoperable small frames and use bufferedamountlow to resume sending rather than tight polling.
- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) and [flush durability](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle/flush): synchronous access remains in a worker, and disk acknowledgments must follow successful flushes.
- [W3C Clipboard API draft](https://www.w3.org/TR/clipboard-apis/) and [MDN clipboard permissions](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API): clipboard access is user initiated, HTTPS-only where required, permission dependent, and browser support varies. No background clipboard surveillance or permission bypass.
- [clipboard.js](https://github.com/zenorocha/clipboard.js): reviewed copy/cut interaction patterns; no dependency added because native APIs already meet the text use case.
- [react-markdown](https://github.com/remarkjs/react-markdown): retain the existing open-source sanitized Markdown pipeline. No copied third-party source, external editor service or configuration is required. CodeMirror's guide was unavailable to the research client (403), so it was not relied upon.

## P2P changes

The previous sender used stop-and-wait batches of 32 × 12 KiB; every receiver chunk flushed payload and checkpoint separately. The sender now uses a sliding window of up to 32 receipts (384 KiB plaintext), a bounded 128-frame receive queue, and worker batches of at most 64 chunks. Each batch validates hashes and offsets, writes data, flushes data and checkpoint, and only then returns receipts. The unchanged 12 KiB chunk alignment/rolling chain remains compatible with existing local checkpoints; individual legacy chunk operations remain supported.

Source disk reads are amortized over 64 chunks rather than reading one Blob slice per frame. Worker buffers are transferred rather than cloned. Event-driven channel backpressure retains a bounded send queue; a 60-second stall is reported instead of hanging. UI progress paints at most every 100 ms with an explicit final paint. Transient disconnected states get a 10-second recovery grace period; failed connections still close promptly. STUN-only configuration and backend signaling are unchanged; restrictive NAT/firewall pairs can still fail without a relay.

A 512-receipt prototype regressed local real-browser throughput, so it was rejected. The shipping sliding window keeps the tested 32-receipt bound while replenishing individual receipts rather than waiting for an entire batch. The receiver drains without an artificial batching delay and coalesces arrivals while disk work is active. CPU, SCTP congestion control, storage, RTT and network throughput remain constraints. No 10× speed claim is made.

## Stored transfers and bug fixes

Quick and media uploads now overlap encryption with signed-part URL requests, retry encrypted PUTs at most twice after failure, remove abort listeners, and reject missing multipart ETags instead of inventing invalid ones. Identical ciphertext is reused for a retry of the same part. Existing four-part concurrency and encrypted byte format are retained.

Downloads overlap one next-chunk read/decryption with the current write, limiting additional memory to one chunk. Failed disk writes abort their writable instead of silently redownloading everything through the Blob fallback. Save-all likewise no longer hides disk/network errors by retrying the whole selection. Fetch readers are cancelled on exit.

The cleanup endpoint now fails closed when CRON_SECRET is absent. A user-agent string cannot authenticate a cleanup request. Existing production cron must continue supplying its configured bearer secret.

The latest user request explicitly authorizes performance work beyond the earlier historical restoration. Two changed client helper files are therefore excluded from historical byte-parity assertions; unaffected baseline files, wire-format, link, filename, authorization and expiry checks remain. No schema migration, provider, bucket, TURN service or new production dependency was introduced.

## Clipboard workspace

User-triggered paste, text-file import, Markdown insertion tools (bold, italic, headings, code, blocks, tasks, quotes and links), note/meeting/code/table templates, literal find/replace with match count, undo/redo, selection, line wrapping, export, word/read-time statistics, case/whitespace/line tools, JSON formatting/minification, and Unicode-safe URL/Base64 transforms. Existing safe preview, temporary links, TTL selection, QR and share controls remain.

Local drafts are explicit, tab-session-only, limited to five entries of at most 200 KB each, and can be deleted. They are never included in shared pads. Undo history is bounded to twelve snapshots. This is a text/Markdown workspace, not an unrestricted OS clipboard manager or image editor. Image/video sharing remains in its dedicated mode. Invalid transform inputs leave the original text untouched. Shared text remains capability protected, not end-to-end encrypted; the existing 1 MiB/15,000-line limits apply.

## Verification and measured limits

- 103 automated tests in 20 files pass; this includes corruption, durable acknowledgments, checkpoint resume, source/local tampering, clipboard transformations, PUT cancellation/retry, disk-failure cleanup and cron authorization.
- Type checking and production build pass; lint retains the 17 documented legacy warnings with zero errors.
- Two independent Chrome contexts checked the clipboard toolbar, undo, replace and mobile overflow. Reduced motion was enabled; no repeated Ballpit automation.
- A single Chrome OPFS experiment wrote and verified 3 MiB through both worker APIs: per-chunk durable writes took 136.4 ms and groups of 32 took 59.5 ms, approximately 2.29× faster. This is one storage-stage sample, not a physical-device/network throughput result or a guaranteed improvement.
- An 8 MiB real DataChannel comparison between two isolated Chrome contexts on one machine verified full original-file SHA-256 equality. The historical protocol took 917–963 ms in two runs; an initial oversized-window prototype took 4,270–12,702 ms and was rejected. The final bounded-window path completed in 543 and 555 ms in two further runs (initial revised run: 556 ms), roughly 1.7× faster in this limited comparison. These are small same-host samples including setup/final verification, not a cross-network benchmark or guaranteed gain.
- Physical-device 20 GiB, cross-network/NAT, low-disk and sleep/restart performance still require device QA. No universal 10× speed or connectivity guarantee is made. No enterprise security policy is changed or bypassed.
