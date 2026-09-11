import { badRequest, createSession, verifyPassword } from '../../lib/auth';
import { sql } from '../../lib/db';

/** POST /api/auth/login  { email, password } -> { token, userId } */
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Body must be JSON.');
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) return badRequest('Email and password are required.');

  const rows = (await sql`
    SELECT id, password_hash, password_salt FROM users WHERE email = ${email}
  `) as { id: string; password_hash: string; password_salt: string }[];

  const user = rows[0];

  // Same response whether the email is unknown or the password is wrong, so the
  // endpoint can't be used to enumerate which emails have accounts.
  const invalid = Response.json({ error: 'Incorrect email or password.' }, { status: 401 });
  if (!user) return invalid;

  const ok = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!ok) return invalid;

  const token = await createSession(user.id);
  return Response.json({ token, userId: user.id });
}
