CREATE TABLE IF NOT EXISTS members (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  relationship     TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  phone2           TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  comment          TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  role             TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  passcode_hash    TEXT NOT NULL,
  passcode_version INTEGER NOT NULL DEFAULT 1,
  photo            BYTEA,
  photo_mime       TEXT,
  photo_version    INTEGER NOT NULL DEFAULT 0,
  failed_logins    INTEGER NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columns added after the first release; keeps existing databases in step.
ALTER TABLE members ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS note    TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone2  TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  audience   TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'selected')),
  author_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcement_targets (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, member_id)
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, member_id)
);

-- One family-wide group chat. sender_id is kept nullable so history survives
-- when a member is removed.
CREATE TABLE IF NOT EXISTS chat_messages (
  id         SERIAL PRIMARY KEY,
  sender_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each member's read position in the group chat.
CREATE TABLE IF NOT EXISTS chat_reads (
  member_id    INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- One answer per member per event. adults/kids is the head count of that
-- member's household who are coming (zero when not coming).
CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('going', 'not_going')),
  adults     INTEGER NOT NULL DEFAULT 0 CHECK (adults BETWEEN 0 AND 50),
  kids       INTEGER NOT NULL DEFAULT 0 CHECK (kids BETWEEN 0 AND 50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, member_id)
);
