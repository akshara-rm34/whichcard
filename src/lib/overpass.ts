import { categoryFromTags, type OsmTags, type SpendCategory } from './categories';

/**
 * Client for the Overpass API (OpenStreetMap).
 *
 * Free and keyless, which is why we use it — but it's a volunteer-run service that
 * is genuinely flaky: 429s when busy, 504s on slow queries, and occasional HTML
 * error pages served with a 200. Every call here assumes it might fail.
 */

/**
 * Attempts, in order, each with its own timeout.
 *
 * The main instance is fast when healthy (~1s) but returns transient 504s under load,
 * so it gets an immediate second try before we give up on it. The kumi mirror is last
 * and on a short leash: it has been observed accepting a connection and then never
 * responding at all, and a fallback that hangs is worse than no fallback — it turns a
 * fast failure into a 40-second wait and then reports the mirror's error instead of
 * the real one.
 */
const ATTEMPTS: { endpoint: string; timeoutMs: number }[] = [
  { endpoint: 'https://overpass-api.de/api/interpreter', timeoutMs: 12_000 },
  { endpoint: 'https://overpass-api.de/api/interpreter', timeoutMs: 12_000 },
  { endpoint: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 6_000 },
];
const SEARCH_RADIUS_M = 400;

export type Merchant = {
  id: string;
  name: string;
  tags: OsmTags;
  category: SpendCategory | null;
  lat: number;
  lon: number;
  distanceM: number;
};

export class OverpassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassError';
  }
}

/** Great-circle distance in metres. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildQuery(lat: number, lon: number): string {
  const around = `around:${SEARCH_RADIUS_M},${lat},${lon}`;
  // nwr = nodes, ways and relations. Many real merchants are mapped as building
  // outlines (ways), not points, so node-only queries miss a lot of them.
  // `out center` gives ways/relations a representative coordinate.
  return `[out:json][timeout:20];
(
  nwr(${around})["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream|biergarten|fuel|charging_station|pharmacy|cinema|theatre|nightclub|bus_station|ferry_terminal)$"];
  nwr(${around})["shop"];
  nwr(${around})["tourism"~"^(hotel|motel|hostel|guest_house)$"];
);
out center tags 60;`;
}

/**
 * Fetches merchants near a coordinate, nearest first.
 *
 * Unnamed features are dropped — an unnamed POI is useless to show in a picker,
 * and OSM has a lot of them.
 */
/** One attempt against one endpoint. Throws OverpassError on any failure. */
async function requestOnce(
  endpoint: string,
  query: string,
  timeoutMs: number,
): Promise<{ elements?: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
  } catch (err) {
    // React Native does not always surface an aborted fetch as name === 'AbortError',
    // so the signal itself is the reliable indicator that we timed out rather than
    // failed to connect. Getting this wrong reports a timeout as "could not reach",
    // which sends you looking for a network problem that isn't there.
    if (controller.signal.aborted) {
      throw new OverpassError(`Overpass timed out after ${timeoutMs / 1000}s.`);
    }
    throw new OverpassError('Could not reach Overpass.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new OverpassError('Overpass is rate-limiting us.');
  }
  if (!response.ok) {
    throw new OverpassError(`Overpass returned ${response.status}.`);
  }

  // Overpass serves error pages as XML/HTML with a non-JSON body, sometimes even
  // with a 200 status, so parsing has to be defensive rather than trusting the code.
  try {
    return await response.json();
  } catch {
    throw new OverpassError('Overpass returned something that was not JSON.');
  }
}

/**
 * Fetches merchants near a coordinate, nearest first.
 *
 * Tries each endpoint in turn; a transient failure on the primary falls through to
 * the mirror rather than surfacing to the user. Unnamed features are dropped — an
 * unnamed POI is useless in a picker, and OSM has plenty of them.
 */
export async function fetchNearbyMerchants(
  lat: number,
  lon: number,
): Promise<Merchant[]> {
  const query = buildQuery(lat, lon);
  let firstError: OverpassError | null = null;
  let payload: { elements?: unknown } | null = null;

  for (const [index, attempt] of ATTEMPTS.entries()) {
    const startedAt = Date.now();
    try {
      payload = await requestOnce(attempt.endpoint, query, attempt.timeoutMs);
      console.log(
        `[overpass] attempt ${index + 1} ok in ${Date.now() - startedAt}ms (${attempt.endpoint})`,
      );
      break;
    } catch (err) {
      const failure =
        err instanceof OverpassError ? err : new OverpassError('Overpass failed.');
      console.warn(
        `[overpass] attempt ${index + 1} failed after ${Date.now() - startedAt}ms ` +
          `(${attempt.endpoint}): ${failure.message}`,
      );
      // Report the first failure, not the last: the primary endpoint's error is the
      // informative one, and a flaky mirror shouldn't get to relabel it.
      firstError ??= failure;
    }
  }

  if (!payload) {
    throw firstError ?? new OverpassError('Overpass failed.');
  }

  const elements = Array.isArray(payload.elements) ? payload.elements : [];

  return elements
    .map((raw) => {
      const el = raw as {
        type?: string;
        id?: number;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: OsmTags;
      };
      const position = el.center ?? { lat: el.lat, lon: el.lon };
      if (typeof position.lat !== 'number' || typeof position.lon !== 'number') {
        return null;
      }
      const name = el.tags?.name;
      if (!name) return null;

      return {
        id: `${el.type ?? 'node'}/${el.id ?? 0}`,
        name,
        tags: el.tags ?? {},
        category: categoryFromTags(el.tags),
        lat: position.lat,
        lon: position.lon,
        distanceM: Math.round(haversineM(lat, lon, position.lat, position.lon)),
      } satisfies Merchant;
    })
    .filter((m): m is Merchant => m !== null)
    .sort((a, b) => a.distanceM - b.distanceM);
}
