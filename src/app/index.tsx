import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
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

import { categoryLabel } from '@/lib/categories';
import { DEFAULT_WALLET, rankWallet, type Recommendation } from '@/lib/cards';
import { fetchNearbyMerchants, OverpassError, type Merchant } from '@/lib/overpass';

type Status =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'searching' }
  | { kind: 'ready'; merchants: Merchant[] }
  | { kind: 'error'; message: string };

export default function HomeScreen() {
  const scheme = useColorScheme();
  const t = scheme === 'dark' ? darkTheme : lightTheme;

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selected, setSelected] = useState<Merchant | null>(null);

  const findNearby = useCallback(async () => {
    setSelected(null);
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
    } catch (err) {
      setStatus({
        kind: 'error',
        message:
          err instanceof OverpassError
            ? err.message
            : 'Something went wrong looking up nearby merchants.',
      });
    }
  }, []);

  const ranked: Recommendation[] = selected
    ? rankWallet(DEFAULT_WALLET, selected.category)
    : [];
  const best = ranked[0];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>WhichCard</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          {coords
            ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`
            : 'best card, right here'}
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
            {selected.name} · {categoryLabel(selected.category)}
          </Text>
          <Text style={[styles.recMultiplier, { color: t.accent }]}>
            {best.multiplier}x
          </Text>
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
        </View>
      )}

      {status.kind === 'ready' && (
        <FlatList
          style={styles.list}
          data={status.merchants}
          keyExtractor={(m) => m.id}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.muted }]}>
              No mapped merchants within 400m. OpenStreetMap coverage is patchy —
              try somewhere busier.
            </Text>
          }
          renderItem={({ item }) => {
            const isSelected = selected?.id === item.id;
            return (
              <Pressable
                onPress={() => setSelected(item)}
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
                <Text style={[styles.rowDistance, { color: t.muted }]}>
                  {item.distanceM}m
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const lightTheme = {
  bg: '#FFFFFF',
  text: '#11181C',
  muted: '#687076',
  accent: '#0A7EA4',
  card: '#F1F5F7',
  border: '#E1E6E9',
  error: '#C0392B',
};

const darkTheme = {
  bg: '#151718',
  text: '#ECEDEE',
  muted: '#9BA1A6',
  accent: '#4FC3E8',
  card: '#22262A',
  border: '#2E3338',
  error: '#FF7C6E',
};

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
