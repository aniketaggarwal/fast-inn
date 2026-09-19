# PROGRESS

## Milestone 8, part 2 — one-command demo, single origin, live link (done)

Goal: demonstrate the whole product from a laptop *and a phone* without
setup steps, and make it shareable.

- **`npm run demo`** (`scripts/demo.js`): checks Postgres/Redis/MinIO (starts
  MinIO itself if it's installed but not running), migrates, seeds on first
  run, builds the web app, starts api + issuer, and prints URLs. Output of
  each step is captured and shown only on failure. `--live` adds a
  Cloudflare quick tunnel and prints the public https URL.
- **Single origin** (`scripts/demo-gateway.js`): one port serves the built web
  app and proxies `/api`, `/issuer` and the MinIO bucket path. One tunnel is
  enough, and the browser makes no cross-origin requests. The MinIO route is
  the subtle part — a presigned PUT's SigV4 signature covers the path and Host
  header, so the gateway forwards both untouched (routing by bucket name
  rather than a strippable prefix). Verified by uploading through it.
- **Request-derived public URLs**: `S3_PUBLIC_ENDPOINT=auto` (issuer) and
  `WEB_BASE_URL=auto` (api) sign presigned URLs and build the check-in QR
  against whatever origin the request arrived on — a tunnel hostname is random
  per run and unknowable at start. Fixed values (dev, docker-compose, tests)
  behave exactly as before.
- **Rate limiting behind a proxy**: without `trust proxy`, every user behind
  the gateway looks like 127.0.0.1 and shares one rate-limit bucket. The demo
  launcher opts in (`TRUST_PROXY=1`) and binds api/issuer to loopback
  (`HOST=127.0.0.1`), so a spoofed `X-Forwarded-For` can't reach a directly
  exposed port; the gateway *overwrites* (not appends) the header.
- **Demo mode** (`DEMO_MODE=true`, off by default): the login page shows
  tap-to-fill accounts, and `POST /demo/id-card` renders a synthetic ID (same
  template the OCR reads, checksum-valid number) carrying the guest's own
  selfie — nobody demoing on a phone has a fake Aadhaar to photograph. The
  card still goes through the real pipeline; a test proves quality gate, OCR
  and face match all accept it. The card composer moved from a test helper
  into `issuer/src/pipeline/demoCard.js`, so tests and the demo share it.

### Bug found while building it

`scripts/demo.js` first loaded `api/.env` into its own `process.env`. Every
child inherited `DATABASE_URL`, and dotenv never overrides an already-set
variable — so the issuer's migration and server would have used the *api's*
database. Caught because the first `npm run migrate` from the launcher
failed; fixed by parsing the file instead of loading it.

- **Hosting** (`Dockerfile`, `scripts/serve.js`, `render.yaml`,
  `docs/DEPLOY.md`): the whole product as one container behind one port —
  web + api + issuer with a private Redis and MinIO — needing only a Postgres
  URL. Neither Redis nor MinIO holds anything that outlives a restart (a JWKS
  cache; KYC images that live seconds before deletion), so no volumes are
  needed. One Postgres database serves both services: the issuer's migrations
  run under `issuer_migrations` so its history doesn't collide with the api's
  `pgmigrations` (both have an `initial-schema`). The gateway now works out the
  real client IP from `cf-connecting-ip` or a configured number of trusted
  proxy hops — never the leftmost, client-controlled `X-Forwarded-For` entry.
  The three stale per-service Dockerfiles (alpine, no `credentials` workspace —
  they could not have built) were removed; `docker compose --profile app`
  now runs the same image.
- `DEMO_PASSWORD` lets a hosted demo rotate the shared password; the login
  page gets it from `/health` in demo mode instead of baking it into the bundle.

- **Storage in the container is filesystem-backed, not MinIO.** The first
  Render build failed with `curl: (22) ... 410` — `dl.min.io` no longer serves
  the MinIO server binary, so the image could never have been built. Instead of
  depending on another vendor's download, the issuer got a second storage driver
  (`STORAGE_DRIVER=fs`, `issuer/src/storage/fsStorage.js` + `routes/storage.js`):
  same contract as the S3 one — nothing public, every access a short-lived URL
  for one operation on one key — with an HMAC over (operation, key, expiry) in
  place of a SigV4 signature. Keys must match the exact shape `newObjectKey`
  produces, so nothing can traverse out of the storage directory. Dev, tests and
  `npm run demo` still use S3/MinIO; tests cover the round trip, tampered key /
  swapped operation / expiry / bad signature, and traversal. Re-verified the
  container entrypoint end to end: a full KYC through the gateway ends
  `APPROVED` with zero image files left on disk.

### Not done / not verified

- **The Dockerfile and `render.yaml` were never built or deployed** — Docker
  isn't installed on this machine. `scripts/serve.js`, the code they run, was
  exercised locally against a fresh single database with its own Redis and
  filesystem storage: migrations for both services, seeding, a full KYC
  (generated ID → upload through the gateway → OCR → face match → APPROVED),
  and login with a rotated password. Nothing has been deployed anywhere.
- The issuer's signing key is regenerated on each redeploy (credentials from
  before it stop verifying) — mount a disk at `ISSUER_KEYS_DIR` to keep it.
- Playwright happy path and an architecture diagram are still open.

## Milestone 8, part 1 — reliability + a real-feeling booking site (done)

Started on Milestone 8 (hardening + demo) with a specific steer: make the
guest browse/book flow actually look and feel like a normal booking site
rather than a form-testing harness, fix a couple of real reliability
gaps, and expand the demo dataset. Playwright/architecture-diagram/deploy
(the rest of Milestone 8) are still ahead — this entry covers what's done
so far.

### What works

