# Flashdrop

Four transfer modes in the existing cyan/aqua Next.js application.

| Mode            | Limit                            | Content storage                                                        | Expiration                                             |
| --------------- | -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Quick Transfer  | 1 GiB / 100 files                | Browser-encrypted originals in private Neon Object Storage             | 5, 10, 30 minutes; 1, 2, 5 hours                       |
| Photos & Videos | 1 GiB / 100 files                | Same encrypted original-file pipeline; no transcoding or recompression | Same choices                                           |
| Text Pad        | 15,000 lines **and** 1 MiB UTF-8 | Separate Neon text records; not end-to-end encrypted                   | Same choices                                           |
| Wide Connect    | 20 GiB / 1,000 files             | File payload only on endpoints; WebRTC may use a TURN relay            | 24 hours maximum, 2 hours without participant activity |

UI uses the familiar GB label for binary byte limits. Files added to an existing stored transfer retain its link and original expiration. Expiration starts when the first file becomes active. Quota reservations are serialized by a database trigger, including concurrent requests. Individual and aggregate upload progress is available. Original logos, favicon, metadata imagery and PWA icons are retained.

## Local development

```sh
cp .env.example .env.local
npm ci --legacy-peer-deps
npm run dev
```

Reuse the configured Neon project and private `temporary-files` bucket. Do not commit `.env.local`, database URLs or storage/TURN secrets. For a fresh database apply `db/schema.sql`. For an existing deployment apply `db/migrate-four-modes.sql` and `db/migrate-wide-finalization.sql` before deploying the new code. The migration is additive and repeatable. See `RELEASE.md` for the verified database state.

## Storage and security

Stored files are AES-GCM encrypted in chunks by the browser. `/t/<token>#<secret>` contains the key in its fragment, which is not sent in HTTP requests. Storage credentials stay on the server; encrypted file payloads use signed S3 URLs directly instead of passing through a Vercel function. Preserve bucket CORS for the deployed origin and `ETag` access.

Text Pad uses a separate capability-bearing link `/text/<opaque-token>#<read-secret>`. Only a hash of its read secret is stored. The recipient sends the capability in a request header. Anyone with the full link can read the pad. Flashdrop's backend can read stored text; this mode does **not** claim file-style end-to-end encryption. API checks use database time and no-store responses. Text is limited by lines, UTF-8 bytes and a 2 MiB encoded request-body cap. React Markdown, GFM and rehype-sanitize render without raw HTML or embedded remote images. Code is text, never executed.

## Wide Connect architecture

See `docs/wide-connect.md` for the protocol, consent model, integrity scheme, recovery and browser limits. HTTPS polling carries bounded SDP and progress metadata through Next route handlers and Neon. It requires no persistent signaling service and does not hold a serverless request open. No file-content upload route exists for Wide Connect.

Cloudflare TURN is configured for production. For another environment, configure a TURN REST-compatible service for restrictive networks using `WIDE_TURN_URLS` and `WIDE_TURN_SECRET`. Approved participants receive HMAC-derived credentials valid for one hour; the shared secret stays server-side. The managed alternative uses server-only `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` to obtain one-hour credentials for approved active peers. ICE credential requests have a separate rate limit. Without a configured provider, STUN/direct routes may fail. The interface reports configured relay availability and the selected direct/relay route. TURN forwards encrypted WebRTC traffic and consumes relay bandwidth; it must be configured not to persist payloads.

Keep both devices awake and the browser open. Browser-private storage is required for receipt. Large-file export requires the File System Access save picker; the fallback download is capped at 128 MiB per file. Folder selection is feature-detected. After reload, the sender must reselect matching originals; the receiver must retain its local partial files. Backend metadata cannot reconstruct lost bytes.

Wide Connect closes its DataChannel and peer connection after verified receipt. The sender acknowledges completion and the recipient saves the local files and presses **Files saved · Finish session**. Once both finish, backend capabilities are invalidated, signaling is cleared, and coordination metadata expires within one hour. Local files remain accessible to their owner.

## Expiration and cleanup

- Stored-file access is denied by the backend after expiry. Existing signed download URLs can remain valid for their short signing window; already downloaded bytes cannot be revoked.
- Text and Wide Connect session queries check `NOW()`. Wide sessions also check participant inactivity.
- `GET /api/cleanup` is protected by `CRON_SECRET`. Vercel Cron remains scheduled daily at 04:00 UTC; the optional Neon cleanup function follows the same policies. File-creation and expired-file requests also schedule cleanup using Next `after()`.
- Expiration means immediate backend access denial, **not** guaranteed physical deletion at that exact second. Physical object/text/session deletion occurs on a cleanup run. On the daily schedule there may be a delay of roughly a day or longer after failed runs/backlogs. Configure a more frequent scheduler if your plan supports it and tighter removal timing is needed.
- Wide cleanup deletes coordination metadata only. It never deletes endpoint originals or locally received files. Recipients can delete browser-local copies explicitly.
- PWA caches only same-origin app resources and the offline home shell. API responses and remote storage payloads are excluded. Installation does not provide reliable background WebRTC after suspension or termination.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Production build fetches the existing Google Fonts. In environments behind a TLS proxy, configure the system CA bundle without disabling certificate validation. Tests cover text/size/expiry authorization boundaries, safe Markdown, encryption helpers, and the actual Wide Connect protocol/storage-worker code with deterministic browser adapters. They do not substitute for transfers between real browsers on different networks. No repeated Ballpit browser automation is used.
