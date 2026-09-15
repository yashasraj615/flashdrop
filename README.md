# Flashdrop

Temporary file transfer. Upload any file up to **1 GB**, share a link or QR code, and the file expires after **24 hours**.

## Product

1. Drop or choose a file.
2. Flashdrop streams it to Neon PostgreSQL in 512 KiB binary chunks.
3. You get a private download link and QR code.
4. Recipients can download without an account.
5. A backend cleanup job deletes expired binary chunks and database records.

Expiration is enforced server-side from Neon timestamps. The browser countdown is display-only.

## Storage architecture

Uploaded bytes live in Neon PostgreSQL, not in Vercel Blob, S3, R2, or another object store.

- Metadata is stored in `files`.
- Binary payloads are stored as `BYTEA` rows in `file_chunks` (512 KiB each).
- A single 1 GB `BYTEA` value is intentionally avoided: Neon’s HTTP driver caps queries at 64 MB, and the pageserver is a poor fit for one-gigabyte TOAST values.
- PostgreSQL large objects were not used because the serverless HTTP driver does not provide a practical streaming `lo_*` path for Vercel.

### Honest limits

The application accepts and stores files up to **1 GB** in code. These platform quotas can still block a 1 GB transfer even though the schema supports it:

| Constraint | Effect |
| --- | --- |
| Neon Free storage (0.5 GB / project) | A 1 GB file cannot physically fit until the project has at least 1 GB of paid storage. |
| Neon HTTP driver 64 MB request/response | Chunks stay at 512 KiB so each insert/select stays well under the cap. |
| Vercel request body (~4.5 MB) | Upload chunks are 512 KiB so they fit a serverless function request. |
| Vercel function duration (Hobby 60s, Pro up to 300s) | A full 1 GB download streams ~2048 chunk reads. Hobby may time out; Pro is the practical path for the largest files. |
| Backups / instant restore | Chunked BYTEA is included in Neon storage and history. A 1 GB file increases restore size and time accordingly. |

Downloads are rejected the instant `expires_at` is reached, even if the next cleanup run has not deleted the rows yet.

## Stack

- Next.js App Router
- Neon PostgreSQL (metadata + chunked BYTEA file data)
- Vercel (app hosting + Cron trigger only)
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
| `NEXT_PUBLIC_APP_URL` | Public origin for share links |
| `CRON_SECRET` | Bearer token for cleanup |

## Production (Vercel)

The GitHub repository is at `https://github.com/yashasraj615/flashdrop`.

1. `npx vercel login`
2. Import the GitHub repo (or `npx vercel --prod` from this directory).
3. Set `DATABASE_URL`, `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL` for Production and Preview.
4. Confirm the Neon project has enough storage for the files you intend to host (more than 1 GB for a 1 GB transfer).
5. Redeploy. Vercel Cron will call `/api/cleanup` daily at 04:00 UTC.

Hobby Cron only supports one run per day. Downloads are still blocked the moment `expires_at` is reached.

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
2. Selects expired, deleting, failed, and stale uploading rows
3. Deletes `file_chunks` BYTEA data
4. Deletes the `files` row

Download requests also reject expired files immediately, even before the next cron run.
