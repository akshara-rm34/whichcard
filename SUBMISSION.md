# Individual Assignment — Mobile & IoT Development

**Name:** Akshara Madarapu
**Partner:** Maya Zhang (GitHub: `mayazhang1241`)
**Repository:** https://github.com/akshara-rm34/whichcard
**Live backend API:** https://whichcard-api.vercel.app — health check: https://whichcard-api.vercel.app/api/health

> **TODO before submitting:** fill in the partner sections (§5) once Maya's PR lands,
> and edit anything that doesn't sound like you.

---

## 1. What I built

**WhichCard** — an iOS app that tells you which credit card in your wallet to pull out,
based on where you're physically standing.

Press one button and the app:

1. reads your **GPS location** (`expo-location`)
2. queries the **Overpass API** (OpenStreetMap) for merchants within 400m
3. maps each merchant's OSM tag (`amenity=cafe`, `shop=supermarket`, …) to a spend
   category
4. scores that category against the cards you carry, using a table of real earning rates
5. tells you the best card, the multiplier, and why — *"4x — American Express Gold Card,
   4x at restaurants worldwide, up to $50k/yr"*

Backing it is a **REST API I deployed on Vercel with a Neon Postgres database**, which
handles:

- **accounts and authentication** — so your wallet is private to you
- **wallet storage** — which cards you carry, following you across devices
- **crowdsourced category corrections** — when the app guesses a merchant's category
  wrong, any user can correct it, and every other user sees that correction
- **usage analytics** — every search, lookup, and correction is recorded

The app also fires a **local notification** when something nearby earns 3x or better.

### Why I chose this

I wanted something that would (a) force me through the whole stack rather than just one
layer, and (b) be worth keeping afterward. I had a hand-curated dataset of 16 credit
cards and their category earning rates from a previous project, so the domain logic
already had real data behind it and I could spend my time on the parts I actually wanted
to learn — mobile development, deploying a backend, and working in a shared repo.

The crowdsourced corrections feature isn't decoration. It exists because the problem is
real: OpenStreetMap tagging is inconsistent, and no static mapping table can fix it.
Target is `shop=department_store` and maps to no bonus category at all. A warehouse
club's fuel pump is `amenity=fuel` sitting inside `shop=wholesale`. When the app guesses
wrong it costs the user points, so letting users fix it — and sharing that fix — is the
honest solution. That single feature is also what justifies having real user accounts,
since you need identity to attribute and limit votes.

### What I hoped to learn

- How a React Native app actually runs on a physical phone, not a simulator
- How to design and deploy a REST API with authentication that isn't toy-grade
- How to work in a shared repository with someone else without stepping on each other

### The app

![Merchants near me](docs/screenshots/03-app-merchant-list.png)

*Nearby merchants pulled live from OpenStreetMap, sorted by distance, each already
resolved to a spend category. Taken in midtown Atlanta at 33.7749, -84.3849.*

![4x recommendation](docs/screenshots/04-recommendation-4x-amex-gold.png)

*Tapping a merchant scores it against my wallet. Taste of Greece resolves to Dining, so
the Amex Gold's 4x wins — and the app shows the issuer's own wording as the reason, plus
the $50k/year cap, plus the runners-up so you can see what you'd give up.*

![Signed out](docs/screenshots/05-wallet-signed-out.png)
![Card picker](docs/screenshots/06-wallet-card-picker.png)

*The Wallet tab. Signed out it's a sign-in form; signed in it's a picker over all 16
cards, and the selection is stored server-side rather than on the device.*

![Correction submitted](docs/screenshots/07-correction-submitted.png)

*Submitting a category correction. I reclassified Taste of Greece as Entertainment, and
the recommendation immediately changed — the header now reads `community (1)`, the
community's answer having overridden the OSM tag, and the best card dropped from 4x Amex
Gold to 2x Capital One Venture. Anyone else opening the app sees that same correction.*

![Local notification](docs/screenshots/08-local-notification.png)

*A local notification fired when a nearby merchant beat the 3x threshold.*

---

## 2. Assignment requirements

