-- Flashdrop schema: metadata + chunked BYTEA payloads in Neon PostgreSQL.
-- Files are stored as 512 KiB BYTEA rows rather than a single 1 GB value.
-- That stays under the Neon HTTP driver 64 MB query limit and avoids
-- storing one oversized TOAST value on the pageserver.

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

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL CHECK (file_size >= 0 AND file_size <= 1073741824),
  chunk_count INTEGER,
  bytes_received BIGINT NOT NULL DEFAULT 0,
  status file_status NOT NULL DEFAULT 'uploading',
  uploaded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_at TIMESTAMPTZ,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  last_cleanup_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS files_token_idx ON files (token);
CREATE INDEX IF NOT EXISTS files_expires_status_idx
  ON files (expires_at, status)
  WHERE status NOT IN ('deleted', 'failed');
CREATE INDEX IF NOT EXISTS files_status_idx ON files (status);
CREATE INDEX IF NOT EXISTS files_cleanup_idx
  ON files (status, expires_at)
  WHERE status IN ('active', 'expired', 'deleting', 'uploading');

CREATE TABLE IF NOT EXISTS file_chunks (
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  byte_offset BIGINT NOT NULL CHECK (byte_offset >= 0),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 1048576),
  checksum TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS file_chunks_file_id_idx ON file_chunks (file_id);

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
