# WhichCard backend

REST API for WhichCard: user accounts, saved wallets, and crowdsourced merchant
category corrections.

Not yet implemented — see the issues on the repo for planned endpoints.

## Planned endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | create an account |
| `POST` | `/api/auth/login` | exchange credentials for a token |
| `GET`  | `/api/wallet` | the signed-in user's cards |
| `PUT`  | `/api/wallet` | replace the signed-in user's cards |
| `GET`  | `/api/corrections?osmId=` | community category corrections for a merchant |
| `POST` | `/api/corrections` | submit a category correction |
| `POST` | `/api/events` | usage analytics (lookups performed, cards recommended) |
