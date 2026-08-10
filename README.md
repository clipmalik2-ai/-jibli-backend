# Jibli Backend

Node.js + Express + Prisma API for the Jibli buy-for-me app. Matches the
flow in the buyer and admin prototypes exactly: buyer submits an order,
pays via BaridiMob, uploads a screenshot, admin manually verifies and
advances the order through each stage.

## Why manual verification

BaridiMob has no public API for third-party apps to receive or confirm
payments automatically. Every "BaridiMob-integrated" app in Algeria today
works the same way this one does: show your BaridiMob number + a
reference code, have the buyer transfer manually and upload proof, and
have a human (you) confirm it against your own BaridiMob account. This
backend is built around that reality — the `PENDING -> PAID` transition
is an admin action, not a webhook.

If BaridiMob or CIB ever opens a merchant API to you, only
`src/routes/admin.js`'s `confirm-payment` route would need to change
(it could become automatic); nothing else in the schema or app would
need to move.

## Setup

```bash
npm install
cp .env.example .env        # then edit JWT_SECRET, BARIDIMOB_NUMBER
npx prisma migrate dev --name init
npm run seed                 # creates an admin user + starting exchange rate
npm run dev                  # starts on http://localhost:4000
```

Default seeded admin: phone `+213600000000`, password `changeme123` —
change this immediately (there's no "change password" route yet; for now,
update it directly with `npx prisma studio` or add one before going live).

## Switching to Postgres for production

SQLite is just for local development. Before deploying:
1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to a Postgres connection string (Supabase, Railway, and Render all give you one for free to start).
3. Re-run `npx prisma migrate dev`.
4. Move `/uploads` (payment screenshots) to real object storage — S3, Supabase Storage, or Cloudinary — since most hosts don't persist local disk writes across deploys.

## API overview

**Auth** (`/auth`)
- `POST /auth/register` — `{ phone, password, name?, language?, address?, postalCode? }` → `{ token, user }`
- `POST /auth/login` — `{ phone, password }` → `{ token, user }`
- `GET /auth/me` — current user's profile (requires token)
- `PATCH /auth/me` — update saved profile info, e.g. default delivery address: `{ name?, address?, postalCode?, language? }`

The same phone + password account and JWT work from both the website and the React Native app — neither needs separate auth logic, they just call this same API.

**Buyer orders** (`/orders`, requires `Authorization: Bearer <token>`)
- `POST /orders` — `{ productUrl, productTitle, productSource, priceUSD, shippingDZD?, recipientName?, address?, postalCode? }` → creates the order using the current exchange rate + fee %, returns the order + your BaridiMob number. Delivery info (`recipientName`, `address`, `postalCode`) is required — it's taken from the request if provided, otherwise falls back to the buyer's saved profile; the request fails with a clear error if neither has it.
- `POST /orders/:id/proof` — multipart upload, field name `proof` → attaches the payment screenshot
- `GET /orders/mine` — buyer's own order history
- `GET /orders/:id` — one order, with full stage history (for the postal-stamp timeline)

**Public** (`/public`, no login required — used by the website)
- `GET /public/pricing` — `{ rateDZD, feePercent, shippingDZD }`, powers the live estimator
- `GET /public/track/:reference` — order status by reference code (e.g. `JB-4512`), no personal buyer info included, powers "track my order"

**Admin** (`/admin`, requires an ADMIN-role token)
- `GET /admin/orders?stage=PENDING&query=...` — list/search/filter
- `GET /admin/orders/:id` — full detail including buyer info
- `POST /admin/orders/:id/confirm-payment` — PENDING → PAID
- `POST /admin/orders/:id/reject` — `{ note? }` → PENDING → REJECTED
- `POST /admin/orders/:id/advance` — moves to the next stage in sequence (PAID → BOUGHT → SHIPPED → ARRIVED → DELIVERED)
- `GET /admin/rates` / `POST /admin/rates` — `{ rateDZD }`, exchange rate history (append-only, matches the Settings screen)
- `GET /admin/settings` / `PATCH /admin/settings` — `{ feePercent }`

## Key design decisions carried over from the prototypes

- **Rate history is append-only.** Each order stores the `exchangeRateId` that was active when it was created, so changing today's rate never changes the total on an existing order.
- **Fee % is locked into the order** (`Order.feePercent`) at creation time for the same reason — if you change the fee later, past orders aren't retroactively affected.
- **Stage transitions are logged** in `OrderStageEvent`, giving you an audit trail if a buyer disputes where their order is.

## Next steps to wire this to the React Native app

1. Point the app's API client at this server's base URL.
2. Replace the prototype's mock data calls with real `fetch`/`axios` calls to these endpoints.
3. Store the JWT from login/register in secure device storage (e.g. `expo-secure-store`).
4. For the payment screenshot upload, use `FormData` with the device image picker.
