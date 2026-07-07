-- Migration 0002 — banned/restricted status on cards (chunk 4.6).
-- Nullable TEXT: NULL = Unrestricted (the overwhelmingly common case), so
-- display logic stays an only-when-present truthy check. Non-null values are
-- the upstream English restriction verbatim: 'Banned', 'Restricted to 1',
-- 'Choice Restriction', 'Not released' (survey 2026-07-07, DECISIONS.md).
-- Existing rows read NULL until the next sync populates the column — a brief
-- window where restricted cards show no flag, same as before this chunk.
ALTER TABLE cards ADD COLUMN restriction TEXT;
