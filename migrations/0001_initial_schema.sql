-- Migration 0001 — initial schema (HANDOFF §5, verbatim) + meta seed.
-- Version-pointer design: card rows are tagged with a dataset version; reads
-- filter on meta.active_version; syncs load a new version then flip the pointer.

-- Single control table: version pointer + sync health.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per printing (card id + variant, e.g. normal vs. Championship-gold).
CREATE TABLE IF NOT EXISTS cards (
  version     INTEGER NOT NULL,               -- dataset version this row belongs to
  card_id     TEXT    NOT NULL,               -- e.g. 'EX1-066'
  variant     TEXT    NOT NULL DEFAULT '0',   -- distinguishes alt-arts / printings
  name        TEXT    NOT NULL,
  search_name TEXT    NOT NULL,               -- normalized lowercase, for LIKE search
  card_type   TEXT,                           -- Digimon / Tamer / Option / Digi-Egg
  color       TEXT,
  level       INTEGER,
  play_cost   INTEGER,
  dp          INTEGER,
  effect      TEXT,
  inherited   TEXT,                           -- inherited / security effect text
  set_name    TEXT,
  rarity      TEXT,
  image_url   TEXT,
  PRIMARY KEY (version, card_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_cards_search ON cards(version, search_name);

-- Seed the version pointer at 0 = "no dataset loaded yet". The first sync
-- loads under version 1 and flips the pointer (ROADMAP 1.5/1.6).
INSERT INTO meta (key, value) VALUES ('active_version', '0')
  ON CONFLICT (key) DO NOTHING;
