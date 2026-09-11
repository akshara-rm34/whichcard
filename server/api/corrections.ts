import { badRequest, unauthorized, userFromRequest } from '../lib/auth';
import { sql } from '../lib/db';

/**
 * Valid categories. A correction naming something outside this list would be
 * unusable by the app's scoring engine, so it's rejected at the door rather than
 * stored and silently ignored later.
 */
const CATEGORIES = new Set([
  'dining',
  'groceries',
  'gas',
  'drugstores',
  'hotels',
  'flights',
  'transit',
  'entertainment',
  'streaming',
  'travel',
]);

/**
 * GET /api/corrections?osmId=node/123
 * -> { osmId, category, votes, total }
 *
 * Returns the community's chosen category: whichever has the most votes. A null
 * category means nobody has corrected this merchant, and the app should keep its own
 * tag-derived guess.
 */
export async function GET(request: Request) {
  const osmId = new URL(request.url).searchParams.get('osmId');
  if (!osmId) return badRequest('osmId is required.');

  const rows = (await sql`
    SELECT category, COUNT(*)::int AS votes
    FROM corrections
    WHERE osm_id = ${osmId}
    GROUP BY category
    ORDER BY votes DESC, category ASC
  `) as { category: string; votes: number }[];

  const total = rows.reduce((sum, r) => sum + r.votes, 0);
  const winner = rows[0] ?? null;

  return Response.json({
    osmId,
    category: winner?.category ?? null,
    votes: winner?.votes ?? 0,
    total,
  });
}

/**
 * POST /api/corrections  { osmId, category }
 *
 * One vote per user per merchant. Resubmitting changes your existing vote rather
 * than adding another, which is what the primary key on (osm_id, user_id) enforces.
 */
export async function POST(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId) return unauthorized();

  let body: { osmId?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Body must be JSON.');
  }

  const { osmId, category } = body;
  if (!osmId) return badRequest('osmId is required.');
  if (!category || !CATEGORIES.has(category)) {
    return badRequest(`category must be one of: ${[...CATEGORIES].join(', ')}`);
  }

  await sql`
    INSERT INTO corrections (osm_id, user_id, category)
    VALUES (${osmId}, ${userId}, ${category})
    ON CONFLICT (osm_id, user_id) DO UPDATE SET category = EXCLUDED.category
  `;

  return Response.json({ osmId, category }, { status: 201 });
}
