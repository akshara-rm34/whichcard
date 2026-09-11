# WhichCard backend

REST API for WhichCard: accounts, private wallets, crowdsourced merchant category
corrections, and usage analytics.

**Live:** https://whichcard-api.vercel.app
**Health check:** https://whichcard-api.vercel.app/api/health

Vercel serverless functions (Node) + Neon Postgres. Both on free tiers.

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | liveness check |
| `POST` | `/api/auth/signup` | — | create account → `{ token, userId }` |
| `POST` | `/api/auth/login` | — | sign in → `{ token, userId }` |
| `GET` | `/api/wallet` | Bearer | the signed-in user's cards |
| `PUT` | `/api/wallet` | Bearer | replace the wallet |
| `GET` | `/api/corrections?osmId=` | — | community category for a merchant |
| `POST` | `/api/corrections` | Bearer | vote on a merchant's category |
| `POST` | `/api/events` | optional | record a usage event |
| `GET` | `/api/events` | — | aggregate counts only |

Authenticate with `Authorization: Bearer <token>`.

### Try it

```bash
API=https://whichcard-api.vercel.app

# create an account
curl -X POST $API/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8-chars"}'

# save the token from that response, then
curl -X PUT $API/api/wallet \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"cards":["amex-gold","citi-double-cash"]}'

curl $API/api/wallet -H "Authorization: Bearer $TOKEN"
```

## Security notes

- Passwords are **scrypt**-hashed with a per-user random salt and compared in constant
  time. A fast hash like bare SHA-256 would make an offline attack on a leaked table
  cheap, which is the thing password hashing exists to prevent.
- Login returns an **identical** response for an unknown email and a wrong password, so
  the endpoint can't be used to enumerate which emails have accounts.
- Sessions are **opaque random tokens**, not JWTs. A JWT stays valid until it expires
  no matter what the server thinks, so signing out could only ask the client to forget
  it; a token row can actually be deleted.
- `GET /api/events` returns **aggregates only**, never individual rows, so it can stay
  public without exposing anyone's lookup history.
- One correction vote per user per merchant, enforced by the `(osm_id, user_id)`
  primary key rather than by application logic.

## Running it yourself

```bash
cd server
npm install
vercel link                      # link to your own Vercel project
vercel env pull .env.local       # pulls DATABASE_URL from the Neon integration
node scripts/migrate.mjs         # create the tables
vercel dev                       # local, or: vercel deploy --prod
```

You'll need a Neon database connected to the Vercel project
(`vercel integration add neon`). `DATABASE_URL` is the only variable the code reads.

`schema.sql` is idempotent — every statement is `IF NOT EXISTS`, so re-running
`migrate.mjs` is safe.
