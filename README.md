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

## Run the demo

With Postgres, Redis and MinIO running (`docker compose up -d postgres redis minio`, or the Homebrew equivalents):

```bash
npm install
npm run demo          # http://localhost:8080
npm run demo:live     # same, plus a public https link (needs `brew install cloudflared`)
```

`npm run demo` migrates, seeds (first run only; `--reseed` wipes it), builds
the web app, starts `api` + `issuer`, and puts everything behind one address
(`scripts/demo-gateway.js`) — so a single tunnel or LAN address is all a
second device needs, and there's no CORS to configure. The login page shows
tap-to-fill demo accounts, and the KYC page can generate a synthetic test ID
carrying your own selfie (the issuer's `DEMO_MODE`), so a demo needs no
prepared files. Logs are in `.demo/logs/`.

**Use `demo:live` for a phone.** The live camera (liveness check) and the
device signing key both need a secure context, which plain `http://<lan-ip>`
isn't — the tunnel's https is. Anyone with the link can use it, and the demo
accounts share a known password, so close it (Ctrl+C) when you're done.

Walkthrough that shows every moving part (~5 min):

1. **Guest** — browse hotels without logging in, book a room (log in as the *Guest* chip).
2. **Verify identity** — capture a live selfie (liveness prompt), *Generate test ID*, submit. Quality check → OCR → checksum → face match → signed credential in your wallet; the ID image is deleted.
3. **Staff** (`staff.ramaiah`) — Dashboard → *Check in* on the booking; a QR appears.
4. **Guest** — open the QR link (or scan it with the phone), choose which claims to share, approve. The desk screen flips to VERIFIED showing only what was disclosed.
5. **Staff** — *Complete check-in*, then *Register* (ID last-4 only) — pick nationality `US` in step 2 to see a Form C row and CSV export.
6. **Admin** — *Admin panel* → audit log; revoke the credential from *Register & revoke*; a new check-in with it now fails with `credential_revoked`.

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
npm run make-fake-ids     # synthetic ID cards for testing KYC — fixtures/, gitignored
npm run keygen --workspace=issuer   # optional; issuer auto-generates on first boot otherwise
npm run dev:api      # http://localhost:4000
npm run dev:issuer   # http://localhost:4001 (new terminal)
npm run dev:web      # http://localhost:5173 (new terminal)
```

`web/` is a guest booking flow (browse hotels → check availability → book →
manage bookings — `/hotels` and `/hotels/:id` are public, no login needed
to browse; login is only required at "Book", and you're returned to the
same hotel page afterward), a KYC verification flow (`/kyc` → `/wallet`,
using a synthetic ID from `fixtures/fake-ids/` after running
`make-fake-ids`; the selfie step is a live camera capture with a liveness
challenge by default, with a "no camera? upload a photo instead"
fallback), a hotel staff dashboard (rooms + bookings for their own hotel,
plus "Check in"/"Check out" actions and a live QR check-in session), a
guest check-in consent screen (`/checkin/present` — reached via the QR's
own URL, where the guest picks which credential claims to share), an
admin KYC review queue (`/admin/review`, showing the doc image, the
selfie image, and the face-match score side by side), a hotel guest
register with Form C export (`/hotel/register`), a guest-facing "my data"
screen (`/my-data` — what's been shared, with whom, when; withdraw
consent; delete account), and a platform-admin panel (`/admin/panel` —
hotels, the audit log, and a cross-hotel register view with a
revoke-credential action). Self-registration at `/login` always creates a
GUEST account; log in as `staff.ramaiah@hotelverify.test` /
`staff.mgroad@hotelverify.test` for the staff side (only those two of the
eight seeded hotels have a demo staff login — the rest exist for the
browse/book flow), `admin@hotelverify.test` for the review queue and
admin panel.

API requests auto-retry once through a refresh token on a 401 (access
tokens last 15 minutes) before dropping the session — see
`web/src/lib/api.js`. Every route is also rate-limited
(`express-rate-limit`, both `api/` and `issuer/`); the limiter is
disabled under `NODE_ENV=test` so the test suites' legitimate
many-logins-per-run aren't treated as abuse.

Face matching (`issuer/src/pipeline/facematch.js`) uses
`@vladmandic/face-api` on its WASM backend, not the native `tfjs-node`
binding — that binding is currently broken on Node 23+
([tensorflow/tfjs#8746](https://github.com/tensorflow/tfjs/issues/8746)).
Nothing extra to install; `@tensorflow/tfjs-backend-wasm` and the model
weights both ship inside `node_modules`. The chosen match threshold and
the FAR/FRR study behind it are in
[`docs/face-match-far-frr.md`](docs/face-match-far-frr.md); rerun the
study with `npm run face-far-frr-sweep` (hits the network — fetches LFW
pairs from Hugging Face — so it's not part of `npm test` or CI).

The check-in demo needs both a booking and a credential for the *same*
guest login: book a room as a GUEST, run `/kyc` for that same account, then
as staff click "Check in" on that booking. Redis must be reachable
(`REDIS_URL`) — it caches the issuer's JWKS and revocation list for
presentation verification (`POST /admin/network/offline` as
`PLATFORM_ADMIN` toggles a demo "no network to the issuer" mode that still
verifies correctly off the cache).

MinIO must be reachable at `http://localhost:9000` with CORS allowing
`http://localhost:5173` for the guest browser's direct presigned-PUT
uploads to work — `docker-compose.yml` sets `MINIO_API_CORS_ALLOW_ORIGIN`
for this already. Running MinIO outside Docker (e.g. via `brew install
minio`), start it with `MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:5173`
in the environment.

DPDP-aligned data retention (Section 8): `npm run purge-retention` nulls
`checkin_sessions.verified_claims_json` for bookings checked out more
than `RETENTION_DAYS` ago (default 90). It's a script, not a cron job —
run it by hand, or add it to a real deployment's crontab (its own file
comment has an example line). ID documents/selfies don't need a separate
purge step: they're already deleted from storage immediately at
credential issuance (Milestone 4), well inside the retention window.

`npm run seed` populates 8 hotels across 7 cities (25 rooms total) so the
browse flow has something to actually browse — see `scripts/seed.js` for
the full list. Seeded accounts (password for all: `Password123!`):

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
applied; there is no mocked database. `api`'s tests also need a reachable
Redis (`REDIS_URL`) for the issuer-JWKS/revocation cache, and `issuer`'s
need MinIO (`S3_*`). Neither test suite talks to a real issuer/api
service over HTTP for these, though — `api`'s tests stand up a tiny local
HTTP server as a stand-in issuer (see `api/test/checkin.test.js`,
`issuerReview.test.js`), keeping the suite self-contained.
`packages/credentials` has no database and no service dependency at all —
it's pure SD-JWT crypto over plain JS objects, run with plain `vitest`.

## Repo layout

See [HOTELVERIFY_BUILD_SPEC.md § Repo layout](HOTELVERIFY_BUILD_SPEC.md#repo-layout-monorepo-npm-workspaces)
for the target structure across all 8 milestones. `packages/credentials/`,
`issuer/`, `api/`, `web/`, and `scripts/` exist so far — `guest-app/` (a
dedicated, PWA-installable wallet app, as opposed to the KYC/wallet pages
folded into `web/` for now) is deferred; nothing about the current design
blocks splitting it out later.

## Testing coverage philosophy

Overall line coverage target is ~60%, but `packages/credentials` is held to
100% line/branch/function/statement coverage — enforced in CI, not just
reported — because that's the module a stolen or forged credential slips
through if it's wrong. A typo in a dashboard component is not in the same
risk class.
