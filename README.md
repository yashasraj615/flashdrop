# Flashdrop

Temporary file transfer. Upload any file up to **1 GB**, share a link or QR code, and the file expires after **24 hours**.

## Product

1. Drop or choose a file.
2. The browser uploads it directly to **Neon Object Storage** with a short-lived signed URL (multipart above 8 MiB).
3. You get a private download link and QR code.
4. Recipients can download without an account.
5. Backend cleanup deletes expired objects and database records.

Expiration is enforced server-side from Neon timestamps. The browser countdown is display-only. A file becomes undownloadable at `expires_at` even if physical deletion runs a few minutes later.

## Storage architecture

- **Neon PostgreSQL** stores metadata, tokens, expiration, and cleanup state.
- **Neon Object Storage** stores the uploaded binary in a private `temporary-files` bucket.
- Object keys are random (`uploads/<uuid>`). Original filenames are never used as storage keys.
- The browser never receives storage credentials — only time-limited signed URLs.

## Stack

- Next.js App Router on Vercel
- Neon PostgreSQL (metadata)
- Neon Object Storage (S3-compatible, `us-east-2`)
- Neon Function `cleanup` with a scheduled trigger (plus Vercel Cron as a backup trigger)
- Vercel hosts the app; it is not the source of truth for expiration

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `AWS_ACCESS_KEY_ID` | Neon storage credential (`token_id`) |
| `AWS_SECRET_ACCESS_KEY` | Neon storage secret |
| `AWS_ENDPOINT_URL_S3` | Branch S3 endpoint |
| `AWS_REGION` | `us-east-2` |
| `NEON_STORAGE_BUCKET` | `temporary-files` |
| `NEXT_PUBLIC_APP_URL` | Public origin for share links |
| `CRON_SECRET` | Bearer token for `/api/cleanup` |

## Tests

```bash
npm test
npm run typecheck
```

## Cleanup

A scheduled Neon Function and `GET /api/cleanup` (Vercel Cron, daily at 04:00 UTC) both:

1. Select expired, deleting, failed, and stale uploading rows
2. Abort leftover multipart uploads
3. Delete the object from Neon Object Storage
4. Delete the metadata row

Downloads are rejected the moment `expires_at` is reached, even before the next cleanup run.
