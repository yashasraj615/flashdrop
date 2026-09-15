# Flashdrop

Temporary file transfer. Upload any file up to **1 GB**, share a link or QR code, and the file expires after **24 hours**.

## Product

1. Drop or choose a file.
2. Flashdrop uploads it directly to object storage.
3. You get a private download link and QR code.
4. Recipients can download without an account.
5. A backend cleanup job deletes expired objects and database records.

Expiration is enforced server-side from Neon timestamps. The browser countdown is display-only.

## Stack

- Next.js App Router
- Neon PostgreSQL (metadata only)
- Vercel Blob (private objects, client multipart uploads, signed downloads)
- Vercel Cron (`GET /api/cleanup` daily at 04:00 UTC)

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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `NEXT_PUBLIC_APP_URL` | Public origin for share links |
| `CRON_SECRET` | Bearer token for cleanup |

Apply schema if you are not using the provisioned Flashdrop database:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Tests

```bash
npm test
npm run typecheck
```

## Cleanup

Vercel Cron calls `/api/cleanup` once per day (Hobby-compatible). The handler:

1. Requires `Authorization: Bearer $CRON_SECRET`
2. Selects expired, deleting, and stale uploading rows
3. Deletes the Blob object
4. Marks the database row `deleted`

Download requests also reject expired files immediately, even before the next cron run.
