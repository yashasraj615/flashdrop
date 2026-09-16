-- Allow 5 minute through 5 hour transfer lifetimes.
UPDATE transfers
SET lifetime_seconds = 300
WHERE lifetime_seconds NOT IN (300, 600, 1800, 3600, 7200, 18000);

ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_lifetime_seconds_check;
ALTER TABLE transfers
  ADD CONSTRAINT transfers_lifetime_seconds_check
  CHECK (lifetime_seconds IN (300, 600, 1800, 3600, 7200, 18000));
