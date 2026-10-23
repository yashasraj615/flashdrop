# Quick Transfer historical restoration — 23 October 2026

## Source of truth

The restored baseline is `69e673a5282c3ea73b58def726a54b986b5c3376`, the last commit preceding today's feature implementation. Git history and reflog show no later pre-feature commit. The retained Vercel production deployment `dpl_6Rjdxzkf7sKE7aon1JG9ecAewdzX` reports this exact Git SHA, READY, and the correct Flashdrop project. It was deployed in September and remained the committed baseline at the start of today's work. This identifies the historical production source, not a reproduced corporate security result.

## Change inventory and restoration

| Area | Difference introduced today | Restoration / disposition |
| --- | --- | --- |
| Transfer UI | Shared quick/media component, media filtering/previews, per-file progress, lifecycle/share state changes and revised layout | Original `components/transfer-experience.tsx` restored byte-for-byte. Today's component retained separately as `media-transfer-experience.tsx`. |
| Upload helper | Added mode field, per-file progress callback, abort listener changes | Original `lib/client-upload.ts` restored byte-for-byte; newer code isolated as `media-client-upload.ts`. |
| Database transfer code | Mode-aware records/validation, bulk JSON file inserts instead of sequential historical inserts | Original `lib/transfers.ts` restored byte-for-byte. Media retains its newer code in `media-transfers.ts`. The existing mode column defaults historical inserts to quick. |
| Creation and metadata APIs | Added mode dispatch/response and switched opportunistic cleanup to Next `after()` | Historical `/api/transfers` POST and token GET restored byte-for-byte. Media creation/metadata/addition use `/api/media`; upload-part, completion, abort and download endpoints keep their historical delivery implementation. |
| Countdown | Different initialization and tick frequency | Historical component restored byte-for-byte; today's component preserved as `mode-countdown.tsx` for other modes. |
| Frame and panel styling | Wider frame, different header, blur and control dimensions | Historical narrow frame and header isolated in `quick-app-frame.tsx`; historical panel/control styles scoped to that frame. |
| Download mechanism | No source difference | Existing signed-storage JSON endpoint, ciphertext fetch, browser decryption, save picker/Blob fallback retained unchanged. No replacement stream, proxy, CDN or redirect added. |
| Storage, names and links | No source difference | Storage helper, filename sanitizer/content disposition, MIME handling, token/capability helpers, fragment links, QR implementation, upload planning and child API handlers remain byte-identical. |
| Expiry | Same six TTL choices and COALESCE activation semantics | Historical SQL restored. Additions preserve token and expiry. Historical `lib/cleanup.ts` is restored byte-for-byte. Global cron and media handlers use the preserved extended `mode-cleanup.ts` so text/Wide records are still cleaned. |
| Dependencies and platform | Next/React security updates, new mode dependencies, primary environment entries reconfigured | Current security patches retained. No environment variables or provider settings changed by this restoration. Historical API inspection exposed environment names but not comparable values, so exact historical secret-value equality is not claimed. |

`lib/__fixtures__/quick-transfer-69e673a.json` records SHA-256 checksums recovered from Git. Tests enforce byte identity for 30 restored or unchanged files, including the download route and its critical helpers. The Git tree is not reset.

## Necessary integration boundaries and retained protections

- The four-mode selector stays. Once selected, Quick Transfer uses the historical component and narrow frame.
- `/t/<token>#<secret>` remains the link format. A server-side mode lookup selects the media component only for media records, preserving existing media links. That lookup and frame wrapper are integration glue outside the recovered Quick component; the whole page tree is not claimed to be byte-identical.
- The quota/expiry database trigger remains active to prevent concurrent oversubscription and activation after expiry. Removing it would weaken a security fix. No production migration, table reset or manual deletion of user records is performed for this restoration. Normal expired-record cleanup still runs under the existing policy.
- Current framework security patches, cross-origin service-worker cache exclusion, shared animation performance/reduced-motion guards and text/Wide cleanup remain. These are explicit exceptions to a whole-site visual/runtime rollback.
- Newer React lint diagnostics in the two exact historical components remain visible as scoped warnings, rather than rewriting recovered behavior. Other application lint rules retain their existing severity.
- New media files still use the same original encrypted storage delivery mechanism. Media creation and metadata are isolated so they no longer modify Quick's handlers or upload helper.

## Cybersecurity investigation

The user supplied this warning: "Your organization prevents you from uploading the file to this location. To protect the sensitive info in this file, your organization prevents you from uploading it to unapproved locations." Its wording indicates an organizational sensitive-data upload/destination restriction, not evidence of a changed download response or malware verdict. The product, rule, event ID, blocked hostname, file classification and corporate logs remain unavailable. It does not establish that any particular code change caused the block or that the original destination is permitted. A legitimate approval requires company security review; this restoration does not circumvent the policy.

Relevant changed surfaces include the shared UI/upload path, metadata mode field, database reservation behavior, frontend dependency/build contents, service worker and production environment provisioning. The download route, signed URL construction, response MIME/content disposition, filename processing, encryption format and browser download helper had no source changes between the baseline and the pre-restoration release. They must not be represented as an identified new download architecture or proven alert cause.

Historical and current deployment environment variable names can be inspected; secret-value equality was not available from the deployment metadata. The restoration does not alter credentials, hostnames, providers, domains or security controls. Controlled tests verify the configured primary Neon storage endpoint, not historical DNS/provider reputation or a corporate verdict.

## Verification

- 94 tests pass in 16 files, including 30 exact-source comparisons, historical creation payload and `/t` link checks, download metadata/expiry tests, and existing text/Wide protocol tests.
- Type checking and production build pass. Lint has zero errors and 17 warnings: seven pre-existing warnings plus ten diagnostics in recovered historical components kept at warning severity.
- Controlled Quick and media smoke checks each encrypted, uploaded, downloaded and decrypted three small files, verifying SHA-256 equality. They verified preserved token/expiry, quota and owner checks, attachment filenames, JSON metadata, octet-stream ciphertext and `private, no-store` cache headers.
- An additional controlled 9 MiB Quick file exercised multipart part URLs and completion; download/decryption and the same metadata/header/integrity checks passed.
- Storage responses came from `br-ancient-cake-a55ncfm7.storage.c-1.us-east-2.aws.neon.tech` with no redirects. Full signed URLs and credentials were not logged. Synthetic test transfers use five-minute lifetimes and normal cleanup.
- Wide Connect's API, component, transport, storage worker and STUN configuration are unchanged. Text Pad APIs are unchanged; its countdown import points at the preserved newer component.
- The warning is known, but corporate endpoint/security-tool behavior after restoration remains unverified. No company controls were evaded, disabled or bypassed.

Production deployment confirmation is reported in the release response after all checks pass. Builds or controlled downloads alone do not establish that the corporate alert is resolved.
