# HotelVerify

Verify once, check in anywhere, and the hotel never stores your ID.

A guest-identity platform for Indian hotels: a guest completes KYC once with
an independent **Issuer** service, receives a reusable, cryptographically
signed credential, and later proves their identity to any participating
hotel via selective disclosure (SD-JWT) — without the hotel ever holding a
copy of the guest's ID document.

Full design rationale, trust model, and milestone plan: [HOTELVERIFY_BUILD_SPEC.md](HOTELVERIFY_BUILD_SPEC.md).
Current build status: [PROGRESS.md](PROGRESS.md).

**Disclaimer:** this is a final-year academic project. The Issuer service
simulates a KYC authority — it is not connected to Aadhaar/DigiLocker/UIDAI,
which are not available to student projects. Statutory compliance features
(Form C, DPDP Act alignment) are illustrative and have not been legally
reviewed.

## Architecture

```
guest-app (PWA)  ──KYC submit──▶  issuer/ :4001 ──▶ issuer_db (Postgres)
      │                                │
      └──presentation──▶  api/ :4000  ◀┘ (fetches issuer's public key)
                              │
                         app_db (Postgres) · Redis · MinIO
                              ▲
                         web/ (hotel + admin dashboards)
```

`issuer/` and `api/` are deliberately separate services with separate
databases — they represent different trust domains. See Section 3 of the
build spec.

## Quick start

```bash
docker compose up -d postgres redis minio
npm install
npm run migrate
npm run seed
npm run dev:api      # http://localhost:4000
npm run dev:issuer   # http://localhost:4001 (new terminal)
npm run dev:web      # http://localhost:5173 (new terminal)
```

`web/` is a guest booking flow (browse hotels → check availability → book →
manage bookings) and a hotel staff dashboard (rooms + bookings for their own
hotel), gated by login. Self-registration at `/login` always creates a
GUEST account; log in as `staff.ramaiah@hotelverify.test` /
`staff.mgroad@hotelverify.test` to see the staff side.

Seeded accounts (password for all: `Password123!`):

| Email | Role |
|---|---|
| admin@hotelverify.test | PLATFORM_ADMIN |
| staff.ramaiah@hotelverify.test | HOTEL_STAFF (Ramaiah Grand) |
| staff.mgroad@hotelverify.test | HOTEL_STAFF (MG Road Suites) |
| guest1@hotelverify.test / guest2@hotelverify.test / guest3@hotelverify.test | GUEST |

Verify it's working:

```bash
curl http://localhost:4000/health
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"staff.ramaiah@hotelverify.test","password":"Password123!"}'
```

## Tests

```bash
npm test                          # credentials, issuer, api
npm run test:credentials
npm run test:credentials:coverage # fails the build under 100% coverage
npm run test:api
npm run test:issuer
```

`issuer`/`api` tests run against the `DATABASE_URL` in each service's
`.env` — point it at a real (dev) Postgres instance with migrations
applied; there is no mocked database. `packages/credentials` has no
database and no service dependency at all — it's pure SD-JWT crypto over
plain JS objects, run with plain `vitest`.

## Repo layout

See [HOTELVERIFY_BUILD_SPEC.md § Repo layout](HOTELVERIFY_BUILD_SPEC.md#repo-layout-monorepo-npm-workspaces)
for the target structure across all 8 milestones. `packages/credentials/`,
`issuer/`, `api/`, `web/`, and `scripts/` exist so far — `guest-app/` (the
dedicated wallet/consent PWA) lands once there's a real KYC flow to build a
wallet around, Milestone 4+.

## Testing coverage philosophy

Overall line coverage target is ~60%, but `packages/credentials` is held to
100% line/branch/function/statement coverage — enforced in CI, not just
reported — because that's the module a stolen or forged credential slips
through if it's wrong. A typo in a dashboard component is not in the same
risk class.
