CREATE TABLE IF NOT EXISTS accounts (
  account_id UUID PRIMARY KEY,
  device_id  TEXT NOT NULL UNIQUE,
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  account_id UUID PRIMARY KEY REFERENCES accounts(account_id),
  name       TEXT NOT NULL,
  mmr        INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  match_id     TEXT PRIMARY KEY,
  data_version TEXT NOT NULL,
  ended_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id   TEXT NOT NULL REFERENCES matches(match_id),
  seat       INTEGER NOT NULL,
  account_id UUID REFERENCES accounts(account_id), -- NULL for bots
  placement  INTEGER NOT NULL,
  mmr_before INTEGER,
  mmr_after  INTEGER,
  PRIMARY KEY (match_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_profiles_mmr ON profiles (mmr DESC);
CREATE INDEX IF NOT EXISTS idx_match_players_account ON match_players (account_id);
