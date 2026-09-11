import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { sql } from './db';

const scryptAsync = promisify(scrypt);

const SESSION_DAYS = 30;

/**
 * Password hashing.
 *
 * scrypt with a per-user random salt. Deliberately not a bare SHA-256: a fast hash
 * makes an offline attack on a leaked table cheap, which is the whole thing password
 * hashing exists to prevent.
 */
export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const useSalt = salt ?? randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, useSalt, 64)) as Buffer;
  return { hash: derived.toString('hex'), salt: useSalt };
}

/** Constant-time comparison, so response timing doesn't leak how much of the hash matched. */
export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function newId(): string {
  return randomBytes(12).toString('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (${token}, ${userId}, ${expires.toISOString()})
  `;
  return token;
}

/**
 * Resolves an Authorization: Bearer <token> header to a user id.
 * Returns null for a missing, unknown, or expired token — callers treat all three
 * the same way, with a 401.
 */
export async function userFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const rows = (await sql`
    SELECT user_id FROM sessions
    WHERE token = ${token} AND expires_at > now()
  `) as { user_id: string }[];

  return rows[0]?.user_id ?? null;
}

export function unauthorized(): Response {
  return Response.json({ error: 'Not signed in.' }, { status: 401 });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
