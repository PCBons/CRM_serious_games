import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// Return DATE as 'YYYY-MM-DD' (avoids timezone shifts), NUMERIC and BIGINT as numbers.
const PARSERS = {
  1082: v => v,
  1700: v => (v === null ? null : parseFloat(v)),
  20: v => (v === null ? null : parseInt(v, 10)),
};
for (const [oid, fn] of Object.entries(PARSERS)) pg.types.setTypeParser(Number(oid), fn);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  website TEXT,
  city TEXT,
  country TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  linkedin TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  owner_id INT REFERENCES users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'lead',
  max_stage_index INT NOT NULL DEFAULT 0,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  product TEXT,
  source TEXT,
  expected_close DATE,
  lost_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  body TEXT,
  deal_id INT REFERENCES deals(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  due_date DATE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  deal_id INT REFERENCES deals(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_org ON activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(done, due_date);
`;

let run;

// Uses PostgreSQL when DATABASE_URL is set (Railway); otherwise an embedded
// Postgres (PGlite) stored in ./.data so the app runs locally without setup.
export async function initDb() {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    run = (sql, params) => pool.query(sql, params);
    await pool.query(SCHEMA);
    console.log('Database: PostgreSQL');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || './.data/pglite';
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const db = new PGlite(dir, { parsers: PARSERS });
    run = (sql, params) => db.query(sql, params);
    await db.exec(SCHEMA);
    console.log(`Database: embedded PGlite (${dir}) — set DATABASE_URL for production`);
  }
}

export const q = async (sql, params = []) => (await run(sql, params)).rows;
export const q1 = async (sql, params = []) => (await q(sql, params))[0] || null;
