-- Adds events and RSVPs (who's coming, with adult/kid head counts).
-- Safe to run more than once. Run this BEFORE deploying the new server code:
-- the server checks for these tables at startup and refuses to start without them.

BEGIN;

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  starts_at   TIMESTAMPTZ,
  author_id   INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('going', 'not_going')),
  adults     INTEGER NOT NULL DEFAULT 0 CHECK (adults BETWEEN 0 AND 50),
  kids       INTEGER NOT NULL DEFAULT 0 CHECK (kids BETWEEN 0 AND 50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, member_id)
);

COMMIT;
