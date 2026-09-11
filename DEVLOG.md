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
