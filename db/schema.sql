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
  lifetime_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (lifetime_seconds IN (300, 600, 1800, 3600, 7200, 18000)),
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

-- Four transfer modes (also available separately for existing deployments).
-- Additive, repeatable migration. Does not change existing encrypted file records.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'quick'
  CHECK (mode IN ('quick', 'media'));
CREATE TABLE IF NOT EXISTS text_pads (
  token TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  content TEXT NOT NULL CHECK (octet_length(content) <= 1048576),
  format TEXT NOT NULL CHECK (format IN ('markdown', 'plain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS text_pads_expiry_idx ON text_pads(expires_at);
CREATE TABLE IF NOT EXISTS wide_sessions (
  token TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  invite_hash TEXT NOT NULL,
  recipient_hash TEXT,
  pairing_code TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','pending','approved','interrupted','complete','declined')),
  manifest JSONB NOT NULL,
  total_size BIGINT NOT NULL CHECK (total_size BETWEEN 0 AND 21474836480),
  progress JSONB NOT NULL DEFAULT '{}',
  generation INTEGER NOT NULL DEFAULT 0,
  offer JSONB,
  answer JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wide_sessions_expiry_idx ON wide_sessions(expires_at);
CREATE INDEX IF NOT EXISTS wide_sessions_activity_idx ON wide_sessions(last_activity);

-- Serialize quota reservations per stored transfer, including concurrent Add files requests.
CREATE OR REPLACE FUNCTION flashdrop_file_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE used_bytes BIGINT; used_count INTEGER; parent transfers%ROWTYPE;
BEGIN
  SELECT * INTO parent FROM transfers WHERE id = NEW.transfer_id FOR UPDATE;
  IF NOT FOUND OR parent.status NOT IN ('uploading','active') OR (parent.expires_at IS NOT NULL AND parent.expires_at <= NOW()) THEN
    RAISE EXCEPTION 'FLASHDROP_CLOSED: This transfer has expired or is unavailable.';
  END IF;
  IF NEW.status IN ('uploading','processing','active') THEN
    SELECT COALESCE(SUM(file_size),0), COUNT(*) INTO used_bytes, used_count
      FROM transfer_files WHERE transfer_id = NEW.transfer_id
        AND status IN ('uploading','processing','active') AND id <> NEW.id;
    IF used_bytes + NEW.file_size > 1073741824 OR used_count + 1 > 100 THEN
      RAISE EXCEPTION 'FLASHDROP_QUOTA: This transfer supports at most 1 GB and 100 files.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER flashdrop_file_quota_guard
  BEFORE INSERT OR UPDATE OF file_size, status ON transfer_files
  FOR EACH ROW WHEN (NEW.status IN ('uploading','processing','active'))
  EXECUTE FUNCTION flashdrop_file_quota();

-- Terminal session lifecycle: no payload columns and no changes to stored-file quotas.
ALTER TABLE wide_sessions ADD COLUMN IF NOT EXISTS sender_finished_at TIMESTAMPTZ;
ALTER TABLE wide_sessions ADD COLUMN IF NOT EXISTS recipient_finished_at TIMESTAMPTZ;
ALTER TABLE wide_sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE wide_sessions ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE wide_sessions DROP CONSTRAINT IF EXISTS wide_sessions_status_check;
ALTER TABLE wide_sessions ADD CONSTRAINT wide_sessions_status_check
  CHECK (status IN ('waiting','pending','approved','interrupted','complete','declined','closed'));
CREATE INDEX IF NOT EXISTS wide_sessions_finished_idx ON wide_sessions(finished_at) WHERE finished_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS flashdrop_schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