- **8 hotels across 7 cities** (`scripts/seed.js`), up from 2 — Bengaluru
  (both original staffed hotels, unchanged), Mumbai, Delhi, Goa, Jaipur,
  Chennai, Kochi. Every hotel now has a `description`, a `star_rating`
  (1-5), and an `amenities` list (migration
  `1735400000000_hotel-marketing-fields`); names/descriptions are
  original and fictional, the same reasoning as the synthetic ID cards —
  a real chain's name or a borrowed stock photo would misrepresent an
  actual property. 25 rooms total, varied types/pricing by city. Only the
  two original hotels get a demo `HOTEL_STAFF` login; the rest exist for
  the browse/book flow, not the full staff-dashboard demo.
- **Public browsing, login only at "Book"**: `/hotels` and
  `/hotels/:hotelId` are no longer behind `ProtectedRoute` — the backend
  routes were already public (`api/src/routes/hotels.js`), only the
  frontend was gating them. `HomePage.jsx` now sends a logged-out visitor
  to `/hotels` instead of straight to `/login`. Clicking "Book" while
  logged out sends you to `/login` with a `state.from`, and `LoginPage.jsx`
  now returns you to that exact hotel page after login instead of always
  landing on the plain hotel list — verified in the browser end to end
  (anonymous browse → click Book → login → land back on the same hotel,
  already-selected dates intact → book successfully).
- **A real listings-page look**: `HotelBanner.jsx` renders a deterministic
  gradient (hashed from the hotel's own name, so it's stable without
  storing anything) instead of a missing-image placeholder or a borrowed
  stock photo; `StarRating.jsx` and a dozen hand-rolled amenity icons
  (`components/icons.jsx` — no new icon-library dependency for a dozen
  glyphs) round out hotel cards and the hotel detail page. A small brand
  color scale and Inter (Google Fonts) replace the plain default Tailwind
  look (`tailwind.config.js`, `index.html`).
- **JWT auto-refresh on 401** (`web/src/lib/api.js`): access tokens last
  15 minutes and there was previously no refresh logic at all — every
  request after expiry just failed until the user manually logged back
  in. `baseRequest` now retries once through `POST /auth/refresh` on a
  401, collapsing concurrent 401s into a single in-flight refresh call
  rather than racing several against the same refresh token. On a refresh
  failure it clears the session and fires a DOM `auth:logout` event that
  `AuthContext` listens for — the plain `api.js` module can't reach that
  component's React state directly, and without this the UI would show
  localStorage's stale "logged in" state instead of actually dropping to
  logged-out. Verified both paths live in the browser: a garbage access
  token with a real refresh token transparently recovers (confirmed the
  token in localStorage actually changed); a garbage refresh token too
  cleanly redirects to `/login`.
