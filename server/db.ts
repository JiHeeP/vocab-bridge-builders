import { Pool, types } from "pg";
import { loadConfig } from "./config";

types.setTypeParser(1700, (value) => Number(value));

const { databaseUrl } = loadConfig();

const databaseHost = (() => {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
})();

const shouldUseSsl =
  process.env.PGSSLMODE === "require" ||
  process.env.NODE_ENV === "production" ||
  (databaseHost !== "" &&
    databaseHost !== "localhost" &&
    databaseHost !== "127.0.0.1" &&
    databaseHost !== "::1");

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

const schemaSql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    grade_class TEXT NOT NULL DEFAULT '3-2',
    is_multicultural BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS learning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    vocab_session_id UUID,
    word_id INTEGER NOT NULL,
    word_text TEXT NOT NULL,
    set_index INTEGER NOT NULL,
    stage_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_score INTEGER NOT NULL DEFAULT 0,
    max_score INTEGER NOT NULL DEFAULT 8,
    error_rate NUMERIC(5, 1) NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'acquired' CHECK (tier IN ('acquired', 'developing', 'tier2', 'tier3')),
    completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS vocab_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('tool', 'content')),
    subject TEXT,
    session_no INTEGER NOT NULL CHECK (session_no > 0),
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vocab_sessions_subject_check CHECK (
      (category = 'tool' AND subject IS NULL) OR
      (category = 'content' AND subject IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS vocab_words (
    id INTEGER PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES vocab_sessions(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    meaning TEXT NOT NULL,
    examples JSONB NOT NULL DEFAULT '[]'::jsonb,
    related_words JSONB NOT NULL DEFAULT '[]'::jsonb,
    l4 JSONB NOT NULL DEFAULT '{}'::jsonb,
    l5 JSONB NOT NULL DEFAULT '{}'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'excel', 'bootstrap')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, word)
  );

  CREATE TABLE IF NOT EXISTS intervention_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    intervention_type TEXT NOT NULL DEFAULT 'tier2_small_group',
    focus_words JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_min INTEGER NOT NULL DEFAULT 0,
    before_error_rate NUMERIC(5, 1),
    after_error_rate NUMERIC(5, 1),
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS word_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL UNIQUE,
    image_url TEXT NOT NULL,
    photographer_name TEXT,
    photographer_url TEXT,
    unsplash_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE learning_records
  ADD COLUMN IF NOT EXISTS vocab_session_id UUID;

  CREATE INDEX IF NOT EXISTS idx_learning_records_student ON learning_records(student_id);
  CREATE INDEX IF NOT EXISTS idx_learning_records_created ON learning_records(created_at);
  CREATE INDEX IF NOT EXISTS idx_learning_records_word ON learning_records(word_id);
  CREATE INDEX IF NOT EXISTS idx_learning_records_session ON learning_records(vocab_session_id);
  CREATE INDEX IF NOT EXISTS idx_intervention_logs_student ON intervention_logs(student_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_sessions_unique ON vocab_sessions (category, COALESCE(subject, ''), session_no);
  CREATE INDEX IF NOT EXISTS idx_vocab_sessions_category ON vocab_sessions(category, subject, session_no);
  CREATE INDEX IF NOT EXISTS idx_vocab_words_session ON vocab_words(session_id, display_order, id);

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'learning_records_vocab_session_id_fkey'
    ) THEN
      ALTER TABLE learning_records
      ADD CONSTRAINT learning_records_vocab_session_id_fkey
      FOREIGN KEY (vocab_session_id) REFERENCES vocab_sessions(id) ON DELETE SET NULL;
    END IF;
  END $$;
`;

export async function initializeDatabase() {
  await pool.query(schemaSql);
}
