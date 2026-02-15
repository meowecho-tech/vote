-- Add contest/race model under elections.
-- This enables multi-district / multi-contest elections while keeping a default contest
-- to preserve the existing "one election = one ballot" experience.

CREATE TABLE IF NOT EXISTS contests (
  id UUID PRIMARY KEY,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  max_selections INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contests ADD COLUMN IF NOT EXISTS max_selections INT;
UPDATE contests SET max_selections = 1 WHERE max_selections IS NULL;
ALTER TABLE contests ALTER COLUMN max_selections SET DEFAULT 1;
ALTER TABLE contests ALTER COLUMN max_selections SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contests_max_selections_check'
  ) THEN
    ALTER TABLE contests ADD CONSTRAINT contests_max_selections_check CHECK (max_selections >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contests_election ON contests(election_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'uniq_contests_default_per_election'
  ) THEN
    CREATE UNIQUE INDEX uniq_contests_default_per_election
      ON contests(election_id)
      WHERE is_default = true;
  END IF;
END $$;

-- Add contest_id columns to existing tables.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS contest_id UUID;
ALTER TABLE voter_rolls ADD COLUMN IF NOT EXISTS contest_id UUID;
ALTER TABLE vote_receipts ADD COLUMN IF NOT EXISTS contest_id UUID;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS contest_id UUID;

-- Create a default contest for all existing elections (idempotent).
INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
SELECT uuid_generate_v4(), e.id, e.title, e.description, 1, '{}'::jsonb, true
FROM elections e
WHERE NOT EXISTS (
  SELECT 1 FROM contests c WHERE c.election_id = e.id AND c.is_default = true
);

-- Backfill contest_id using each election's default contest.
UPDATE candidates c
SET contest_id = dc.id
FROM contests dc
WHERE c.contest_id IS NULL
  AND dc.election_id = c.election_id
  AND dc.is_default = true;

UPDATE voter_rolls vr
SET contest_id = dc.id
FROM contests dc
WHERE vr.contest_id IS NULL
  AND dc.election_id = vr.election_id
  AND dc.is_default = true;

UPDATE vote_receipts r
SET contest_id = dc.id
FROM contests dc
WHERE r.contest_id IS NULL
  AND dc.election_id = r.election_id
  AND dc.is_default = true;

UPDATE votes v
SET contest_id = r.contest_id
FROM vote_receipts r
WHERE v.contest_id IS NULL
  AND r.id = v.receipt_id;

-- Foreign keys for contest_id columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidates_contest_id_fkey'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_contest_id_fkey
      FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voter_rolls_contest_id_fkey'
  ) THEN
    ALTER TABLE voter_rolls
      ADD CONSTRAINT voter_rolls_contest_id_fkey
      FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vote_receipts_contest_id_fkey'
  ) THEN
    ALTER TABLE vote_receipts
      ADD CONSTRAINT vote_receipts_contest_id_fkey
      FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_contest_id_fkey'
  ) THEN
    ALTER TABLE votes
      ADD CONSTRAINT votes_contest_id_fkey
      FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;
  END IF;
END $$;

-- contest_id is mandatory after backfill.
ALTER TABLE candidates ALTER COLUMN contest_id SET NOT NULL;
ALTER TABLE voter_rolls ALTER COLUMN contest_id SET NOT NULL;
ALTER TABLE vote_receipts ALTER COLUMN contest_id SET NOT NULL;
ALTER TABLE votes ALTER COLUMN contest_id SET NOT NULL;

-- Update uniqueness constraints to be contest-scoped (allow a voter to be eligible for multiple contests in one election).
ALTER TABLE voter_rolls DROP CONSTRAINT IF EXISTS voter_rolls_election_id_user_id_key;
ALTER TABLE vote_receipts DROP CONSTRAINT IF EXISTS vote_receipts_election_id_voter_id_key;
ALTER TABLE vote_receipts DROP CONSTRAINT IF EXISTS vote_receipts_election_id_voter_id_idempotency_key_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voter_rolls_contest_id_user_id_key'
  ) THEN
    ALTER TABLE voter_rolls
      ADD CONSTRAINT voter_rolls_contest_id_user_id_key UNIQUE (contest_id, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vote_receipts_contest_id_voter_id_key'
  ) THEN
    ALTER TABLE vote_receipts
      ADD CONSTRAINT vote_receipts_contest_id_voter_id_key UNIQUE (contest_id, voter_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vote_receipts_contest_id_voter_id_idempotency_key_key'
  ) THEN
    ALTER TABLE vote_receipts
      ADD CONSTRAINT vote_receipts_contest_id_voter_id_idempotency_key_key
      UNIQUE (contest_id, voter_id, idempotency_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidates_contest ON candidates(contest_id);
CREATE INDEX IF NOT EXISTS idx_voter_rolls_contest ON voter_rolls(contest_id);
CREATE INDEX IF NOT EXISTS idx_vote_receipts_contest ON vote_receipts(contest_id);
CREATE INDEX IF NOT EXISTS idx_votes_contest ON votes(contest_id);