- **Rate limiting** (`api/src/middleware/rateLimit.js`,
  `issuer/src/middleware/rateLimit.js`, `express-rate-limit`): a generous
  global backstop on every route, a stricter limit on `/auth/*`
  (credential-stuffing target), the public
  `/checkin/sessions/:id/present` (Section 9.4's replay-defence surface),
  and `/kyc/submit` (the most expensive route in the issuer — real
  OCR/face-match inference per call). Skipped entirely when
  `NODE_ENV=test` (vitest sets this automatically) so the test suites'
  legitimate dozens-of-logins-per-run aren't mistaken for abuse — verified
  the skip actually works (full suites green) *and* that the limiter
  itself actually fires outside test mode (hammered `/auth/login` with
  curl, got exactly 20 successes then 429s).

### Bugs found and fixed while building this

- **The global rate limit's first value (300 req / 5 min) was too tight
  for real interactive use**, not just abuse — caught by tripping it
  myself during normal browser-based testing. React StrictMode
  double-invokes effects in development, and a single hotel-detail page
  view fires several requests at once (hotel details + availability),
  so normal navigation burns through a tight budget fast. Raised to
  1000/5min — still a real backstop against sustained scripted abuse
  (200 req/min sustained trips it within a minute), just not one that
  fires on ordinary browsing.
- Tailwind theme changes (`tailwind.config.js` — the new brand colors and
  font) didn't take effect on the already-running Vite dev server; had to
  restart it. Config-file changes aren't picked up by the same
  file-watching that handles component edits — worth remembering before
  concluding a style change "isn't working."

### What's deferred to the rest of Milestone 8

Rate limits/error states/bigger seed data are done; still open: empty
states on the less-visited pages, a Playwright happy-path test, an
architecture diagram, README polish, and a deployed URL.

## Milestone 7 — Compliance (done)

Deliverable per the build spec: guest register view + Form C export,
DPDP-aligned consent ledger with a guest-facing "my data" screen, a
retention purge job, an append-only audit log with an admin viewer, and a
revocation admin panel. Done-when: "Revoke a credential → next check-in
fails with a clear reason." Verified for real, end to end, through the
actual browser UI, not just the 75 automated api tests this milestone
brought the suite to (48 credentials + 75 api + 58 issuer = 181 total
across the monorepo): booked a room as a guest, ran KYC, staff checked
them in (consent + audit rows written automatically), staff checked them
out (register got a departure timestamp), the guest withdrew their
consent from `/my-data`, a platform admin revoked the credential from
`/admin/panel`, and — the actual done-when — a **second** check-in
attempt with that same credential failed with `credential_revoked`
displayed directly on the guest's own consent screen.

### What works

- **Guest register + Form C** (`GET /hotel/register`,
  `GET /hotel/exports/form-c.csv`, `HotelRegisterPage.jsx`): auto-populated
  from verified check-ins, `idLast4` only — there's no column in the schema
  to leak a full ID number even by mistake. Non-Indian nationals get a
  `form_c_records` row on check-in and a "Form C" badge on the register;
  the CSV export stamps `exported_at` on every row it returns.
- **DPDP consent capture, written where the disclosure actually happens**:
  `api/src/routes/checkin.js`'s `/present` handler now writes a `consents`
  row (`claims_disclosed_json` taken from `Object.keys(verification.claims)`
  — whatever the guest actually disclosed, not a fixed list) in the same
  transaction as the `guest_register` insert, plus a `checkin_verified`
  audit_log entry.
- **Guest-facing "my data" screen** (`GET /consents/mine`,
  `POST /consents/:id/withdraw`, `DELETE /account`,
  `GuestMyDataPage.jsx`): shows claim *names* shared with each hotel, when,
  and for what purpose — never the disclosed values themselves, so this
  page isn't itself another place the guest's PII sits around. Withdrawing
  consent can't undo a disclosure that's already part of a hotel's
  statutory register, but it does two real things: records the withdrawal
  event, and immediately nulls that booking's
  `checkin_sessions.verified_claims_json` rather than waiting for the
  nightly retention job.
- **Account deletion balances DPDP erasure against statutory retention**:
  `DELETE /account` anonymizes the `users` row (email replaced, password
  hash cleared, `deleted_at` stamped) instead of a hard `DELETE`, because a
  real delete would `CASCADE` through `bookings` into `guest_register` and
  destroy records hotels are legally required to keep. Login is blocked
  immediately (`auth.js`'s login/refresh queries now filter
  `deleted_at IS NULL`); the freed-up email can be re-registered fresh.
- **Retention purge job** (`scripts/purge-retention.js`,
  `npm run purge-retention`, default 90 days via `RETENTION_DAYS`): nulls
  `checkin_sessions.verified_claims_json` for bookings checked out more
  than N days ago. Selfies/ID documents don't need a separate purge step
  here — they're already deleted from storage immediately at credential
  issuance (Milestone 4), stricter than the 90-day allowance. Manually
  verified against a real backdated fixture row (not just read by eye):
  ran the script, confirmed exactly 1 row purged, confirmed a second run
  purges 0 (idempotent), confirmed the `retention_purge` audit_log entry.
- **A checkout action that didn't exist before this milestone**
  (`POST /hotel/bookings/:id/checkout`) — nothing in Milestones 1-6 ever
  moved a booking past `CHECKED_IN`, but the retention job's "N days after
  checkout" needs a real timestamp to anchor on. Stamps
  `guest_register.departure_at` too.
- **Admin panel** (`GET /admin/hotels`, `GET /admin/audit`,
  `GET /admin/register`, `AdminPanelPage.jsx`): three tabs — hotels,
  the append-only audit log, and a cross-hotel register view with a
  revoke-credential action (reusing the `POST /issuer/admin/revoke/:credId`
  proxy that already existed from Milestone 5 but had no UI in front of
  it until now). Revocation is mirrored into api's own `audit_log`
  (`credential_revoked`) alongside the issuer's own `issuer_audit`, so a
  platform admin reviewing one screen sees revocations next to check-ins
  and account deletions instead of needing to check two systems.

### Bugs found and fixed while building this (worth knowing for the viva)

- **`GET /admin/register` returned zero rows for every hotel, silently.**
  `guest_register` has `FORCE ROW LEVEL SECURITY` (Section 7); its policy
  only recognizes a single tenant's `app.hotel_id`, with no branch that
  authorizes "read across every hotel." A `PLATFORM_ADMIN` route querying
  it directly isn't a bypass of RLS, it's just... blocked, exactly the
  same as any other unscoped query, and the query doesn't error — it just
  quietly returns nothing, which looks identical to "no data yet" instead
  of "wrong access pattern." Caught by this milestone's own
  `compliance.test.js` test ("reads across hotels") failing with an empty
  result, not by reading the code. Fixed properly, not by connecting as a
  different role: added an explicit `app.platform_admin` branch to *all
  four* RLS-protected tables' policies (`1735300000000_compliance`
  migration) and a `withPlatformAdminTransaction` helper
  (`api/src/db.js`) that's the only thing allowed to set that GUC — the
  same shape of fix as the guest_id branch bookings already got in
  Milestone 2, generalized to a third kind of session, not a new pattern.
- **The retention purge script "succeeded" at purging nothing**, for the
  identical reason — its own bare `Pool` connection had no GUC set at
  all, so both the `guest_register` subquery and the `checkin_sessions`
  update RLS-filtered to zero rows, and it printed
  "cleared verified_claims_json on 0 check-in session(s)" as if that were
  a legitimate, unremarkable result. Found by actually creating a
  backdated fixture row and running the script against it rather than
  trusting a clean exit code — the same discipline that's caught every
  RLS surprise since Milestone 2. Fixed with the same
  `withPlatformAdminTransaction`-shaped bypass, just from a script instead
  of a route.
- **My own first draft of the `1735300000000` migration regressed an
  already-fixed bug**: it rewrote `consents`' RLS policy to add the
  guest-branch, but used the pre-`NULLIF`-fix form
  (`current_setting(...)::uuid = hotel_id`) instead of the
  `NULLIF(current_setting(...), '')::uuid` form
  `1735200000000_rls-nullif-empty-guc` had already established for every
  other table — silently reintroducing the "empty string GUC on a reused
  pooled connection throws 22P02" bug for that one table. Caught before
  commit by re-reading the migration history before writing a new
  cross-cutting RLS change, not by a test (this specific regression
  never got exercised by the connection-reuse pattern that originally
  surfaced it). Rewritten to match the established NULLIF form and
  extended consistently to all four tables in one migration instead of
  patching just the one this milestone happened to touch.
