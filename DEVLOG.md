# WhichCard — Development Log

Running log of what was built, what broke, and how it was fixed.
Kept as evidence for the assignment writeup.

---

## 2026-09-11 — Environment + sample app on device

**Goal:** get the stock Expo sample app running on a physical iPhone (assignment bullet #2).

- Installed Expo SDK 57 / `expo-router` template at `~/hereapp`. Node 26.8.2.
- Installed **Expo Go** on iPhone, connected via `exp://100.70.92.116:8081`.
- Stock template (Home + Explore tabs) rendered on the physical device. Screenshotted.

### Problem 1 — CGNAT wifi, anticipated LAN failure
Laptop's wifi address was `100.70.92.116`, inside the carrier-grade NAT range
`100.64.0.0/10`. Large managed/campus wifi networks that hand out CGNAT addresses
frequently also enable **client isolation**, which blocks phone → laptop connections
and is a classic cause of "Expo Go spins forever."

*Outcome:* it worked anyway — this network does not isolate clients. Fallback if it
ever does: `npx expo start --tunnel`, which relays through a public tunnel and is
immune to LAN isolation (slower reloads).

### Problem 2 — Fast Refresh not firing
Edited `src/app/index.tsx` (changed the hero title). The change did **not** appear on
the phone automatically; it required shake → Reload.

Diagnosis: the bundle was being served fine, so the HTTP path was healthy — but the
**HMR websocket** was dead. The dev server process had been running for ~14 hours
straight; the socket had gone stale while the HTTP server kept answering.

*Fix:* killed the stale process, restarted the dev server.

### Problem 3 — self-inflicted: `CI=1` disables watch mode
On the restart, the server was launched with `CI=1` (to suppress an interactive
port-conflict prompt). Metro responded:

> Metro is running in CI mode, reloads are disabled. Remove CI=true to enable watch mode.

So the "fix" for Problem 2 had silently reintroduced the same symptom by a different
route. Restarted again without `CI=1`; watch mode enabled.

**Lesson:** when a flag is added to make a command non-interactive, check what else
that flag turns off. `CI=1` is not a neutral "don't prompt me" switch.

---

## 2026-09-11 — Core loop: GPS → Overpass → category → card

Built the app's main flow (issues #1–#4): read GPS, find nearby merchants from
OpenStreetMap, map each merchant to a spend category, rank the wallet against it.

Card earning-rate data (`data/cards.json`, 16 cards) is reused from a previous
credit-card rewards project, so the scoring layer started from real data rather than
invented numbers.

### Problem 4 — Overpass 504s under load
The very first real query to `https://overpass-api.de/api/interpreter` failed:

```
http 504
<?xml ...><p><strong>Error</strong>: runtime error: open64: 0 Success
/osm3s_osm_base Dispatcher_Client::request_read_and_idx::timeout
```

Two things worth noting. The error arrived as an **XML page, not JSON**, so a client
that assumes `response.ok` implies parseable JSON will throw a confusing
`SyntaxError` instead of a useful message. And an identical retry ~20 seconds later
returned `200` with valid data — so this is transient server load, not a malformed
query.

*Fix:* try a list of endpoints in order (main instance, then the `overpass.kumi.systems`
mirror), and wrap `response.json()` in its own try/catch so a non-JSON body produces a
readable error rather than a parser crash.

**Lesson:** a free, keyless, volunteer-run API is a real dependency with real failure
modes. Handling only `!response.ok` would not have been enough here.

### Problem 5 — sparse OSM coverage at a 250m radius
Test query at a Georgia Tech coordinate (33.7756, -84.3963) returned only three named
merchants: Blue Donkey Coffee, Kaldi's Coffee, and the Ferst Center. Correctly mapped
(`amenity=cafe` → dining, `amenity=theatre` → entertainment), but too few results to be
a useful picker.

*Fix:* widened the search radius from 250m to 400m. This is a genuine tradeoff — a
larger radius means a slower, heavier Overpass query and so a higher chance of hitting
Problem 4.

**Lesson:** OpenStreetMap coverage varies enormously by area. This app works better in
a dense commercial district than on a quiet campus, which is a property of the data
source and not something the code can fix.

---

## 2026-09-11 — Backend deployed

Vercel serverless functions + Neon Postgres, both free tier. Live at
https://whichcard-api.vercel.app

**Deliberate ordering:** `/api/health` was deployed on its own, before any real logic,
to prove the deploy pipeline worked while there were ten lines of code to debug. It
returned 200 on the first try, so everything after that was known to be application
code rather than platform configuration.

### Problem 6 — Neon provisioning needs a human
`vercel integration add neon` stopped with
`integration_terms_acceptance_required` — a legal agreement between the account owner
and Neon, which no automated step should click through. Accepted via
`vercel integration accept-terms neon --yes`, then re-ran the install; the resource
(`neon-orange-arrow`) provisioned and auto-connected to the Vercel project, writing
`DATABASE_URL` into `.env.local`.

**Lesson:** some setup steps are blocked on consent rather than on tooling, and that's
the correct design.

### Problem 7 — migration script couldn't resolve its dependency
The first migration script was written into a scratch directory outside the project and
failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@neondatabase/serverless'` —
Node resolves packages by walking up from the *script's* location, not the working
directory.

*Fix:* moved it to `server/scripts/migrate.mjs`, where it belongs anyway — a
collaborator setting up their own database needs it.

### Endpoint testing
All endpoints were tested against the deployed API with live HTTP requests, including
the failure paths:

| # | Check | Result |
|---|---|---|
| 1 | `GET /api/health` | 200 |
| 2 | signup | 201 + token |
| 3 | signup with an email already registered | 409 |
| 4 | password under 8 characters | 400 |
| 5 | login with wrong password | 401 |
| 6 | login with unknown email | 401, **byte-identical to #5** |
| 7 | login correctly | 200 + token |
| 8 | `GET /api/wallet` with no token | 401 |
| 9–10 | PUT then GET wallet | round-trips correctly |
| 11 | PUT wallet with `cards` not an array | 400 |
| 12 | corrections for an uncorrected merchant | `category: null` |
| 13–14 | POST then GET a correction | 201, then 1 vote |
| 15 | voting again on the same merchant | vote **updated**, total stayed 1 |
| 16 | correction with an invalid category | 400 |
| 17 | correction with no auth | 401 |
| 18–19 | POST event, GET aggregates | 201, then counts |

Checks 5 and 6 mattering is the point of writing them: an endpoint that answers
differently for "no such account" and "wrong password" tells an attacker which email
addresses are worth attacking. Check 15 confirms the `(osm_id, user_id)` primary key
prevents ballot-stuffing at the database level rather than trusting application logic.

---

## 2026-09-12 — App wired to the backend, and an Overpass bug found on-device

Connected the app to the deployed API: sign-in and a card picker on a new Wallet tab,
wallet loaded from the server, crowdsourced corrections surfaced and submittable from
the recommendation card, usage events logged, and a local notification when something
nearby earns 3x or better.

### Problem 8 — "Could not reach Overpass" on the phone, after a long wait
First real run on the device sat for roughly 40 seconds and then showed
`Could not reach Overpass` — despite the same query working from the laptop.

Timing both endpoints directly found it:

```
https://overpass-api.de/api/interpreter        http 200  time 1.20s  size 5039
https://overpass.kumi.systems/api/interpreter  http 000  time 45.00s size 0
```

The main instance was healthy and fast. **The mirror accepted the connection and then
never responded at all.** So a transient failure on the primary fell through to a
fallback that hung for the full timeout, and the user was then shown the *mirror's*
error — which pointed at a network problem that did not exist.

Two separate bugs, both mine:

1. **A hanging fallback is worse than no fallback.** It converts a fast, informative
   failure into a long wait ending in a misleading message. Fixed by giving each
   attempt its own timeout, putting the flaky mirror last on a short 6s leash, and
   retrying the healthy primary once before falling through to it.

2. **Aborted fetches were reported as connection failures.** The handler checked
   `err.name === 'AbortError'`, which React Native does not reliably set. Every timeout
   was therefore labelled "could not reach". Fixed by checking
   `controller.signal.aborted`, which is authoritative regardless of how the platform
   names the error.

Also changed which error surfaces: the **first** failure is reported rather than the
last, so a flaky mirror can't relabel the primary's real error.

Added `console.log` timing per attempt, which is how this was confirmed rather than
assumed — the device's own log after the fix:

```
LOG [overpass] attempt 1 ok in 3768ms (https://overpass-api.de/api/interpreter)
```

**Lesson:** redundancy is only redundancy if the backup fails *fast*. An unresponsive
fallback is a liability, and testing it from a laptop on good wifi would never have
shown this — it took running on the actual device.

### Problem 9 — sign-out button unreachable behind Expo Go's dev button
The Wallet screen put "Sign out" in the top-right of the header. On the device it
couldn't be tapped: Expo Go floats its own dev-menu button in that corner, on top of
the app.

*Fix:* moved sign-out to the bottom of the scroll view, which is the conventional place
for it anyway.

**Lesson:** the layout wasn't wrong in itself — it collided with the *host* app's
overlay. A simulator screenshot wouldn't have revealed it either, since the button is
there too but easy to ignore when you're clicking with a mouse instead of reaching with
a thumb. Real-device testing catches a category of problem that reading the code
cannot.

### Verified on device: notification, corrections, analytics
All three of the remaining features confirmed working on the physical iPhone:

- **Local notification** fired: *"4x nearby at The Melting Pot — Use your American
  Express Gold Card."* Tested by temporarily lowering the threshold from 3x to 1x so it
  would fire regardless of what happened to be nearby, then restored.
- **Crowdsourced correction** round-tripped: reclassifying Taste of Greece from Dining to
  Entertainment changed the recommendation from 4x Amex Gold to 2x Capital One Venture,
  and the header showed `community (1)` — the community answer overriding the OSM tag.
- **Analytics** recorded it: `GET /api/events` returned
  `{"lookup":2,"correction":1,"search":1}` with `amex-gold` as top card.

### Problem 10 — screenshots on the Desktop couldn't be copied by path
Copying the screenshots into the repo failed with `No such file or directory` for every
file on the Desktop, even though `ls` listed them and the paths looked identical.

The filenames contain a **narrow no-break space (U+202F)** before "PM", not an ordinary
space — macOS has used that character in screenshot filenames since Sonoma. So a path
typed with a regular space doesn't match the file that exists.

*Fix:* globbed around it (`Screenshot*3.28.29*.png`) rather than typing the literal name.

**Lesson:** "the file is right there and the path is obviously correct" is exactly the
situation where an invisible character is worth suspecting. `od -c` confirmed it:
`342 200 257` is UTF-8 for U+202F.
