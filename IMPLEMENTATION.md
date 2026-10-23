# Flashdrop takeover

## Inspected baseline

- Clean Git working tree; Next 16.3.4 App Router, React 19, Tailwind 4.
- Working stored-file architecture: Neon metadata, private S3-compatible Neon bucket, browser AES-GCM multipart uploads, fragment decryption keys, owner capability for additions, on-demand QR and browser sharing.
- Six lifetime choices already enforced; activation uses COALESCE so additions preserve original expiry. README's 24-hour claim was stale.
- Existing Ballpit already disposes observers and renderer and pauses when hidden. Splash retains framebuffer resources across resize and its hidden loop needs attention. Cursor scans all controls every frame and scales hover targets, creating hover-boundary drift.
- PWA shell caches navigations with network-first behavior; no background WebRTC guarantee. No Text Pad or Wide Connect.
- Existing Vercel daily cleanup and optional Neon cleanup function; access expiry is immediate, physical storage cleanup is deferred until scheduled cleanup.

## Implementation sequence

1. Preserve encrypted file APIs and assets; fix lifecycle and cursor costs.
2. Add responsive mode selection and original-media selection, previews and removal.
3. Add bounded Text Pad API/schema, safe Markdown and recipient page.
4. Add scoped Wide Connect sessions with atomic recipient claim, sender approval, expiring HTTPS polling signaling and STUN-assisted direct WebRTC.
5. Add ordered WebRTC chunk protocol, persisted local partial data, integrity-checked acknowledgements, retry/resume and honest capability messages.
6. Test backend boundaries and protocol; typecheck, lint and build. Validate additive migrations on a Neon branch. Document deployment/configuration and verification limits.

Browser animation automation is deliberately excluded per handoff. No live release is implied by release preparation.
