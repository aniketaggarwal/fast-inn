# PROGRESS

## Milestone 3 — Credentials package (done)

Deliverable per the build spec: SD-JWT issue + verify, key gen, JWKS,
disclosure selection, full unit tests, no UI. Done-when: tests prove an
undisclosed claim cannot be recovered from the presentation, and a
tampered disclosure fails.

This is the intellectual core of the whole project (Section 3) — everything
else is CRUD around it.

### What works

New workspace `packages/credentials/`, standalone and dependency-free of
`issuer`/`api` (they'll depend on it, not the other way around):

- **`src/keys.js`**: `generateIssuerKeyPair()` — Ed25519 (`EdDSA`/`OKP`) via
  `jose`, with `kid` set to the public key's own RFC 7638 thumbprint (so
  it's derivable, not an arbitrary extra ID to keep in sync).
  `buildJWKS(publicKeyJwks)` / `findKeyInJWKS(jwks, kid)` — the
  `/.well-known/jwks.json` shape and lookup, ready for rotation (multiple
  keys, one `kid` each) per Section 9.7. No CLI script or file persistence
  yet — that's issuer service work, Milestone 4.
- **`src/sdjwt.js`**: `issueCredential` / `verifyCredential` implementing
  the IETF SD-JWT pattern from Section 3a exactly as specified — each
  claim becomes a salted disclosure `[salt, name, value]`
  (`base64url(JSON.stringify(...))`), only its SHA-256 digest goes into
  the signed JWT's `_sd` array, and the full disclosure set travels
  separately to the holder. `selectDisclosures` is the holder-side
  narrowing step for one presentation. Key binding: an optional
  `holderPublicKeyJwk` is embedded as `cnf.jwk` at issuance (Section 3c);
  actually verifying a presentation is *signed* by that key is Milestone 5
  work, once there's a nonce/session to sign.
- **31 tests, 100% line/branch/function/statement coverage**, enforced in
  CI (`npm run test:credentials:coverage` fails the build under 100%, not
  just reported). Covers exactly what Section 11 asks of this module: SD-JWT
  round-trip, tampered signature rejected, tampered disclosure rejected,
  expired credential rejected, undisclosed claim not derivable — plus:
  zero-disclosure verification (proving the credential exists/is signed
  without revealing anything), a forged-digest-injection attempt, wrong-
  issuer-key rejection, and the anti-correlation property that two
  disclosures for the same name/value get different salts and therefore
  different digests.
- The `revoked credential rejected` case from Section 11 is **not** here —
  revocation is a stateful DB/cache concern (issuer's `/revocations` list,
  a verifier's cached copy), not something a pure crypto module can check.
  That test belongs with whichever milestone builds the revocation list
  (Milestone 4 to expose it, Milestone 5/7 to check it).

### Notable decisions worth defending in the viva

- **Tampered disclosures throw, they don't silently drop.** A disclosure
  whose digest isn't in `_sd` is evidence of forgery, not an unknown-but-
  harmless claim — `verifyCredential` rejects the whole presentation rather
  than quietly excluding it.
- **The salt's actual job**, demonstrated by a dedicated test: without it,
  `isAdult: true` would hash identically on every credential HotelVerify
  ever issues, and hotels comparing digests across guests could correlate
  presentations that should be unlinkable. The salt makes every digest
  unique even for identical claim values.
- **`packages/credentials` has zero dependency on Postgres, Express, or
  either service.** It's pure crypto over plain JS objects — deliberately,
  so it's the one module in this codebase that's simple enough to actually
  reach 100% coverage honestly, and the one most worth having examiners
  read line-by-line.

### Next up

Milestone 4 (KYC pipeline): upload → quality gate → OCR → template parsing
→ confidence scoring → human review queue → on approval, call
`issueCredential` for real and wire up the issuer's actual
`/kyc`, `/review`, `/credentials/issue`, `/.well-known/jwks.json`,
`/revocations` routes (this is also where `generateIssuerKeyPair`'s output
actually gets persisted to `issuer/keys/`, gitignored, loaded at boot).
Not started.

## Milestone 2 — Booking core (done)

Deliverable per the build spec: hotels, rooms, availability, book/cancel,
guest + hotel UI. Done-when: 20 concurrent bookings for the same room →
exactly 1 success.

### What works

- **API**: `GET /hotels?city=`, `GET /hotels/:id/availability?from=&to=`
  (public, no auth — matches Section 6), `POST /bookings`,
  `GET /bookings/mine`, `POST /bookings/:id/cancel` (GUEST-only),
  `GET /hotel/bookings` (tenant-scoped, HOTEL_STAFF/HOTEL_ADMIN).
- **Booking targets a specific room**, not a room-type pool — this matches
  how `room_availability` is keyed (`PK (room_id, stay_date)`) and how
  Section 9.5 phrases the concurrency test ("20 concurrent requests for the
  same room"). A minor, deliberate deviation from Section 6's abbreviated
  `{ hotelId, roomType, from, to }` shape.
- **Concurrency**: the composite primary key on `room_availability` is the
  only thing preventing double-booking — no application-level locking, no
  `SELECT ... FOR UPDATE`. `POST /bookings` inserts one `bookings` row plus
  one `room_availability` row per night inside a single transaction; a
  conflicting insert hits the PK and the whole transaction rolls back,
  returning 409. Verified with 20 truly concurrent requests
  (`Promise.all`, not a loop) for the same room and dates: exactly 1
  succeeds, 19 get 409, and `room_availability` ends up with exactly the
  right number of rows — not more, not fewer.
- **web/**: a real React+Vite+Tailwind app, not a mockup — login/register
  (self-registration is GUEST-only, matching the API), browse hotels, check
  availability, book, view/cancel own bookings, and a hotel staff dashboard
  (own hotel's rooms + bookings, via the same tenant-scoped API). Manually
  driven end-to-end in a browser: booked a room as `guest1`, watched it flip
  to "Unavailable" for other guests, cancelled it, watched it free back up,
  and confirmed `staff.ramaiah` sees it on their dashboard while never
  seeing `staff.mgroad`'s hotel.

### Bugs found and fixed while building this (worth knowing for the viva)

- **RLS blocked every booking outright.** `bookings` has `FORCE ROW LEVEL
  SECURITY` (Milestone 1), and its original policy only recognized a
  single-tenant staff session (`app.hotel_id`). A guest's bookings span many
  hotels, so no single `hotel_id` is ever "theirs" — every guest query was
  silently rejected. Fixed with a second RLS branch keyed on `app.guest_id`
  (migration `bookings-rls-guest-path`) and a `withGuestTransaction` helper
  in `api/src/db.js`, the guest-side counterpart to `withTenantTransaction`.
- **`current_setting(name, true)` returned `''`, not `NULL`, on reused pool
  connections.** Once a custom GUC like `app.guest_id` has been set at least
  once on a physical connection, Postgres remembers it exists; a later
  transaction on that same pooled connection that never sets it again gets
  `''` back instead of `NULL`, and `''::uuid` throws. This only shows up
  under real connection reuse — exactly what a pooled app does in
  production — so it's exactly the kind of bug a single-request smoke test
  would miss. Fixed with `NULLIF(current_setting(...), '')::uuid` on all
  four RLS policies (migration `rls-nullif-empty-guc`). Added a dedicated
  `api/test/rls.test.js` that queries `bookings` with **no** app-level
  ownership filter at all, to prove RLS itself is doing the blocking, not
  just each route's own `WHERE` clause.
- **`date` columns round-tripped as the wrong day.** `pg`'s default parser
  turns a `DATE` into a JS `Date` at local midnight; serializing that to
  JSON in a timezone ahead of UTC (IST here) shows the *previous* calendar
  day (`2026-09-17` became `"2026-09-16T18:30:00.000Z"`). Caught by actually
  looking at the rendered booking in the browser, not by the API tests
  (which only checked status codes/room counts, not the date strings) —
  fixed that gap too. Fixed with `pg`'s `types.setTypeParser(1082, v => v)`
  to keep dates as the plain `YYYY-MM-DD` string Postgres already sends.
- **Test cleanup that only ran on the happy path leaked rows into the dev
  DB.** `concurrency.test.js` deleted its hotel/guest at the *end* of the
  `it()` block; when an assertion above it threw (which it did, during the
  RLS bug above), cleanup never ran and a stray "Concurrency Test Hotel"
  row was still showing up in the UI's hotel list afterward. Moved to
  `afterEach`/tracked-array-in-`afterAll` patterns across
  `concurrency.test.js`, `bookings.test.js`, and `tenant.test.js` so
  cleanup runs regardless of whether the test passed.

### What was stubbed / deferred

- **No refresh-token auto-retry in the frontend.** Access tokens are 15
  minutes; the UI doesn't silently refresh on expiry, just leaves the user
  to log in again. Fine for a demo session, a real gap for anything longer.
- **`web/` runs as a Vite dev server in Docker**, not a production static
  build behind nginx — matches the dev-mode pattern already used for
  `issuer`/`api` in this environment; noted as a simplification, not a
  target architecture.
- **No hotel/room-management UI** (creating hotels/rooms is admin work,
  Milestone 7) — the dashboard only reads what `scripts/seed.js` created.
- **`web/` uses ESM** (`import`/`export`, Vite's own convention) while
  `issuer/`/`api/` stay CommonJS — a deliberate split, not an
  inconsistency: matching each tool's own convention is less friction than
  forcing one style through both.
- Found and fixed a real production CVE in the process: `react-router-dom`
  6.x had an open-redirect advisory (GHSA-wrjc-x8rr-h8h6) with no patched
  6.x release — upgraded to 7.18.4, which kept the same
  `BrowserRouter`/`Routes`/`Route`/`Link`/`useNavigate` API this app uses,
  so no code changes were needed beyond the version bump.

### Next up

Milestone 3 (credentials package): SD-JWT issue + verify, Ed25519 key
generation, JWKS, disclosure selection, unit tests proving an undisclosed
claim can't be recovered and a tampered disclosure fails. No UI. Not
started.

## Milestone 1 — Skeleton (done)

Deliverable per the build spec: monorepo with npm workspaces, docker-compose
(Postgres, Redis, MinIO), `issuer/` and `api/` Express services with health
endpoints, node-pg-migrate with the initial schema from Section 5, argon2
password auth with JWT access/refresh and the four roles, a tenant-scoping
middleware stub, `scripts/seed.js`, Vitest + Supertest with auth tests and
the cross-tenant 404 test, and a GitHub Actions workflow running lint + tests.

### What works

- **Monorepo**: npm workspaces (`issuer`, `api`) at the root; `scripts/seed.js`
  and `HOTELVERIFY_BUILD_SPEC.md` live outside the workspaces.
- **docker-compose.yml**: postgres (with an init script that additionally
  creates `hotelverify_issuer`, since `issuer` and `api` are separate trust
  domains with separate databases per Section 3/4), redis, minio, and the
  `issuer`/`api` services themselves, all with health checks.
- **issuer/ (:4001)**: `GET /health` checks DB connectivity. Migration
  creates `guests`, `kyc_submissions`, `credentials`, `issuer_audit` exactly
  per Section 5. No business routes yet — those start in Milestone 3/4.
- **api/ (:4000)**: `GET /health`, plus:
  - `POST /auth/register` — always creates a `GUEST` account; a `role` field
    in the request body is silently ignored (tested explicitly). Staff/admin
    accounts are provisioned out-of-band (seed script for now).
  - `POST /auth/login`, `POST /auth/refresh` — argon2 password hashing,
    `jose`-signed HS256 access tokens (15m) and refresh tokens (7d). Login
    returns the same generic `invalid_credentials` error for a wrong
    password and for an email that doesn't exist, so it can't be used to
    enumerate registered emails.
  - `GET /hotel/rooms`, `GET /hotel/rooms/:roomId` — a deliberately minimal
    tenant-scoped resource (full booking/room CRUD is Milestone 2). Exists
    so the tenant-scoping middleware and the cross-tenant 404 test have a
    real route to protect and hit, instead of being untested until M2.
  - `requireAuth` / `requireRole` / `tenantScope` middleware. `req.hotelId`
    comes only from the JWT's own claims; a `hotelId` sent in the query
    string or body is read nowhere and is proven ignored by a test.
- **Schema**: full `app_db` schema from Section 5 (`hotels`, `users`,
  `rooms`, `room_availability` with composite PK `(room_id, stay_date)`,
  `bookings`, `checkin_sessions`, `guest_register`, `form_c_records`,
  `consents`, `audit_log`), plus a CHECK constraint tying `role` to
  `hotel_id` presence. Row-Level Security is enabled and **forced** on
  `bookings`, `checkin_sessions`, `guest_register`, `consents`, with a
  `tenant_isolation` policy against `current_setting('app.hotel_id')`. A
  `withTenantTransaction` helper in `api/src/db.js` sets that per-transaction
  via `set_config`. This is schema-ready defence-in-depth (Section 7) but not
  yet exercised by any route, since bookings/check-in/consents routes don't
  exist until Milestones 2/5/7.
- **scripts/seed.js**: idempotent (truncates and repopulates), refuses to
  run with `NODE_ENV=production`, creates 2 hotels / 6 rooms / 1 platform
  admin / 2 hotel staff (1 per hotel) / 3 guests, all with password
  `Password123!`.
- **Tests**: 18 passing in `api/` (register/login/refresh incl. role-field
  injection and email-enumeration checks; 7 tenant-isolation tests incl. the
  cross-tenant 404-not-403 case, an unauthenticated request, and a
  wrong-role request), 1 in `issuer/` (health). Run against a real Postgres
  — nothing is mocked.
- **CI**: `.github/workflows/ci.yml` — spins up a Postgres service
  container, creates both databases, runs both services' migrations, lints,
  and runs both test suites.

Verified manually end-to-end (not just via the test suite): seeded, logged
in as `staff.ramaiah@hotelverify.test`, listed that hotel's rooms, then
confirmed a room ID belonging to `staff.mgroad`'s hotel returns 404 when
requested with `staff.ramaiah`'s token.

### What was stubbed / deferred

- **web/, guest-app/, packages/credentials/** don't exist yet — Milestone 1
  is backend-only per the spec ("both services boot ... log in as guest,
  hotel staff, and admin"). No UI to click through yet, only HTTP.
- **Redis and MinIO** are in docker-compose and have health checks, but
  nothing in the app code talks to them yet — they're not needed until the
  check-in nonce cache (Milestone 5) and KYC document storage (Milestone 4).
- **`audit_log` is not actually append-only yet.** The spec asks for a DB
  role that only has INSERT/SELECT on it, never UPDATE/DELETE. Right now
  the app connects as the table owner (same role that ran the migrations),
  which can do anything. A dedicated low-privilege app role with that grant
  is a follow-up, likely bundled with Milestone 7 when `audit_log` starts
  being written to.
- **RLS on `bookings` is now exercised and tested** (see Milestone 2 above
  — it needed a real fix, not just a test). `checkin_sessions`,
  `guest_register`, and `consents` are still untouched by any route, so
  their policies remain unexercised until Milestones 5/7.
- **No rate limiting, no CSRF concerns tracked yet** (pure JSON API, no
  cookie-based sessions) — deferred to Milestone 8 hardening per the plan.
- **Dockerfiles for `issuer`/`api` are written but not build-tested** — this
  dev environment doesn't have a Docker daemon available. Migrations, seed,
  lint, and both test suites were all verified directly against a local
  Postgres instead. `docker compose up` should work off the same
  `npm ci --workspace=...` pattern the CI job uses, but it hasn't been run.
- **Known, accepted `npm audit` findings**: 7 remaining advisories, all in
  dev/install-time-only transitive dependencies — Vitest's bundled Vite/
  esbuild (dev-server-only vulnerability, irrelevant since no Vite dev
  server is ever run here) and `node-pre-gyp`'s `tar` dependency (used only
  while installing `argon2`, not at runtime). Fixing them requires a
  breaking Vitest 5 upgrade; deferred rather than done reflexively.

### Notable decisions worth defending in the viva

- **One Postgres container, two databases** (`hotelverify_app`,
  `hotelverify_issuer`) rather than two Postgres containers. Still two
  separate databases/trust domains as the spec requires — just cheaper to
  run for a student project. Would split into separate instances for a real
  deployment.
- **CommonJS throughout, not ESM.** The build spec's "boring, explainable
  code" instruction pushed this — `require`/`module.exports` is what an
  examiner will find most familiar to read, and it sidesteps friction with
  `node-pg-migrate`'s migration-file format.
- **`jose` (not `jsonwebtoken`) for app-session JWTs**, for one library
  instead of two across the codebase — `jose` is already required for the
  issuer's JWT/JWS/JWK work from Milestone 3 onward.
- **Self-registration is GUEST-only.** Letting a client choose its own role
  at signup would make `HOTEL_ADMIN`/`PLATFORM_ADMIN` a POST body away;
  those are provisioned by the seed script now and will be by an admin
  "onboard hotel" flow later.

### Next up

Milestone 2 (booking core): `hotels`/`rooms`/`bookings` CRUD, availability
queries, and the 20-concurrent-bookings-exactly-one-wins test against
`room_availability`'s composite primary key. Not started.
