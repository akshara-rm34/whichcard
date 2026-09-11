import { badRequest, unauthorized, userFromRequest } from '../lib/auth';
import { sql } from '../lib/db';

/** GET /api/wallet -> { cards: string[] } — the signed-in user's cards. */
export async function GET(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId) return unauthorized();

  const rows = (await sql`
    SELECT card_key FROM wallet_cards WHERE user_id = ${userId} ORDER BY added_at
  `) as { card_key: string }[];

  return Response.json({ cards: rows.map((r) => r.card_key) });
}

/** PUT /api/wallet  { cards: string[] } — replaces the wallet wholesale. */
export async function PUT(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId) return unauthorized();

  let body: { cards?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest('Body must be JSON.');
  }

  const cards = body.cards;
  if (!Array.isArray(cards) || cards.some((c) => typeof c !== 'string')) {
    return badRequest('cards must be an array of card keys.');
  }
  if (cards.length > 30) return badRequest('That is too many cards.');

  await sql`DELETE FROM wallet_cards WHERE user_id = ${userId}`;
  for (const key of cards as string[]) {
    await sql`
      INSERT INTO wallet_cards (user_id, card_key) VALUES (${userId}, ${key})
      ON CONFLICT DO NOTHING
    `;
  }

  return Response.json({ cards });
}
