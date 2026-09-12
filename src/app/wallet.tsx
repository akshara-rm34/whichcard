import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, fetchWallet, getToken, saveWallet, signIn, signOut, signUp } from '@/lib/api';
import { ALL_CARDS } from '@/lib/cards';
import { themeFor } from '@/lib/theme';

/**
 * Account + wallet screen.
 *
 * Signed out, this is a sign-in form. Signed in, it's the card picker, and the
 * selection is stored server-side so it follows the user rather than the device.
 */
export default function WalletScreen() {
  const t = themeFor(useColorScheme());

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadWallet = useCallback(async () => {
    try {
      const cards = await fetchWallet();
      setSelected(new Set(cards));
    } catch {
      setSelected(new Set());
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      setSignedIn(!!token);
      if (token) await loadWallet();
    })();
  }, [loadWallet]);

  const authenticate = useCallback(
    async (mode: 'in' | 'up') => {
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        if (mode === 'up') await signUp(email.trim(), password);
        else await signIn(email.trim(), password);
        setSignedIn(true);
        setPassword('');
        await loadWallet();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [email, password, loadWallet],
  );

  const toggleCard = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const persist = useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await saveWallet([...selected]);
      setNotice('Wallet saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your wallet.');
    } finally {
      setBusy(false);
    }
  }, [selected]);

  const leave = useCallback(async () => {
    await signOut();
    setSignedIn(false);
    setSelected(new Set());
    setNotice(null);
  }, []);

  if (signedIn === null) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: t.text }]}>Your wallet</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>
            Sign in to save which cards you carry, so recommendations follow you between
            devices.
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="email"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="password (8+ characters)"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            secureTextEntry
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
          />

          {error && <Text style={[styles.error, { color: t.error }]}>{error}</Text>}

          <Pressable
            onPress={() => authenticate('in')}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: t.accent, opacity: pressed || busy ? 0.7 : 1 },
            ]}>
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>

          <Pressable
            onPress={() => authenticate('up')}
            disabled={busy}
            style={({ pressed }) => [
              styles.buttonSecondary,
              { borderColor: t.border, opacity: pressed || busy ? 0.7 : 1 },
            ]}>
            <Text style={[styles.buttonSecondaryText, { color: t.text }]}>
              Create an account
            </Text>
          </Pressable>

          {busy && <ActivityIndicator style={styles.spinner} color={t.accent} />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: t.text }]}>Your wallet</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          {selected.size} of {ALL_CARDS.length} cards selected
        </Text>

        {ALL_CARDS.map((card) => {
          const isOn = selected.has(card.cardKey);
          return (
            <Pressable
              key={card.cardKey}
              onPress={() => toggleCard(card.cardKey)}
              style={[
                styles.cardRow,
                { borderColor: isOn ? t.accent : t.border, backgroundColor: isOn ? t.card : 'transparent' },
              ]}>
              <View style={styles.cardMain}>
                <Text style={[styles.cardName, { color: t.text }]}>{card.cardName}</Text>
                <Text style={[styles.cardMeta, { color: t.muted }]}>
                  {card.annualFee === 0 ? 'No annual fee' : `$${card.annualFee}/yr`}
                  {card.spendBonusCategory?.length
                    ? ` · ${card.spendBonusCategory.length} bonus categories`
                    : ''}
                </Text>
              </View>
              <Text style={[styles.check, { color: isOn ? t.accent : t.border }]}>
                {isOn ? '✓' : '○'}
              </Text>
            </Pressable>
          );
        })}

        {error && <Text style={[styles.error, { color: t.error }]}>{error}</Text>}
        {notice && <Text style={[styles.error, { color: t.success }]}>{notice}</Text>}

        <Pressable
          onPress={persist}
          disabled={busy}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: t.accent, opacity: pressed || busy ? 0.7 : 1 },
          ]}>
          <Text style={styles.buttonText}>Save wallet</Text>
        </Pressable>
        {busy && <ActivityIndicator style={styles.spinner} color={t.accent} />}

        <Pressable onPress={leave} style={styles.signOutRow}>
          <Text style={[styles.signOut, { color: t.muted }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  // Sign out lives at the bottom of the scroll view: the top-right corner is where
  // Expo Go floats its dev-menu button, which covered anything placed there.
  signOutRow: { alignItems: 'center', paddingTop: 28, paddingBottom: 8 },
  signOut: { fontSize: 15, fontWeight: '500' },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 20, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 10 },
  button: { paddingVertical: 15, borderRadius: 13, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonSecondary: { paddingVertical: 15, borderRadius: 13, alignItems: 'center', marginTop: 10, borderWidth: 1 },
  buttonSecondaryText: { fontSize: 16, fontWeight: '500' },
  error: { fontSize: 14, marginTop: 12, lineHeight: 19 },
  spinner: { marginTop: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardMain: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '500' },
  cardMeta: { fontSize: 12, marginTop: 3 },
  check: { fontSize: 20, marginLeft: 12 },
});
