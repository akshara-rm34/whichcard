# WhichCard

A location-aware credit-card rewards picker for iOS/Android, built with Expo + React Native.

Point it at where you're standing and it tells you which card in your wallet earns the
most there.

**How it works:** the app reads your GPS position → queries the
[Overpass API](https://overpass-api.de/) (OpenStreetMap) for nearby merchants → maps
the merchant's OSM tag to a spend category (`dining`, `groceries`, `gas`, ...) → scores
that category against your wallet using a table of card earning rates → tells you which
card to pull out.

Because OSM merchant tagging is inconsistent, the app also lets users **correct** a
merchant's category, and those corrections are shared with everyone.

---

## Status

| Piece | State |
|---|---|
| Expo app running on a physical device | ✅ |
| GPS → nearby merchants (Overpass) | in progress |
| Card scoring against wallet | in progress |
| Backend REST API + database | ✅ deployed |
| Accounts / auth | ✅ on the backend |
| Crowdsourced category corrections | planned |
| Local notification on a high-multiplier match | planned |

## Repo layout

```
/            Expo React Native app (expo-router, TypeScript)
  src/app/     screens (file-based routing)
  src/lib/     card scoring, Overpass client, category mapping
  data/        card earning-rate table
/server/     backend REST API (deployed separately)
DEVLOG.md    running log of what broke and how it was fixed
```

## Running the app

Requires Node 20+ and a phone with [Expo Go](https://expo.dev/go) installed.

```bash
git clone https://github.com/akshara-rm34/whichcard.git
cd whichcard
npm install
npx expo start
```

Then scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

**If the app never connects:** you're probably on a network with client isolation
(common on campus/guest wifi — check whether your machine's IP is in the `100.64.0.0/10`
CGNAT range). Use a tunnel instead, which relays through a public server and works
regardless:

```bash
npx expo start --tunnel
```

## Backend

Live at **https://whichcard-api.vercel.app** — try
[`/api/health`](https://whichcard-api.vercel.app/api/health).

Vercel serverless functions + Neon Postgres, both free tier. Accounts, private
wallets, crowdsourced merchant category corrections, and usage analytics.
Full endpoint list and setup in [`server/README.md`](server/README.md).

## Credits

Card earning-rate data (`data/cards.json`) is hand-curated from public issuer
information, originally compiled for a separate credit-card rewards project.
Field names mirror the Rewards Credit Card API schema.
