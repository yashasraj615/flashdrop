# Flashdrop production integration — 23 October 2026

## Release scope

The existing Next.js application, encrypted Neon Object Storage workflow and cyan/aqua branding are preserved. Four dedicated modes now provide Quick Transfer and original-quality Photos & Videos (1 GiB / 100 files each), safe Text Pad sharing (15,000 lines and 1 MiB UTF-8), and Wide Connect (20 GiB / 1,000 files, endpoint payloads only).

Wide Connect uses explicitly accepted and sender-approved pairing, scoped HTTPS signaling, WebRTC DTLS/SCTP, STUN and configured TURN, bounded frames/backpressure, disk-flushed verified acknowledgements, worker-based OPFS receipt, complete-file integrity checks and practical resume. No Wide Connect payload is stored on Neon, Vercel or the temporary object bucket.

## Production database

Applied to the existing primary Neon branch `br-ancient-cake-a55ncfm7` of project `spring-truth-22385123`, using the authenticated Neon MCP after isolated validation and explicit authorization in the production handoff:

- `db/migrate-four-modes.sql`
- `db/migrate-wide-finalization.sql`

`flashdrop_schema_migrations` records `four-modes-v1` and `wide-finalization-v1`. The existing 1 GiB stored-transfer constraint remains unchanged. The quota trigger serializes stored-file reservations and rejects aggregate oversubscription, more than 100 files, and activation after expiry. It does not modify object references or transfer payloads. Primary inspection before migration found zero existing transfers/files and neither new table. All six lifetime choices and adding files without extending expiry were checked for both stored-file modes on the isolated branch.

New tables separate text content from Wide Connect metadata. Wide sessions contain no file-content column. Once all files are verified, the DataChannel drains its final receipt and both peer connections close. After both endpoints finish (recipient saves locally and acknowledges), application credentials are invalidated, signaling is cleared, and a one-hour metadata access deadline applies. Local originals and received files are never deleted by backend cleanup. Physical metadata deletion follows the next cleanup run; the existing daily Vercel cron can delay physical removal beyond the logical expiry.

## Hosting and secrets

The intended Vercel project is `prj_NmbU1ntJh3vr6hCJ2ZZoebgVmUhm`, `flashdrop`, under team `team_7OKb8x4kWhkooIWlcC3BRbVK` (`yashas-projects-70302527`). Its Git connection is `yashasraj615/flashdrop`, production branch `main`. Existing production aliases include `https://flashdrop-three.vercel.app`.

The MCP can identify the correct team but project/deployment operations return 404/403. Its documented CLI fallback successfully identifies the exact project using existing CLI credentials; no reauthentication or replacement project is needed. Production database, storage, bucket, region, cron secret and public URL have been configured securely. Secret values were passed through stdin and were not logged or committed. The production database hostname was verified against the existing Neon primary endpoint.

Cloudflare TURN key `Flashdrop production Wide Connect` was created in the connected account after explicit approval for potentially billable relay service. Its credential endpoint returned valid short-lived credentials; the scoped key ID and API token are Vercel production Secrets. The application requests ICE credentials only for approved active participants, with a separate rate limit; no provider token reaches the browser. Generic TURN REST/HMAC configuration remains supported. Application session credentials are revoked at closure; issued TURN credentials expire within one hour.

## Verification and release process

- 59 automated tests cover encryption/quotas, text and Markdown safety, role authorization, actual-Host origin validation, scoped ICE credentials, bounded transfer frames, corrupted bytes, retained-data tampering, changed sources, zero-byte files, resume, completion and terminal credential invalidation.
- Typecheck and production build pass. ESLint has no errors; existing/manual-image and ancillary-script warnings remain.
- Production dependency audit is clean. Nine high advisories remain in development-only glob/braces tooling; no forced downgrade was applied.
- Isolated HTTP smoke tests pass for text and Wide Connect APIs, including database-time expiry and finalization. A real headless Chrome test using two isolated browser contexts and forced TURN relay transferred 524,305 bytes through Cloudflare, verified the downloaded original by SHA-256, confirmed both peer connections closed, and finalized both endpoints. Reduced motion disabled Ballpit. This is a real browser/relay check, not a physical-device or 20 GiB test. The exact Git/deployment receipt is reported by the release execution.
- Source inspection verifies cursor hit testing, clear hover-frame center, reduced-motion/touch support, stable animation cleanup and no cursor-following Ballpit. No repeated Ballpit browser navigation is used.

Release sequence: run checks and isolated integration tests; review and commit source without secrets; push existing `main`; deploy the exact commit to the existing Vercel production target (MCP first, documented CLI fallback when necessary); confirm READY status and production aliases; run production smoke checks; remove the isolated Neon validation branch after retaining migrations and validation results. A preview deployment alone is not a completed production release.

## Remaining platform limits

A 20 GiB transfer between physical devices, diverse mobile browsers/NATs, sleep/restart and low-disk conditions still requires device QA. Browser installation cannot guarantee background WebRTC. Recovery requires retained source and partial destination data; metadata alone cannot reconstruct bytes. OPFS capacity and Save File API support determine actual large-file receipt/export. The fallback export is capped at 128 MiB per file. Folder selection is feature-detected.

See `README.md` and `docs/wide-connect.md` for the complete architecture and lifecycle. Primary references: [Cloudflare TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [Next.js security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026), [DataChannel buffering](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount), [worker-local file access](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle).
