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
