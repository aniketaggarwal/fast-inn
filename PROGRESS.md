# PROGRESS

## Milestone 4 — KYC pipeline (done)

Deliverable per the build spec: upload → quality gate → OCR → template
parse → confidence → review queue UI → approve → credential issued → raw
doc deleted. Done-when: upload a fake ID, get a credential in the wallet;
S3 object is gone afterwards. Verified for real, multiple times, including
through the actual browser UI end to end — not just via curl.

This was the largest milestone so far, spanning a new synthetic-document
generator, real object storage, real OCR, and both the auto-pass and
human-review paths, in both the issuer service and a full guest/admin UI.

### What works

- **`scripts/make-fake-ids.js`**: generates synthetic Aadhaar/Passport/DL
  card images using the *exact same* template renderer the OCR pipeline
  crops against (`issuer/src/pipeline/template.js`) — one source of truth
  for the layout, so the generator and the parser can never drift apart.
  Output goes to a gitignored `fixtures/` directory; nothing synthetic-ID-
  shaped is committed, matching Section 0. Includes deliberately-bad
  fixtures (heavily blurred, too dark, failing Verhoeff checksum) so both
  the happy and unhappy paths are actually exercisable, not just assumed.
- **Object storage** (`issuer/src/storage/s3.js`): real presigned-PUT
  uploads via `@aws-sdk/client-s3` against MinIO — the guest's browser PUTs
  the doc/selfie directly to MinIO, the issuer never touches the bytes in
  transit for the upload itself (Section 9.6). Verified MinIO's native
  `MINIO_API_CORS_ALLOW_ORIGIN` env var actually grants the cross-origin
  PUT before building the flow around it, rather than assuming it would
  work. Two separate S3 endpoints — internal (issuer→MinIO) vs public
  (baked into presigned URLs, which the browser follows) — since those
  aren't the same hostname once anything is containerized.
