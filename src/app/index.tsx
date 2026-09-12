import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ApiError,
  fetchCorrection,
  fetchWallet,
  getToken,
  logEvent,
  submitCorrection,
} from '@/lib/api';
import { categoryLabel, type SpendCategory } from '@/lib/categories';
import { DEFAULT_WALLET, rankWallet, type Recommendation } from '@/lib/cards';
import { notifyGoodMatch } from '@/lib/notify';
import { fetchNearbyMerchants, OverpassError, type Merchant } from '@/lib/overpass';
import { themeFor } from '@/lib/theme';

/** A nearby merchant earning at least this much is worth interrupting the user for. */
const NOTIFY_THRESHOLD = 3;

const CORRECTABLE: SpendCategory[] = [
  'dining',
  'groceries',
  'gas',
  'drugstores',
  'hotels',
  'entertainment',
  'transit',
  'travel',
];

type Status =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'searching' }
  | { kind: 'ready'; merchants: Merchant[] }
  | { kind: 'error'; message: string };

export default function HomeScreen() {
  const t = themeFor(useColorScheme());

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [wallet, setWallet] = useState<string[]>(DEFAULT_WALLET);
  const [signedIn, setSignedIn] = useState(false);
  /** Community category for the selected merchant, when one exists. */
  const [community, setCommunity] = useState<{ category: SpendCategory; votes: number } | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionNote, setCorrectionNote] = useState<string | null>(null);

  // Pull the saved wallet on mount. Signed out, the default wallet stands in so the
  // app is still useful before anyone makes an account.
  useEffect(() => {
    void (async () => {
      const token = await getToken();
      setSignedIn(!!token);
      if (!token) return;
      try {
        const cards = await fetchWallet();
        if (cards.length > 0) setWallet(cards);
      } catch {
        // Keep the default wallet if the server is unreachable.
      }
    })();
  }, []);

  const findNearby = useCallback(async () => {
    setSelected(null);
    setCommunity(null);
    setCorrectionNote(null);
    setStatus({ kind: 'locating' });

    const { status: permission } = await Location.requestForegroundPermissionsAsync();
    if (permission !== 'granted') {
      setStatus({
        kind: 'error',
        message:
          'Location permission denied. WhichCard needs your position to find nearby merchants.',
      });
      return;
    }

    let position: Location.LocationObject;
    try {
      position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    } catch {
      setStatus({ kind: 'error', message: 'Could not get a GPS fix. Try again outdoors.' });
      return;
    }

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    setCoords({ lat, lon });
    setStatus({ kind: 'searching' });

    try {
      const merchants = await fetchNearbyMerchants(lat, lon);
      setStatus({ kind: 'ready', merchants });
      logEvent({ eventType: 'search' });

      // Surface a standout nearby rate without making the user read the list.
      const best = merchants
        .map((m) => ({ merchant: m, top: rankWallet(wallet, m.category)[0] }))
        .filter((x) => x.top && x.top.isBonus && x.top.multiplier >= NOTIFY_THRESHOLD)
        .sort((a, b) => b.top.multiplier - a.top.multiplier)[0];

      if (best) {
        void notifyGoodMatch(best.merchant.name, best.top.multiplier, best.top.card.cardName);
      }
    } catch (err) {
      setStatus({
        kind: 'error',
        message:
          err instanceof OverpassError
            ? err.message
            : 'Something went wrong looking up nearby merchants.',
      });
    }
  }, [wallet]);

  /**
   * Selecting a merchant asks the backend whether the community has corrected its
   * category. A community answer beats our own tag mapping, because a person standing
   * in the shop knows better than an OSM tag does.
   */
  const choose = useCallback(
    async (merchant: Merchant) => {
      setSelected(merchant);
      setCommunity(null);
      setCorrectionNote(null);

      const top = rankWallet(wallet, merchant.category)[0];
      logEvent({
        eventType: 'lookup',
        osmId: merchant.id,
        category: merchant.category,
        cardKey: top?.card.cardKey,
      });

      try {
        const result = await fetchCorrection(merchant.id);
        if (result.category) {
          setCommunity({ category: result.category, votes: result.votes });
        }
      } catch {
        // A missing correction is not an error worth showing.
      }
    },
    [wallet],
  );

  const correct = useCallback(
    async (category: SpendCategory) => {
      if (!selected) return;
      setCorrectionNote(null);
      try {
        await submitCorrection(selected.id, category);
        setCommunity({ category, votes: (community?.votes ?? 0) + 1 });
        setCorrecting(false);
        setCorrectionNote('Thanks — everyone sees that now.');
        logEvent({ eventType: 'correction', osmId: selected.id, category });
      } catch (err) {
        setCorrectionNote(
          err instanceof ApiError && err.status === 401
            ? 'Sign in on the Wallet tab to suggest a category.'
            : 'Could not save that correction.',
        );
      }
    },
    [selected, community],
  );

  // The community's answer wins over our own tag-derived guess.
  const effectiveCategory = community?.category ?? selected?.category ?? null;
  const ranked: Recommendation[] = selected ? rankWallet(wallet, effectiveCategory) : [];
  const best = ranked[0];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>WhichCard</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          {coords
            ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)} · ${wallet.length} cards`
            : `best card, right here · ${wallet.length} cards${signedIn ? '' : ' (default)'}`}
        </Text>
      </View>

      <Pressable
        onPress={findNearby}
        disabled={status.kind === 'locating' || status.kind === 'searching'}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 },
        ]}>
        <Text style={styles.buttonText}>
          {status.kind === 'locating'
            ? 'Getting location…'
            : status.kind === 'searching'
              ? 'Searching nearby…'
              : "What's around me?"}
        </Text>
      </Pressable>

      {(status.kind === 'locating' || status.kind === 'searching') && (
        <ActivityIndicator style={styles.spinner} color={t.accent} />
      )}

      {status.kind === 'error' && (
        <View style={[styles.errorBox, { borderColor: t.error }]}>
          <Text style={[styles.errorText, { color: t.error }]}>{status.message}</Text>
        </View>
      )}

      {selected && best && (
        <View style={[styles.recBox, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.recLabel, { color: t.muted }]}>
            {selected.name} · {categoryLabel(effectiveCategory)}
            {community ? `  ·  community (${community.votes})` : ''}
          </Text>
          <Text style={[styles.recMultiplier, { color: t.accent }]}>{best.multiplier}x</Text>
          <Text style={[styles.recCard, { color: t.text }]}>{best.card.cardName}</Text>
          <Text style={[styles.recReason, { color: t.muted }]}>{best.reason}</Text>
          {best.capNote && (
            <Text style={[styles.recCap, { color: t.muted }]}>⚠︎ {best.capNote}</Text>
          )}

          {ranked.length > 1 && (
            <View style={[styles.runnerUps, { borderTopColor: t.border }]}>
              {ranked.slice(1, 4).map((r) => (
                <Text key={r.card.cardKey} style={[styles.runnerUp, { color: t.muted }]}>
                  {r.multiplier}x · {r.card.cardName}
                </Text>
              ))}
            </View>
          )}

          {correcting ? (
            <View style={styles.chipWrap}>
              {CORRECTABLE.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => correct(c)}
                  style={[styles.chip, { borderColor: t.border }]}>
                  <Text style={[styles.chipText, { color: t.text }]}>{categoryLabel(c)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable onPress={() => setCorrecting(true)}>
              <Text style={[styles.correctLink, { color: t.accent }]}>
                Wrong category? Suggest a fix
              </Text>
            </Pressable>
          )}

          {correctionNote && (
            <Text style={[styles.correctionNote, { color: t.muted }]}>{correctionNote}</Text>
          )}
        </View>
      )}

      {status.kind === 'ready' && (
        <FlatList
          style={styles.list}
          data={status.merchants}
          keyExtractor={(m) => m.id}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.muted }]}>
              No mapped merchants within 400m. OpenStreetMap coverage is patchy — try
              somewhere busier.
            </Text>
          }
          renderItem={({ item }) => {
            const isSelected = selected?.id === item.id;
            return (
              <Pressable
                onPress={() => choose(item)}
                style={[
                  styles.row,
                  { borderBottomColor: t.border },
                  isSelected && { backgroundColor: t.card },
                ]}>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowName, { color: t.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowCategory, { color: t.muted }]}>
                    {categoryLabel(item.category)}
                  </Text>
                </View>
                <Text style={[styles.rowDistance, { color: t.muted }]}>{item.distanceM}m</Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 12, paddingBottom: 20 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 2 },
  button: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  spinner: { marginTop: 20 },
  errorBox: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
  errorText: { fontSize: 14, lineHeight: 20 },
  recBox: { marginTop: 16, padding: 18, borderRadius: 16, borderWidth: 1 },
  recLabel: { fontSize: 13, fontWeight: '500' },
  recMultiplier: { fontSize: 44, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  recCard: { fontSize: 19, fontWeight: '600', marginTop: 2 },
  recReason: { fontSize: 14, marginTop: 6, lineHeight: 19 },
  recCap: { fontSize: 12, marginTop: 6 },
  runnerUps: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, gap: 4 },
  runnerUp: { fontSize: 13 },
  correctLink: { fontSize: 13, marginTop: 14, fontWeight: '500' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13 },
  correctionNote: { fontSize: 12, marginTop: 10, lineHeight: 17 },
  list: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '500' },
  rowCategory: { fontSize: 13, marginTop: 2 },
  rowDistance: { fontSize: 13, marginLeft: 12 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 30 },
});
