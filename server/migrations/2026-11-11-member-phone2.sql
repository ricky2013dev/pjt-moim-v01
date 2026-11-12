-- Adds a second phone number to members.
-- Safe to run more than once. Run this BEFORE deploying the new server code:
-- the server checks for this column at startup and refuses to start without it.

ALTER TABLE members ADD COLUMN IF NOT EXISTS phone2 TEXT NOT NULL DEFAULT '';
