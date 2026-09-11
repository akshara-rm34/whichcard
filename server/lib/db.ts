import { neon } from '@neondatabase/serverless';

/**
 * Postgres connection.
 *
 * Vercel's Neon integration injects DATABASE_URL. The driver speaks HTTP rather than
 * raw TCP, which is what makes it usable from serverless functions — there's no
 * connection pool to exhaust across cold starts.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Provision Neon through the Vercel dashboard.');
}

export const sql = neon(connectionString);
