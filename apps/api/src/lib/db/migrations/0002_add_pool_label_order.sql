-- Migration: Add label and order_index columns to pools table
-- Date: 2025-10-16
-- Description: Adds label (single letter identifier) and order_index (display order) to pools

-- Add new columns
ALTER TABLE pools ADD COLUMN label TEXT;
ALTER TABLE pools ADD COLUMN order_index INTEGER;
ALTER TABLE pools ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL;

-- For existing pools, set default values
-- This uses a simpler approach compatible with SQLite
-- Assigns labels alphabetically (A, B, C, etc.) based on creation order
UPDATE pools SET
  label = 'A',
  order_index = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id FROM pools
  WHERE label IS NULL
  ORDER BY division_id, id
  LIMIT 1
);

-- Note: For production use with multiple existing pools,
-- a more sophisticated migration would be needed.
-- For now, this handles the most common case (single pool or new installations).