- **Quality gate** (`issuer/src/pipeline/quality.js`): blur (variance of
  Laplacian via a real convolution kernel), brightness, and content-area
  (via `sharp`'s `trim()`) checks, all real, all calibrated against actual
  measurements on this project's own synthetic corpus — not copied
  thresholds. The blur threshold specifically needed recalibrating after
  testing showed the spec's example number doesn't transfer to
  vector-rendered synthetic cards (see "decisions" below).
- **OCR** (`issuer/src/pipeline/ocr.js`, `extract.js`): real `tesseract.js`,
  per-field cropped regions (not whole-card OCR), per-field character
  whitelists, single-line page segmentation mode, one Tesseract worker
  reused across all four fields on a document. Measured 89–97% field
  confidence on clean synthetic renders — see limitations below for why
  that number isn't representative of real photographed IDs.
- **Validators** (`issuer/src/pipeline/validators.js`): a real Verhoeff
  checksum implementation (the actual ISO 7064 algorithm, not a stub) for
  Aadhaar, plus format regexes for passport and DL numbers. A field that
  fails format or checksum is flagged, not extracted.
- **KYC routes** (`issuer/src/routes/kyc.js`): `POST /kyc/uploads/presign`,
  `POST /kyc/submit` (quality gate → OCR → validate → auto-pass-or-review →
  issue-or-park), `GET /kyc/:id/status`. Processing is synchronous within
  the request (no job queue) — a deliberate simplification for this scale
  of project, noted below.
- **Review queue** (`issuer/src/routes/review.js`): `GET /review` (60s
  presigned image URLs, per Section 9.6), `POST /review/:id/decide`
  (approve with corrected fields, still re-validated through the same
  format/checksum rules — a reviewer can override low *confidence*, not
  submit a value that fails *format*; or reject). Protected by a shared
  service-token header, not a full user system — see decisions below.
- **JWKS + revocation** (`issuer/src/routes/jwks.js`, `revocation.js`):
  `GET /.well-known/jwks.json`, `GET /revocations` (versioned, public),
  `POST /admin/revoke/:credId` (service-token protected).
- **Key management** (`issuer/src/keys.js`, `scripts/keygen.js`): Ed25519
  key persisted to `issuer/keys/*.jwk.json` (gitignored), loaded at boot;
  auto-generates with a loud warning on a fresh environment so a cold
  `docker compose up` still works, while `npm run keygen` remains the
  explicit way to do it ahead of time (Section 9.7).
- **`api` proxy** (`api/src/routes/issuerReview.js`): `PLATFORM_ADMIN`-only
  routes that forward to the issuer's staff endpoints, attaching the shared
  service secret and the calling admin's own user id — the browser never
  sees the issuer's service token, and the issuer's audit trail still
  records which real admin acted, not just "the api service."
- **`web/` UI**, all driven for real through the browser, not just asserted
  via API tests: a guest KYC upload page (phone + doc type + doc/selfie
  files + explicit consent checkbox, with an on-device ECDSA P-256 keypair
  generated via WebCrypto for SD-JWT key binding, `cnf.jwk`), a wallet page
  showing the issued credential's claims, and an admin review-queue page
  (document image + editable extracted fields, flagged fields highlighted,
  approve/reject).
- **51 new automated tests** (43 in `issuer/`, 7 proxy tests in `api/`, plus
  1 numeric-parser regression) on top of the 64 already there — 115 total
  across the monorepo, all against real Postgres/MinIO, nothing mocked.

### Bugs found and fixed while building this (worth knowing for the viva)

- **The review-approve flow could leave a submission stuck.** The original
  order was: issue the credential → delete the raw document → mark the
  submission decided. If that last DB write failed for any reason (it did,
  see next bug), the submission was left in `NEEDS_REVIEW` with its
  evidence already deleted and an orphaned credential already issued —
  unrecoverable. Fixed by reordering: issue credential → mark decided →
  *then* delete storage, so the only step that can't be retried runs last,
  after everything else has durably succeeded. `deleteSubmissionDocuments`
  now also swallows its own failures into a log + `issuer_audit` entry
  rather than 500ing a request whose actual decision already succeeded.
- **`reviewerId` reached the database before it was validated**, exactly
  triggering the bug above the first time it happened (a test passed a
  non-UUID string). Fixed by validating its shape up front, before any
  state-changing call.
- **`pg`'s NUMERIC parser returns a string, not a number.** Crashed
  `AdminReviewPage.jsx`'s `ocrConfidence.toFixed()` the first time the
  review queue was opened in an actual browser — no API test caught it,
  because none of them called `.toFixed()` on the JSON response the way a
  real UI does. Same root cause as Milestone 2's `DATE` parser bug; fixed
  with a `NUMERIC` (OID 1700) type parser in `issuer/src/db.js`, plus a
  regression assertion.
- **The admin review form pre-filled the wrong date format.**
  `extractFields` normalizes `dateOfBirth` to ISO in its `.value`, but the
  form's submit path validates against raw `DD/MM/YYYY` (what OCR actually
  reads). Pre-filling from `.value` meant re-submitting an *unedited,
  already-correct* field failed validation. This was a pure frontend bug —
  the backend's raw-format expectation is correct and consistent — so no
  backend test could have caught it; only driving the real form in a
  browser did. Fixed by always pre-filling from `rawText`, never `value`.
- **The guest's wallet never learned about a delayed approval.** A
  `NEEDS_REVIEW` submission has no credential at submit time; nothing
  pushes or polls the guest's browser when a reviewer later decides it.
  Added `savePendingSubmission`/a "Check status" button on the wallet page
  so "check back shortly" (what the UI already told the guest) is actually
  possible, not just a promise.
