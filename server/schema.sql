-- WhichCard database schema
--
-- Run against the Neon Postgres instance provisioned through Vercel.

-- Accounts. Passwords are stored as scrypt hashes with a per-user random salt;
-- the plaintext never touches the database.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth tokens. Opaque random strings rather than JWTs, so that logging out can
-- actually revoke a session instead of merely asking the client to forget it.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- Which cards a user carries. One row per card so the set is easy to diff.
CREATE TABLE IF NOT EXISTS wallet_cards (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_key TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_key)
);

-- Crowdsourced merchant category corrections.
--
-- OSM tagging can't be fixed by a static mapping table: Target is
-- shop=department_store and maps to no bonus category, and a warehouse club's fuel
-- pump is amenity=fuel sitting inside shop=wholesale. When the app guesses wrong, a
-- user corrects it here and everyone else benefits.
--
-- One vote per user per merchant, enforced by the primary key — resubmitting
-- updates the existing vote rather than stuffing the ballot.
CREATE TABLE IF NOT EXISTS corrections (
  osm_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (osm_id, user_id)
);
CREATE INDEX IF NOT EXISTS corrections_osm_idx ON corrections(osm_id);

-- Usage analytics: what the app looked up and what it recommended.
-- user_id is nullable so lookups from signed-out users are still counted.
CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  osm_id       TEXT,
  category     TEXT,
  card_key     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_type_idx ON events(event_type, created_at DESC);