| # | Requirement | How it's met |
|---|---|---|
| 1 | Install a development environment | Expo SDK 57 / React Native, Node 26, on macOS |
| 2 | Build a sample app, run it on a **device** | Stock `expo-router` template built and run on my iPhone via Expo Go, then evolved into WhichCard. Commit `a4747ef` is the unmodified template |
| 3 | Check code into version control, track tasks | https://github.com/akshara-rm34/whichcard — 6 commits, 10 GitHub issues used for tasks and bugs |
| 4 | Partner checks out, changes, tests, pushes back | See §5 |
| 5 | Deploy a web service with storage + REST | https://whichcard-api.vercel.app — Vercel serverless functions + Neon Postgres, 9 endpoints |

![Dev server](docs/screenshots/01-dev-server-qr.png)

*The Metro dev server. The phone connects over the LAN at `exp://100.70.92.116:8081`;
the `iOS Bundled` lines at the bottom are my device pulling bundles.*

![Expo Go](docs/screenshots/02-expo-go-project-list.png)

*WhichCard loaded in Expo Go on my iPhone — a physical device, not a simulator.*

![Health check](docs/screenshots/09-api-health.png)

*The deployed API answering.*

![Analytics](docs/screenshots/10-api-events-analytics.png)

*`GET /api/events` showing real usage collected from my phone: 1 search, 2 lookups, 1
correction, with `amex-gold` the most-recommended card. Aggregates only — the endpoint
deliberately never returns individual rows.*

**Exceptional items attempted:**

| Item | How |
|---|---|
| Authentication | scrypt-hashed passwords with per-user salts, opaque revocable session tokens, wallet endpoints scoped to the signed-in user |
| Third-party service | Overpass API / OpenStreetMap for merchant data |
| Device sensor / native feature | GPS via `expo-location` |
| User content shown to other users | Crowdsourced merchant category corrections |
| Notifications | Local notification when a nearby merchant earns ≥3x |
| Usage data collection | `/api/events` records every search, lookup, and correction |

---

## 3. References

Listed roughly in the order I used them.

### Environment and platform

- **Expo documentation** — https://docs.expo.dev/
  Used to set up the project and understand the Expo Go workflow. The key thing I
  learned is the difference between **Expo Go** (a prebuilt host app that runs your
  JavaScript — fast, but limited to the native modules it already contains) and a
  **development build** (your own native binary). This distinction later explained why
  remote push notifications aren't available to me.
- **`expo-location`** — https://docs.expo.dev/versions/latest/sdk/location/
  Foreground permission flow and `getCurrentPositionAsync`. I deliberately used
  foreground-only permissions; background location would have meant a much heavier
  permission prompt for no benefit here.
- **`expo-notifications`** — https://docs.expo.dev/versions/latest/sdk/notifications/
  Local notification scheduling. Documented here that Expo Go on iOS cannot receive
  remote push as of SDK 53 — which is why I used local notifications instead.
- **Expo Router** — https://docs.expo.dev/router/introduction/
  File-based routing; screens are files in `src/app/`. This is how the Wallet tab was
  added (`src/app/wallet.tsx`).

### Data sources

- **Overpass API** — https://overpass-api.de/ and https://wiki.openstreetmap.org/wiki/Overpass_API
  Free, keyless queries against OpenStreetMap. I learned Overpass QL well enough to
  write a radius query across nodes, ways and relations (`nwr`) with `out center`, which
  matters because many real merchants are mapped as building outlines rather than points
  — a node-only query silently misses them.
- **OpenStreetMap tag reference** — https://wiki.openstreetmap.org/wiki/Map_features
  Used to build the tag-to-category table in `src/lib/categories.ts`. This is where I
  learned how inconsistent real-world tagging is, which reshaped the app's design.
- **`data/cards.json`** — hand-curated by me from public issuer information for a prior
  project. Field names mirror the Rewards Credit Card API schema so it could be swapped
  for a live feed later.

### Backend

- **Vercel Functions** — https://vercel.com/docs/functions
  Serverless endpoints as files under `api/`. Deployed with the Vercel CLI.
- **Neon Postgres** — https://neon.tech/docs
  Free-tier Postgres, provisioned through the Vercel marketplace integration.
