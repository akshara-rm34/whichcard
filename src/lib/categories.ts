/**
 * Maps OpenStreetMap tags onto the spend categories used by data/cards.json.
 *
 * This mapping is deliberately conservative: if we can't confidently place a
 * merchant in a bonus category, we return null and the scoring engine falls back
 * to each card's base earn rate. Guessing wrong is worse than not guessing —
 * telling someone to pull out a 4x dining card at a hardware store costs them
 * real points.
 *
 * OSM tagging is inconsistent in ways no static table can fix (Target is shop=department_store and maps to nothing; 
 * a Costco fuel pump is amenity=fuel sitting inside shop=wholesale). That's what the crowdsourced corrections
 * feature is for — see issue #9.
 */

export type SpendCategory =
  | 'dining'
  | 'groceries'
  | 'gas'
  | 'drugstores'
  | 'hotels'
  | 'flights'
  | 'transit'
  | 'entertainment'
  | 'streaming'
  | 'travel';

/** amenity=<value> → category */
const AMENITY: Record<string, SpendCategory> = {
  restaurant: 'dining',
  cafe: 'dining',
  fast_food: 'dining',
  food_court: 'dining',
  bar: 'dining',
  pub: 'dining',
  ice_cream: 'dining',
  biergarten: 'dining',
  fuel: 'gas',
  charging_station: 'gas',
  pharmacy: 'drugstores',
  cinema: 'entertainment',
  theatre: 'entertainment',
  nightclub: 'entertainment',
  bus_station: 'transit',
  ferry_terminal: 'transit',
};

/** shop=<value> → category */
const SHOP: Record<string, SpendCategory> = {
  supermarket: 'groceries',
  greengrocer: 'groceries',
  butcher: 'groceries',
  bakery: 'groceries',
  deli: 'groceries',
  convenience: 'groceries',
  farm: 'groceries',
  chemist: 'drugstores',
  gas: 'gas',
  coffee: 'dining',
};

/** tourism=<value> → category */
const TOURISM: Record<string, SpendCategory> = {
  hotel: 'hotels',
  motel: 'hotels',
  hostel: 'hotels',
  guest_house: 'hotels',
};

/** public_transport / railway / aeroway → category */
const TRANSPORT: Record<string, SpendCategory> = {
  station: 'transit',
  subway_entrance: 'transit',
  tram_stop: 'transit',
  aerodrome: 'flights',
  terminal: 'flights',
};

export type OsmTags = Record<string, string>;

/**
 * Returns the spend category for a set of OSM tags, or null when we can't place it.
 *
 * Order matters: amenity wins over shop, because a fuel station with an attached
 * convenience store (amenity=fuel + shop=convenience) should score as gas, which is
 * how the transaction will actually be coded.
 */
export function categoryFromTags(tags: OsmTags | undefined): SpendCategory | null {
  if (!tags) return null;

  if (tags.amenity && AMENITY[tags.amenity]) return AMENITY[tags.amenity];
  if (tags.shop && SHOP[tags.shop]) return SHOP[tags.shop];
  if (tags.tourism && TOURISM[tags.tourism]) return TOURISM[tags.tourism];
  if (tags.railway && TRANSPORT[tags.railway]) return TRANSPORT[tags.railway];
  if (tags.aeroway && TRANSPORT[tags.aeroway]) return TRANSPORT[tags.aeroway];
  if (tags.public_transport && TRANSPORT[tags.public_transport]) {
    return TRANSPORT[tags.public_transport];
  }

  return null;
}

/** Human-readable label for a category, for display. */
export function categoryLabel(category: SpendCategory | null): string {
  if (!category) return 'no bonus category';
  const labels: Record<SpendCategory, string> = {
    dining: 'Dining',
    groceries: 'Groceries',
    gas: 'Gas',
    drugstores: 'Drugstores',
    hotels: 'Hotels',
    flights: 'Flights',
    transit: 'Transit',
    entertainment: 'Entertainment',
    streaming: 'Streaming',
    travel: 'Travel',
  };
  return labels[category];
}
