# PROGRESS

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
- **RLS is enabled but untested.** The policies exist and `FORCE ROW LEVEL
  SECURITY` is set (necessary because the dev DB role is the table owner,
  which bypasses RLS by default otherwise), but no route uses
  `withTenantTransaction` yet, so there's no test proving the policy
  actually blocks a bad query. That test belongs with whichever milestone
  first writes to `bookings`/`checkin_sessions`/`guest_register`/`consents`.
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