- **Test cleanup deleted DB rows but not the S3 objects those rows pointed
  to.** A submission a test deliberately leaves in `NEEDS_REVIEW` never
  triggers `deleteSubmissionDocuments` (correctly — a real pending review
  still needs its document). But that meant every such test leaked two
  objects into the bucket forever. Caught by literally counting objects in
  MinIO after a full test run and finding dozens more than expected — not
  by any assertion. Fixed by having test cleanup delete the S3 objects for
  any guest it's about to delete, before deleting the DB rows.
- **The blur-variance threshold from the spec's example didn't transfer.**
  Tried the literal number first; measured it against this project's own
  synthetic corpus and found even a heavily blurred vector-rendered card
  sits far above it (large flat-color regions dominate the Laplacian
  response differently than photographic texture does). Recalibrated
  against actual measurements instead of assuming the number would just
  work — documented as project-specific, not universal, in the code.

### Notable decisions worth defending in the viva

- **Issuer staff auth is a shared service-secret, not a full user system.**
  `issuer_db` has no `users`/roles table (Section 5's schema doesn't give
  it one), and inventing one just for KYC review — done by one small ops
  team, not multi-tenant hotel staff — would be schema the spec never
  asked for. Real per-admin identity is still recorded in `issuer_audit`
  (`reviewer_id`/`actorId`), because `api`'s proxy attaches the actual
  logged-in admin's user id after checking their own JWT — the browser
  never sees or sends the issuer's shared secret directly.
- **KYC processing is synchronous within the request**, not queued. OCR
  measured well under a second per document here; a production system
  would likely move this to a background worker (Redis/BullMQ, both
  already in the stack) so a slow OCR pass can't hold an HTTP connection
  open, but that's more infrastructure than this milestone's scope
  justifies.
- **Device key binding uses ECDSA P-256, not Ed25519**, for the guest's
  on-device keypair specifically (the issuer's own signing key stays
  Ed25519). Section 3c allows either; P-256 has broader, more consistent
  WebCrypto support across browsers, which matters more for a key
  generated client-side than for one generated once on a server.
- **Duplicate-document fraud detection is wired in now**, not deferred to
  Milestone 7 like the other fraud signals — it was cheap (one `doc_hash`
  lookup, already needed for the credential's `idDocHash` claim) and
  demonstrates Section 9.8's "rules you can explain" principle directly
  inside the pipeline this milestone already built.

### What was stubbed / deferred

- **Face matching is a real stub, not a fake score** —
  `issuer/src/pipeline/facematch.js` returns `{ score: null, stub: true }`
  explicitly, so nothing downstream can mistake it for a real decision.
  Real face-api.js matching + FAR/FRR threshold tuning is Milestone 6.
- **Consent is a UI gate, not yet a ledger row.** The KYC page requires the
  checkbox, but persisting a `consents` record (app_db, Section 8) is
  Milestone 7 work — issuer_db's `kyc_submissions` table has no consent
  column of its own per Section 5's schema.
- **The guest wallet is `localStorage`-only, single-browser, single-user.**
  Logging in as a second account in the same browser overwrites the first
  account's pending-submission marker (both share one origin's storage) —
  hit this directly while testing the review flow and worked around it
  manually rather than fixing it, since it's a pre-existing, already-
  documented simplification (Milestone 2's PROGRESS entry), not a new gap.
  A real guest-app PWA needs actual per-account, synced storage.
- **CI's MinIO step is unverified.** GitHub Actions' `services:` block has
  no way to pass MinIO the `server /data` command it needs to actually
  run, so it's started as a plain background container in a CI step
  instead — written correctly per GitHub Actions' documented behavior and
  YAML-validated, but not run against a real CI job in this session (no
  CI runner available here).

### Next up

Milestone 5 (check-in): session + nonce QR, guest wallet consent screen
with per-claim disclosure toggles (the actual selective-disclosure demo
moment), presentation signed by the device key generated in this
milestone, verification (issuer signature + device signature + nonce +
revocation cache), the five replay-rejection tests, guest register row
creation. Not started.

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