- **`@neondatabase/serverless`** — https://github.com/neondatabase/serverless
  The driver speaks HTTP rather than raw TCP, which is what makes it usable from
  serverless functions — there's no connection pool to exhaust across cold starts.
- **Node `crypto` scrypt** — https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback
  Password hashing. I learned *why* a deliberately slow hash matters: a fast hash like
  SHA-256 makes an offline attack on a leaked password table cheap, which is the exact
  thing password hashing exists to prevent.

### AI assistance — disclosure

I used **Claude Code** (Anthropic's CLI coding agent) as a virtual teammate throughout
this assignment. Being specific about the division of labour, since the assignment asks
for it:

**What I directed.** I chose the project and its scope, decided to reuse my existing
card dataset, and chose the feature set. When offered a simpler "geo note board" idea, I
rejected it in favour of something that would look better on a resume and could carry
into a team project. I set the hard constraint that **nothing could cost money**, which
ruled out the Google Places API and shaped the choice of Overpass and free tiers
throughout. I decided the order of work (core loop before backend), asked for commits to
be authored solely by me, and did all the on-device testing — every bug below was found
by me running the app on my phone and reporting what I saw.

**What the AI did.** Wrote the majority of the code, diagnosed failures from the
symptoms I described, set up the GitHub repo and issues, and deployed the backend.

**What I learned from the experience.** The most useful thing was watching how it
debugged rather than what it wrote. When "Could not reach Overpass" appeared on my
phone, it didn't guess — it timed both endpoints directly from the terminal, which
immediately showed that the main endpoint was healthy at 1.2s while the mirror hung for
45 seconds with zero bytes. That reframed the problem completely: the bug wasn't the
network, it was that my fallback was worse than having no fallback. I've since started
reaching for "measure it directly" earlier instead of reading code looking for the
mistake.

I also learned to be suspicious of confident-sounding fixes. At one point it "fixed" a
Fast Refresh problem by restarting the dev server with `CI=1` to suppress a prompt —
which silently disabled Metro's watch mode and reintroduced the same symptom by a
different route. It caught this itself from Metro's output, but it's a good reminder
that a fix that looks right and a fix that works aren't the same thing, and that you
verify by observing behaviour rather than by reasoning about the change.

Areas where I had to make the call myself: accepting Neon's terms of service (correctly
refused by the tool as a legal agreement only I could enter into), and choosing what to
delegate to Maya.

---

## 4. How to download and run it

### The app

