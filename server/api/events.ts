import { badRequest, userFromRequest } from '../lib/auth';
import { sql } from '../lib/db';

/**
 * POST /api/events  { eventType, osmId?, category?, cardKey? }
 *
 * Usage analytics: which merchants get looked up, which categories they resolve to,
 * which cards end up recommended. Auth is optional — a signed-out lookup still counts,
 * it just isn't attributed to anyone.
 */
export async function POST(request: Request) {
  const userId = await userFromRequest(request);

  let body: {
    eventType?: string;
    osmId?: string;
    category?: string;
    cardKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('Body must be JSON.');
  }

  const eventType = body.eventType?.trim();
  if (!eventType) return badRequest('eventType is required.');

  await sql`
    INSERT INTO events (user_id, event_type, osm_id, category, card_key)
    VALUES (
      ${userId},
      ${eventType},
      ${body.osmId ?? null},
      ${body.category ?? null},
      ${body.cardKey ?? null}
    )
  `;

  return Response.json({ ok: true }, { status: 201 });
}

/**
 * GET /api/events -> aggregate counts.
 *
 * Deliberately returns only aggregates, never individual rows, so the endpoint can
 * stay public without exposing anyone's lookup history.
 */
export async function GET() {
  const byType = (await sql`
    SELECT event_type, COUNT(*)::int AS count
    FROM events GROUP BY event_type ORDER BY count DESC
  `) as { event_type: string; count: number }[];

  const topCards = (await sql`
    SELECT card_key, COUNT(*)::int AS count
    FROM events WHERE card_key IS NOT NULL
    GROUP BY card_key ORDER BY count DESC LIMIT 10
  `) as { card_key: string; count: number }[];

  return Response.json({ byType, topCards });
}