- **Several new tests' own fixture setup hit the exact same RLS wall**
  as the app code above (`new row violates row-level security policy`,
  or a false-positive-shaped 0-rows-back) — inserting/reading
  `bookings`/`guest_register`/`consents` fixture rows via a plain
  `pool.query()` instead of the `withTenantTransaction`/
  `withGuestTransaction` helper a real request would use. Not a
  coincidence: it's the same lesson Milestone 5's PROGRESS.md already
  drew from an expired-session test ("a bare `pool.query` for its UPDATE,
  silently no-op'd by FORCE ROW LEVEL SECURITY") — re-learned here across
  several call sites in one milestone because the new compliance
  tables are RLS-protected the same way, and a couple of assertions
  (`expect(formC.rowCount).toBe(0)`) were false positives that would have
  passed whether or not the feature worked, which is a worse failure mode
  than an outright crash.
- **`issuerReview.test.js`'s revoke test 500'd** after this milestone
  added an api-side `audit_log` mirror of `credential_revoked` —
  `audit_log.entity_id` is a `uuid` column and the test's fake credential
  id (`"cred-1"`) isn't UUID-shaped. Fixed two ways: gave the test a
  realistic UUID-shaped fixture id, *and* wrapped the audit write itself
  in a try/catch-log rather than letting it throw — the revoke had
  already succeeded upstream by that point, so a logging hiccup
  shouldn't turn a successful revoke into a 500 for the caller. Same
  "log, don't throw" pattern Milestone 4's `deleteSubmissionDocuments`
  already established for non-critical side effects.

### Notable decisions worth defending in the viva

- **RLS's `platform_admin` branch is a session-scoped Postgres GUC that
  only `withPlatformAdminTransaction` ever sets** — never something a
  client request can influence, the same trust boundary as
  `app.hotel_id` coming only from a verified JWT (Section 7) and never
  from request input. A route bug that forgets to check `req.user.role
  === "PLATFORM_ADMIN"` before calling it is still a real bug, but it
  can't be triggered by anything in a request body or query string.
- **Account deletion anonymizes rather than deletes**, and this is
  presented as the actual designed behavior in the UI copy, not hidden —
  `GuestMyDataPage.jsx` says outright that statutory register entries
  aren't touched. This is the single most defensible-in-the-viva design
  tension in this milestone: DPDP's erasure right and India's hotel
  guest-register retention law point in opposite directions for the same
  data, and the honest answer is neither "silently keep everything" nor
  "silently delete records the hotel is legally required to have" — it's
  scoping erasure to exactly the account/login layer and saying so.
- **Form C's `visa_type`/`arrival_from` fields are left null, always** —
  the credential schema has no claim for either, and fabricating a value
  for a government filing field this system genuinely doesn't collect
  would be worse than an honest gap. Documented in the route's own
  comment, not just here.
- **The retention job purges `verified_claims_json`, not selfies/ID
  images**, because there's nothing left to purge there — Milestone 4's
  own design already deletes the raw document/selfie from storage
  immediately at credential issuance, well inside the 90-day default this
  job enforces for the one thing that *does* linger.
- Per Section 8's own instruction: statutory requirements (guest
  registers, Form C, DPDP alignment) vary by state and change over time;
  this implementation is illustrative for an academic project and has
  not been legally reviewed. See the README for the same disclaimer in
  context.

### What was stubbed/deferred

- `audit_log` grants: Section 5 asks for the app's DB role to have
  `INSERT`/`SELECT` only on `audit_log`, enforced at the database level so
  even a compromised app can't tamper with the trail. This dev setup
  still connects as the table owner (noted as a gap since Milestone 1's
  own migration comment); a real deployment would create a dedicated
  non-owner role for this.
- No cron/systemd timer actually runs `purge-retention.js` on a schedule
  in this dev setup — it's a script, run by hand or wired into a real
  deployment's crontab, per its own file comment.
- The admin panel's revoke button doesn't track "already revoked" state
  client-side (no visual change after a successful revoke besides the new
  audit_log entry) — a small UI gap, not a functional one; the revoke
  itself is real and immediately effective, as the browser verification
  above confirms.

### Next up

Milestone 8 (hardening + demo): rate limits, error states, empty states,
a seeded demo dataset, a Playwright happy-path test, README polish, an
architecture diagram, a deployed URL. Done-when per the spec: a cold
`git clone` → `docker compose up` → `npm run seed` gives a working demo.

## Milestone 6 follow-up — KYC/review UI polish pass (done)

Before starting Milestone 7, went back over the guest KYC flow and the
admin review screen for usability, since Milestone 6 shipped them
functionally correct but visually bare. Verified for real in the browser
(not just a visual read of the JSX) — re-ran both the auto-pass and the
duplicate-document-review paths through the actual rendered UI.

- **`LivenessCapture.jsx` reworked**: the camera preview is now mirrored
  (`-scale-x-100`) so it feels like a normal selfie camera — the *captured
  frame itself* is deliberately left unmirrored, since that's what
  actually gets compared against the ID photo and a real selfie/ID
  comparison shouldn't be flipped. Added a 3-second countdown before
  capture starts (time to react to the prompt), a 6-frame progress bar
  during capture (was silent "Capturing…" text before), specific
  `NotAllowedError`/`NotFoundError`/timeout messages instead of a raw
  `err.message` dump, and a "done" state showing the actual captured
  thumbnail with a "Retake" option instead of just a checkmark and text.
- **`GuestKycPage.jsx`**: added a 3-step progress indicator (Document →
  Selfie → Consent) that fills in as each part is completed, and replaced
  both bare `<input type=file>` elements with a dropzone-style picker that
  shows a thumbnail preview and filename instead of the browser's blunt
  "No file chosen" text.
