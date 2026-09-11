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
