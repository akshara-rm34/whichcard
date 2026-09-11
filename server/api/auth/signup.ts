import { badRequest, createSession, hashPassword, newId } from '../../lib/auth';
import { sql } from '../../lib/db';

/** POST /api/auth/signup  { email, password } -> { token, userId } */
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Body must be JSON.');
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !email.includes('@')) return badRequest('A valid email is required.');
  if (!password || password.length < 8) {
    return badRequest('Password must be at least 8 characters.');
  }

  const existing = (await sql`SELECT id FROM users WHERE email = ${email}`) as { id: string }[];
  if (existing.length > 0) {
    return Response.json({ error: 'That email is already registered.' }, { status: 409 });
  }

  const { hash, salt } = await hashPassword(password);
  const id = newId();

  await sql`
    INSERT INTO users (id, email, password_hash, password_salt)
    VALUES (${id}, ${email}, ${hash}, ${salt})
  `;

  const token = await createSession(id);
  return Response.json({ token, userId: id }, { status: 201 });
}