- **`AdminReviewPage.jsx`**: the face-match line is now a colour-coded
  badge (green ≥0.4 / amber ≥0.25 / red below, or a specific red badge for
  `no_face`/`multiple_faces` — kept in sync with `FACE_MATCH_THRESHOLD`
  via a comment) instead of a line of plain text a reviewer had to parse.
  Both images are click-to-zoom into a full-screen lightbox — reviewing a
  face match from two 200px thumbnails wasn't practical. Reject now asks
  for confirmation inline in the app's own styling instead of
  `window.confirm()`, which (found by actually testing it) auto-dismisses
  silently in an automated/embedded browser context and is a jarring,
  inconsistent look next to everything else on the page regardless.

## Milestone 6 — Face matching, FAR/FRR study, liveness challenge (done)

Deliverable per the build spec: real face matching replacing the
Milestone 4 stub, a measured FAR/FRR threshold sweep with a chart
committed to `docs/`, and an active liveness challenge. Done-when: chart
committed, threshold chosen and justified here. Verified end to end
through the real browser UI (not just the 58 automated tests this
milestone brought the issuer suite to) — a matching doc+selfie pair
auto-issues a credential; a mismatched pair routes to human review, and
the admin review screen shows both images side by side with the
face-match score.

### What works

- **Real face detection and 128-d embeddings** via `@vladmandic/face-api`
  (`issuer/src/pipeline/facematch.js`) — `ssdMobilenetv1` for detection,
  `faceLandmark68Net` + `faceRecognitionNet` for the embedding, compared
  by Euclidean distance. Not a heuristic or a stub: this is the same
  library and model weights the spec names, actually running inference on
  actual JPEG bytes.
- **Explicit handling of the three ways a face-match can fail** (Section
  9.4), each its own status rather than a crash or a silent wrong answer:
  `id_photo_no_face` / `selfie_no_face`, `id_photo_multiple_faces` /
  `selfie_multiple_faces`, and a genuine below-threshold score. All three
  route to `NEEDS_REVIEW`, never a hard rejection — a human can still look
  at the actual photos and decide.
- **A measured FAR/FRR sweep** (`scripts/face-far-frr-sweep.js`), fetching
  40 genuine + 40 impostor pairs live from LFW (Labeled Faces in the
  Wild) via its `logasja/lfw` mirror on Hugging Face's dataset-viewer API
  — the "public dataset like LFW" option Section 0/9.2 names explicitly.
  31 of each were usable (a handful skipped where the detector
  legitimately couldn't find exactly one face — profile shots,
  occlusion). Threshold swept 0.30–0.80 in steps of 0.05; results and
  chart committed to [`docs/face-match-far-frr.md`](docs/face-match-far-frr.md)
  and [`docs/face-match-far-frr-chart.svg`](docs/face-match-far-frr-chart.svg).
- **Chosen operating point: `FACE_MATCH_THRESHOLD = 0.6`** — measured FAR
  0.0%, FRR 3.2%. Per Section 9.2's own guidance, biased toward rejecting
  borderline matches (which just fall through to human review, not a hard
  rejection) rather than accepting an impostor. It's the *most permissive*
  threshold tested that still keeps FAR at 0%, not the strictest — loosening
  it further would start letting impostor pairs through; tightening it
  further only adds more genuine pairs to the review queue for no FAR
  benefit.
