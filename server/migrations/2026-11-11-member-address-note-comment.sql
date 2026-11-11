-- Adds address, note and comment to members.
-- Safe to run more than once. Run this BEFORE deploying the new server code:
-- the server checks for these columns at startup and refuses to start without them.

BEGIN;

ALTER TABLE members ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS note    TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';

COMMIT;

-- Optional, later: the app no longer uses relationship. Dropping it deletes that
-- data permanently, so only run this once you're sure you don't need it.
-- ALTER TABLE members DROP COLUMN IF EXISTS relationship;
