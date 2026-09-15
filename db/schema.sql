-- Flashdrop schema: Neon PostgreSQL metadata + Neon Object Storage ciphertext.
-- Encrypted file bytes live in the private `temporary-files` bucket.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE file_status AS ENUM (
    'uploading',
    'processing',
    'active',
    'expired',
    'deleting',
    'deleted',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM (
    'uploading',
    'active',
    'expired',
    'deleting',
    'deleted',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  manage_token_hash TEXT NOT NULL,
  status transfer_status NOT NULL DEFAULT 'uploading',
  total_size BIGINT NOT NULL DEFAULT 0 CHECK (total_size >= 0 AND total_size <= 1073741824),
  expires_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_at TIMESTAMPTZ,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  last_cleanup_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 1073741824),
  encrypted_size BIGINT NOT NULL CHECK (encrypted_size > 0),
  chunk_size INTEGER NOT NULL CHECK (chunk_size > 0),
  encryption_version TEXT NOT NULL DEFAULT 'v1',
  multipart_upload_id TEXT,
  status file_status NOT NULL DEFAULT 'uploading',
  uploaded_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS transfers_token_idx ON transfers (token);
CREATE INDEX IF NOT EXISTS transfers_expires_status_idx
  ON transfers (expires_at, status)
  WHERE status NOT IN ('deleted', 'failed');
CREATE INDEX IF NOT EXISTS transfers_status_idx ON transfers (status);
CREATE INDEX IF NOT EXISTS transfers_cleanup_idx
  ON transfers (status, expires_at)
  WHERE status IN ('active', 'expired', 'deleting', 'uploading', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS transfer_files_object_key_idx ON transfer_files (object_key);
CREATE INDEX IF NOT EXISTS transfer_files_transfer_id_idx ON transfer_files (transfer_id);
CREATE INDEX IF NOT EXISTS transfer_files_status_idx ON transfer_files (status);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);

CREATE TABLE IF NOT EXISTS cleanup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  scanned INTEGER NOT NULL DEFAULT 0,
  deleted_objects INTEGER NOT NULL DEFAULT 0,
  deleted_records INTEGER NOT NULL DEFAULT 0,
  retried INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