- **An active liveness challenge** (Section 9.3):
  `issuer/src/pipeline/liveness.js`'s `checkLiveness()` takes 3–10 captured
  frames and checks exactly the two things the spec asks for — a face
  detected in every frame, and the frames actually differing from each
  other by more than a noise threshold (mean greyscale pixel difference).
  `POST /kyc/liveness/check` is a public pre-check the frontend calls
  before letting the guest upload the captured frame as their selfie.
  `web/src/components/LivenessCapture.jsx` drives the browser camera
  (`getUserMedia`), shows one of four random prompts ("Blink twice", "Turn
  your head left, then right", "Smile", "Nod your head"), captures 4
  frames ~400ms apart, and on a pass uses the last frame as the selfie —
  same presigned-upload path as before.
- **KYC pipeline gating now actually uses the face-match result**:
  `autoPass` in `issuer/src/routes/kyc.js` requires OCR passing, no
  duplicate-document fraud flag, *and* `faceMatch.matched`. A new
  `face_match_status` column (migration
  `1735100000000_add-face-match-status`) plus the existing `face_score`
  column are both surfaced to the human reviewer in `GET /review` and
  rendered in `AdminReviewPage.jsx` alongside the doc and selfie images
  side by side — previously the selfie image was fetched by the backend
  but never actually rendered on that page at all.
- **A "no camera? upload a photo instead" fallback** on the guest KYC
  page, since not every guest (or every browser) has camera access — the
  plain file-upload path from Milestone 4 still works and still goes
  through the same real face-match pipeline, just without the liveness
  pre-check.

### Bugs found and fixed while building this (worth knowing for the viva)

- **`@tensorflow/tfjs-node@4.22.0` (the latest published release) is
  broken on Node 26.x** — a real, currently-open upstream bug
  ([tensorflow/tfjs#8746](https://github.com/tensorflow/tfjs/issues/8746)),
  not an environment misconfiguration. Its compiled native-binding layer
  calls a `tfjs-core` util function (`isNullOrUndefined`) that was removed
  from the `tfjs-core` version it itself depends on; the fix merged
  upstream (`tensorflow/tfjs#8425`) but was never published to npm. A bare
  `tf.tensor([1,2,3])` smoke test passes (misleadingly), but any real
  inference op crashes. Found by actually running face-api's detection
  pipeline, not by reading changelogs. Worked around by using face-api's
  alternate WASM-backend Node build
  (`@vladmandic/face-api/dist/face-api.node-wasm.js` +
  `@tensorflow/tfjs-backend-wasm`) instead of its default entry point,
  which never touches the native binding — slower per-inference, fully
  acceptable for a per-submission KYC pipeline that isn't real-time video.
- **Embedding a test face photo into the synthetic ID card fixture broke
  the quality gate** (`too_bright`, 221.3 vs. the 220 max) — not a face-api
  bug, a test-fixture bug. The card's own background colour is already
  right at brightness ~218.6 out of the 220 ceiling; naively extending the
  canvas with more near-white margin to fit the face pushed the average
  over. Fixed by using a neutral grey margin instead of the card's own
  near-white background for the appended photo area (`test/helpers.js`).
  Also fixed: the default `makeCardBuffer()` (no options) no longer embeds
  a face at all, so every pre-existing quality/OCR test keeps the exact
  metrics it was calibrated against — only the KYC/review/revocation
  tests that need a real matchable face opt in explicitly via
  `{ faceBuffer: FACE_A }`.
- **The FAR/FRR sweep script's own threshold-selection logic picked the
  worst threshold, not the best one**, on the first run: `rows.find(r =>
  r.far <= 0.05)` returns the *smallest* threshold satisfying the bound
  (0.30, FRR 90.3% — useless), not the most permissive one still meeting
  it. Fixed to filter then take the last (largest) match, which correctly
  lands on 0.60.
- **A new migration column got written but never run before the first
  real submission** — `face_match_status` caused a bare Postgres
  `column "face_match_status" does not exist` 500 the moment a real KYC
  submission tried to write it, because `npm run migrate:issuer` was a
  step I'd written down but not actually executed yet. Caught immediately
  by running the affected test/route directly rather than trusting the
  green test run from before the migration existed.
- Both bugs above cascaded into unrelated-looking test failures
  (`review.test.js`, `revocation.test.js`, the duplicate-document fraud
  test) that were really the same one or two root causes each — a
  reminder to chase the first real error message rather than patching
  each failing assertion individually.

### Notable decisions worth defending in the viva

- **Dataset for the FAR/FRR study: LFW, fetched live via Hugging Face's
  dataset-viewer API, never downloaded to disk or committed.** The spec
  names this exact option. LFW's own `pairsDevTest` split is already
  genuine/impostor labelled (its `logasja/lfw` "pairs" config exposes this
  directly as `pair: 1`/`pair: 0`), which is exactly the labelled-pairs
  structure Section 9.2 asks for — no manual pairing process needed.
- **Test *fixtures* (the two faces reused across the automated test
  suite) are deliberately NOT LFW** — they're two images from
  thispersondoesnotexist.com, a StyleGAN model that generates faces of
  people who do not exist. The FAR/FRR *study* uses real people's photos
  (LFW) because that's what an accuracy measurement needs and the spec
  explicitly sanctions it, run once, transiently, never committed. Things
  permanently checked into the repo and run on every `npm test` are a
  different judgement call — using AI-generated, not-a-real-person faces
  there sidesteps any privacy/consent question entirely rather than
  relying on LFW's academic-research licensing for a use LFW wasn't
  specifically built for.
- **WASM backend over the native `tfjs-node` binding** — not a
  workaround of convenience but the only currently-working option on this
  environment's Node version, given the confirmed-open upstream bug above.
  Documented so a future "why is this using WASM, that's unusual" question
  has a real answer with a linked GitHub issue, not "it just worked."
- **Liveness checks motion + face-presence, not the specific prompted
  gesture.** Verifying "did this person actually blink" or "did the head
  turn the prompted direction" needs real per-frame landmark-sequence
  analysis (eye-aspect-ratio time series, head-pose estimation) that this
  project doesn't attempt — and critically, this environment has no
  camera to record real test sequences to calibrate such a thing against
  in the first place. Section 9.3's own wording only asks for "frames
  differ AND a face is present throughout," which is exactly what's
  implemented: honest, tractable, and still genuinely defeats the
  specific attack named (a flat printed photo, motionless, held up to a
  camera) regardless of which prompt was shown.
- **The live-camera capture UX could not be exercised end-to-end in this
  session's automated browser pane** — it has no camera device, and
  `getUserMedia` is blocked outright rather than rejecting with a normal
  permission error (it can hang indefinitely instead, which the component
  now guards with an 8s timeout — a real robustness fix this discovery
  motivated, not just a workaround for the test environment). What *was*
  verified for real: the `/kyc/liveness/check` endpoint and its underlying
  `checkLiveness()` logic (real face-api inference, real frame-difference
  computation, via Supertest against real synthetic frames), and the
  entire rest of the KYC flow including the fallback file-upload selfie
  path, driven through the actual rendered browser UI.
- A recurring macOS-only warning worth knowing about, not a test failure:
  `objc[...]: Class GNotificationCenterDelegate is implemented in both
  ...sharp-libvips...dylib and ...canvas...libgio...dylib`. Both `sharp`
  and `canvas` bundle their own native image libraries, and on this
  platform they both happen to register the same Objective-C class name.
  It's a real warning ("may cause spurious casting failures and
  mysterious crashes") that didn't manifest as an actual failure across
  many full test runs here, but it's the kind of thing worth mentioning
  if asked about test flakiness on macOS specifically.

### What was stubbed/deferred

- The FAR/FRR threshold is tuned on LFW's selfie-vs-selfie-quality pairs,
  not on real ID-photo-vs-selfie pairs (this project's actual use case,
  which the spec itself calls harder) — documented explicitly in
  `docs/face-match-far-frr.md` as a starting point, not a validated
  production number.
- Liveness has no resistance to a video replay of a real person or a 3D
  mask — by design and by the spec's own scoping, "defeats casual photo
  attacks" only.
- The four liveness prompts are frontend copy only; nothing server-side
  ties a specific prompt to a specific expected motion.

### Next up

Milestone 7 (compliance): register view, Form C export, consent ledger,
retention purge job, audit log viewer, revocation + admin panel. Done-when
per the spec: revoking a credential makes the next check-in fail with a
clear reason.

## Milestone 5 — Check-in (done)

Deliverable per the build spec: session + nonce QR, guest wallet consent
screen with per-claim toggles, presentation, verification, desk screen
flips to VERIFIED, guest register row created. Done-when: the five
replay-rejection tests pass. Verified for real, end to end, through the
actual browser UI — booked a room, ran KYC, staff generated a QR, guest
selected which claims to share, approved, and the desk screen flipped to
VERIFIED showing only the disclosed claims — not just via the 148 automated
tests this milestone brought the suite to.

This is the other cryptographically central milestone besides Milestone 3
— everything in Section 9.4 (replay defence) lives here.

### What works

- **Real SD-JWT+KB presentations**, not a simplified stand-in: extended
  `packages/credentials` with `buildPresentation`/`verifyPresentation`,
  implementing the actual IETF SD-JWT key-binding format — `<credential
  JWT>~<disclosure>~...~<key-binding JWT>`. The KB-JWT is signed by the
  guest's own device key (ECDSA P-256, generated client-side via WebCrypto
  in Milestone 4, non-extractable) over `{ nonce, aud: hotelId, iat }`.
  Verifying it means extracting `cnf.jwk` from the *already-verified*
  credential and checking the KB-JWT was signed by that exact key — proof
  of possession, not just proof the JWT exists.
- **`api/src/routes/checkin.js`**: `POST /checkin/sessions` (staff,
  tenant-scoped, generates a 90s single-use nonce + a real QR code image
  via the `qrcode` package), `GET /checkin/sessions/:id` (staff polls),
  `POST /checkin/sessions/:id/present` (public — no api JWT at all;
  security comes entirely from the signed presentation, not from being
  logged into HotelVerify), `POST /checkin/sessions/:id/complete` (staff,
  flips the booking to `CHECKED_IN`).
- **Single-use nonce enforcement via a Postgres atomic status transition**
  (`UPDATE checkin_sessions SET status = 'VERIFIED' WHERE id = $1 AND
  status = 'PENDING'`), the same structural pattern `room_availability`'s
  composite PK uses for booking concurrency (Milestone 2) — not Redis, even
  though the spec suggests Redis nonce-caching. See decisions below for why.
- **The five replay-rejection cases (Section 9.4), tested at two layers**:
  once in `packages/credentials` against the bare crypto functions, and
  again in `api/test/checkin.test.js` against the real HTTP route with a
  real session in Postgres — unknown/wrong nonce, a nonce reused for a
  second presentation, hotelId/audience mismatch, a presentation older
  than the 90s freshness window, and a key-binding JWT signed by the wrong
  device key. Plus a sixth: the session itself outright expired, which is
  a distinct failure mode from a stale presentation timestamp (a session
  can expire with no presentation ever attempted).
- **Offline verification with a real demo toggle** (Section 3e):
  `api/src/services/issuerClient.js` caches the issuer's JWKS (1h TTL) and
  revocation list (5min TTL, matching the spec) in Redis. `POST
  /admin/network/offline` (`PLATFORM_ADMIN` only) makes it skip the live
  fetch entirely and serve only what's cached — tested by actually warming
  the cache, flipping the toggle, and confirming a presentation still
  verifies with zero network calls to the issuer.
- **Revocation checked on every presentation**, not just at issuance: a
  credential's own `jti` claim (see the credentialId fix below) is looked
  up against the cached revocation list; a revoked credential is rejected
  with `credential_revoked` regardless of how cryptographically valid its
  signature chain is.
- **`guest_register` row created automatically on a verified presentation**,
  using exactly the four disclosed claims the schema requires
  (`fullName`, `idType`, `idLast4`, `nationality`) — a presentation missing
  any of them fails with `missing_required_claims` rather than silently
  writing a partial row.
- **`web/` UI**: `HotelDashboardPage` grew a "Check in" action per
  `RESERVED` booking; `StaffCheckinSessionPage` shows the live QR and polls
  until VERIFIED, then shows exactly the disclosed claims and a "Complete
  check-in" button; `GuestCheckinPresentPage` (reached via the QR's own
  URL) is the actual selective-disclosure moment — four claims locked on
  as required for the register, everything else a genuine per-claim
  checkbox, with a line that says the plain truth: "Nothing you leave
  unchecked is sent — the hotel never even learns that field exists."

### Bugs found and fixed while building this (worth knowing for the viva)

- **Credentials had no way to be checked against a revocation list at
  all.** `issueCredential` never embedded its own future database id
  anywhere in the JWT — there was no `jti`. A verifier receiving a
  presentation had a cryptographically valid credential and no way to ask
  "is this one revoked?" Fixed by generating the credential's id
  *before* signing (in `issuer/src/pipeline/issue.js`), passing it as
  `credentialId` into `issueCredential` (which sets it as `jti`), then
  inserting that same id as the row's primary key instead of letting
  Postgres generate one afterward — the JWT's claimed identity and the
  database row's identity are now guaranteed to be the same value, decided
  once, before either exists.
- **`verifyCredential` trusted a caller-supplied `.value` instead of
  deriving it from the disclosure it had just digest-checked.** Found
  while writing this milestone's presentation tests: a `{ disclosure,
  value }` object with a valid, correctly-hashing `.disclosure` string but
  a *different* `.value` field was accepted, returning the forged value.
  Not exploitable in the real system (every real caller — including the
  new `decodePresentation` — derives `.value` by decoding `.disclosure`
  itself, never carries a separately-supplied one), but the function's own
  contract was looser than it needed to be. Fixed by having it decode
  `.disclosure` itself rather than trust the caller's `.name`/`.value`
  fields, with a test proving a mismatched `.value` is now simply ignored.
  Found the *next* layer of the same issue immediately after:
  `decodeDisclosure` fed attacker-controlled wire input straight into
  `JSON.parse` with no try/catch, so a genuinely corrupted disclosure threw
  a raw `SyntaxError` instead of the module's own `SDJWTError` — fixed with
  validation and a wrapped error, plus tests for both a non-base64url
  string and valid-JSON-wrong-shape input. `packages/credentials` stayed
  at 100% coverage through both fixes.
- **The staff check-in screen's QR code silently vanished 2 seconds after
  appearing.** `GET /checkin/sessions/:id` (used by the staff page's poll
  loop) never selected or returned `qrUrl`/`qrImageDataUrl` at all — only
  the original `POST` response had them. The very first poll replaced the
  page's whole session object with one that had no QR fields, and the
  `<img>` silently rendered with an empty `src`. No automated test caught
  this (none of them asserted on the *second* response in a poll
  sequence); found by actually watching the staff screen in a browser.
  Fixed by having `GET` regenerate the QR from the session's own stored
  nonce/hotelId on every call — cheap, and means a staff member who
  refreshes mid-scan doesn't lose the code either.
- **Two of this milestone's own tests were flaky against Postgres RLS and
  Redis caching** — an "expired session" test used a plain `pool.query`
  for its `UPDATE`, which `checkin_sessions`' `FORCE ROW LEVEL SECURITY`
  silently turned into a 0-row no-op instead of an error (same class of
  mistake Milestone 2 already hit once); an "offline verification" test
  assumed the revocation cache was already warm, when the *previous* test
  in the same file had just deleted it as part of its own cleanup. Both
  fixed — the first by routing the test's own `UPDATE` through
  `withTenantTransaction` like real routes do, the second by having the
  test perform one real online presentation first to actually warm the
  cache before flipping offline.
- **`room_availability`'s composite PK, which is a feature, ate this
  milestone's own test suite on the first run**: every test in
  `checkin.test.js` called a shared `createReservedBooking()` helper
  against the same seeded room with a hardcoded date range, so only the
  first call in the whole file could ever succeed — a direct, if
  self-inflicted, demonstration of Milestone 2's own double-booking
  guarantee working exactly as designed. Fixed with a per-call date offset.

### Notable decisions worth defending in the viva

- **Nonce single-use enforcement is a Postgres atomic status transition,
  not Redis**, despite Section 9.4 explicitly suggesting Redis. Redis here
  is used for what it's actually good at in this system — caching the
  issuer's JWKS/revocation list to avoid a network round-trip on every
  check-in, and enabling the offline-verification demo. `checkin_sessions`
  already has to persist the session's state durably in Postgres regardless
  (staff needs to poll it, `guest_register` needs to reference it); adding
  Redis as a *second* source of truth for the same single-use guarantee
  would mean keeping two stores consistent for no additional correctness
  — the same reasoning that made a Postgres composite PK the right choice
  for booking concurrency in Milestone 2, applied again here.
- **hotelId is accepted from the client on the public `/present`
  endpoint** — which looks like it violates Section 7's "hotel_id comes
  from the JWT, never the client" rule, but it isn't the same situation:
  there is no staff JWT on this endpoint at all (the caller is a guest's
  browser, not logged into HotelVerify), so hotelId is functionally a
  lookup key the guest already received in the QR/URL they scanned, not a
  trust boundary a client could exploit to impersonate staff. The actual
  security — that this presentation was made for *this* session by *this*
  credential's own device — is enforced entirely by
  `verifyGuestPresentation`, independent of what hotelId was supplied for
  the lookup.
- **The mandatory-disclosure set for check-in is `{fullName, idType,
  idLast4, nationality}`**, not the spec's own illustrative sentence
  (`fullName, isAdult, idType, idLast4`) — because `guest_register`'s
  schema (Section 5) has `nationality` as `NOT NULL` and has no `isAdult`
  column at all. Reconciled in favour of what the schema actually needs:
  nationality is a real operational requirement (Form C, Section 8), not
  just a demo detail; `isAdult` stays a genuine optional toggle alongside
  `dateOfBirth`.

### What was stubbed / deferred

- **Guest identity at check-in isn't cross-checked against the booking's
  own guest account.** The presented credential's `fullName` isn't
  compared to anything on the `api`-side booking (which only has an
  email, no name field) — issuer and api identity remain the deliberately
  separate systems Section 4 describes. A real deployment would want some
  binding here; noted as a gap, not silently assumed away.
- **Nothing revokes a `checkin_session` that's simply abandoned** (guest
  never scans, or scans and never approves) before its own 90s
  `expires_at` — it just sits as `PENDING` until a future query happens to
  notice it's expired. No background sweep. Low-stakes at this scale (a
  stale session grants nothing on its own — a presentation for it still
  has to pass every other check), but worth naming.
- **QR codes are shown on-screen, not scanned by a real camera** — this is
  a browser-only demo, so "scanning" is the guest's browser navigating to
  the QR's own encoded URL. The QR image itself is real and would decode
  correctly on an actual phone.

### Next up

Milestone 6 (face matching): real face-api.js embeddings, a labelled
genuine/impostor pair set, FAR/FRR threshold sweep with a committed chart,
and the active liveness challenge. `issuer/src/pipeline/facematch.js`'s
current stub (`{ score: null, stub: true }`) gets replaced with the real
thing here, not before. Not started.

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
