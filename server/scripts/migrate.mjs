/**
 * Applies schema.sql to the database.
 *
 * Usage:  node scripts/migrate.mjs
 *
 * Reads DATABASE_URL from the environment, falling back to .env.local (which
 * `vercel env pull` writes). Every statement in schema.sql is IF NOT EXISTS, so
 * running this repeatedly is safe.
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const match = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
    if (match) return match[1];
  } catch {
    // fall through to the error below
  }
  throw new Error(
    'No DATABASE_URL. Run `vercel env pull .env.local` or set it in your environment.',
  );
}

const sql = neon(databaseUrl());
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

// Split on statement-terminating semicolons, dropping comment-only chunks.
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter(
    (s) => s && !s.split('\n').every((l) => l.trim().startsWith('--') || !l.trim()),
  );

for (const statement of statements) {
  const label = statement
    .split('\n')
    .find((l) => l.trim() && !l.trim().startsWith('--'))
    ?.slice(0, 62);
  await sql.query(statement);
  console.log('  ok:', label);
}

const tables = await sql.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name`,
);
console.log('\ntables in database:');
for (const t of tables) console.log('  -', t.table_name);
