-- Adds a custom sort order for the member list (set by admins dragging rows).
-- Safe to run more than once. Run this BEFORE deploying the new server code:
-- the server checks for this column at startup and refuses to start without it.
-- Everyone starts at 0, so the list keeps its current order until an admin sorts it.

ALTER TABLE members ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
