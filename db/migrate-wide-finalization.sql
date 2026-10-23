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