Requires Node 20+ and a phone with [Expo Go](https://expo.dev/go).

```bash
git clone https://github.com/akshara-rm34/whichcard.git
cd whichcard
npm install
npx expo start
```

Scan the QR code with your iPhone camera, or the Expo Go app on Android.

If it never connects, your wifi probably has client isolation on (common on campus
networks — check whether your IP is in the `100.64.0.0/10` range). Use
`npx expo start --tunnel` instead.

### The backend

Already deployed at https://whichcard-api.vercel.app. To run your own copy:

```bash
cd server
npm install
vercel link
vercel env pull .env.local     # gets DATABASE_URL from the Neon integration
node scripts/migrate.mjs       # creates the tables
vercel deploy --prod
```

Full endpoint documentation is in [`server/README.md`](server/README.md).

### Try the API directly

```bash
API=https://whichcard-api.vercel.app

curl $API/api/health

curl -X POST $API/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8-chars"}'
```

---

## 5. Version control history and working with a partner

### Commit history

| Commit | What |
|---|---|
| `a4747ef` | Initial commit — the unmodified Expo sample template (55 files) |
| `a49929e` | Rebranded to WhichCard, added README and DEVLOG |
| `83e2868` | Core loop: GPS → Overpass → category → card recommendation |
| `77dfe62` | Backend REST API: auth, wallet, corrections, analytics (518 lines) |
| `4eef44d` | Deployed to Vercel with Neon Postgres, added migration script |
| `d112c7d` | Wired the app to the backend, corrections UI, local notifications |
| `5a06582` | Fixed sign-out button hidden behind Expo Go's dev button |

Issues were used for tasks and bugs, not just as a checklist — issue #8 is a bug I hit,
diagnosed, fixed, and closed with the explanation attached.

![Commit history](docs/screenshots/13-commit-history.png)

*Eight commits across three days, each with a message explaining the reasoning rather
than just the change.*

![Issues](docs/screenshots/11-github-issues.png)

*Issues used to track the work: 7 closed, 3 open. Two are labelled `partner` and
reserved for Maya.*

![Issue 8](docs/screenshots/12-issue-8-closed-bug.png)

*Issue #8 — a bug I hit, diagnosed, fixed, and closed with the explanation attached,
including the follow-on bug I caused while fixing it.*

### Coordination with Maya

[TODO — fill in after Maya's PR lands. Points to cover:]

- How we split the work: I took the app and backend; Maya took issue #10, expanding the
  OSM tag-to-category mapping.
- Why I asked for a PR rather than a direct push to `main`.
- What she changed, and what happened when I pulled it.
- What I changed on her repository.
- Any merge conflicts or setup problems she hit, and how we resolved them.

### What I learned about working with others

[TODO — your own words. Some things that actually happened worth drawing on:]

- I reserved issue #9 for Maya and then **built it myself** while doing the rest of the
  backend, because the corrections endpoints shared plumbing with auth and wallet. I had
  to re-scope and hand her a different task (#10). The lesson: reserving work for
  someone isn't the same as protecting it, and the person moving fastest can quietly
  erase the other person's task without meaning to.
- I force-pushed to rewrite history early on, to remove attribution trailers from a
  commit. That was safe **only** because nobody had cloned the repo yet. Once Maya had a
  copy, that stopped being free — rewriting shared history would have broken her clone.
- Writing the issue for Maya forced me to explain the problem properly, including which
  mappings I thought were genuinely debatable. That was harder than doing the work, and
  it's the first time I've understood why people say clear tickets are a skill.

### What I'd do differently

[TODO — your own words. Honest candidates:]

- Get the partner side started on day one. I left it late, and it's the one requirement
  I can't complete alone or at the last minute.
- Decide up front who owns what, and *stop touching* the other person's area.
- Ask for my partner's repo URL at the same time as sending mine, since the requirement
  runs in both directions.

---

## 6. Problems I hit and what I learned

Full detail with error messages is in [`DEVLOG.md`](DEVLOG.md). Summary:

| # | Problem | Resolution | Lesson |
|---|---|---|---|
| 1 | Laptop on a CGNAT address (`100.70.x.x`) — networks like that often block phone→laptop connections | Worked anyway; `--tunnel` identified as the fallback | Recognising the address range told me *in advance* what would break and why |
| 2 | Fast Refresh stopped applying edits | Dev server had run ~14h; the HTTP server still answered while the HMR websocket had died | A process that responds isn't necessarily a process that works |
| 3 | The fix reintroduced the bug — `CI=1` silently disables Metro's watch mode | Restarted without it | A flag added to suppress a prompt may turn off more than the prompt |
| 4 | Overpass returned a 504 as an **XML page**, crashing the JSON parser | Defensive parsing, retry, mirror fallback | A free volunteer-run API is a real dependency with real failure modes |
| 5 | 250m radius returned only 3 merchants | Widened to 400m | OSM coverage varies enormously; the code can't fix the data |
| 6 | Neon provisioning blocked on terms acceptance | Accepted them myself | Some steps are blocked on consent, not tooling — correctly |
| 7 | Migration script: `ERR_MODULE_NOT_FOUND` | Node resolves packages from the *script's* location, not the working directory | Moved it into the repo, where it belonged |
| 8 | **"Could not reach Overpass" on the phone after a 40s wait** | The mirror accepted connections and never responded; a transient primary failure fell through to a fallback that hung, then reported the *mirror's* error | Redundancy is only redundancy if the backup fails fast. Also: RN doesn't reliably set `err.name === 'AbortError'`, so every timeout was mislabelled as a connection failure |
| 9 | Sign-out button untappable | It sat under Expo Go's floating dev button | The layout wasn't wrong — it collided with the *host* app. Only a real device shows this |

The one I'd highlight is **#8**, because it's the clearest example of a bug that no
amount of reading the code would have found. It only appeared on the physical device,
the error message actively pointed in the wrong direction, and the fix was to make the
system *fail faster* rather than to make it more robust.
