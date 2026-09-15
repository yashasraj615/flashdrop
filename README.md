# Flashdrop

Temporary encrypted file transfer. Upload one or many files up to **1 GB total**, share a single link, and the transfer expires after **24 hours**.

## Product

1. Drop or choose files.
2. The browser encrypts them with a key that never leaves the device.
3. Ciphertext is uploaded to **Neon Object Storage** with short-lived signed URLs.
4. You get one private link (`/t/<token>#<secret>`) and can show a QR code on demand.
5. Anyone with the full link can download and decrypt locally. You can still add files to the same transfer until it expires.
6. Backend cleanup deletes expired objects and metadata.

The URL fragment holds the decryption key and is never sent to the server. Expiration is enforced from Neon timestamps. The browser countdown is display-only.

## Storage architecture

- **Neon PostgreSQL** stores transfer metadata, tokens, expiration, quota, and cleanup state.
- **Neon Object Storage** stores encrypted objects in a private `temporary-files` bucket.
- Object keys are random (`uploads/<uuid>`).
- The browser never receives storage credentials.

## Stack

- Next.js App Router on Vercel
- Neon PostgreSQL + Neon Object Storage (`us-east-2`)
- Client-side AES-GCM (Web Crypto)
- Vercel Cron plus an optional Neon Function for cleanup

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required variables are listed in `.env.example`. Never commit `.env.local`.

## Tests

```bash
npm test
npm run typecheck
```
