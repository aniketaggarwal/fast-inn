# HotelVerify — Build Specification for an AI Coding Agent

Context: Final-year B.E. Computer Science project (Ramaiah Institute of Technology). Built to be demoed to faculty examiners and shown to recruiters. Scope is ~8 weeks of part-time work, not a startup.

Read this whole document before writing any code. Section 3 (Trust Model) is the heart of the project. Section 9 (Hard Parts) is where most projects fail — read it twice.

## 0. Instructions to the agent

Follow these working rules throughout:

- Build in vertical slices. One feature end-to-end (DB → API → UI → test) before starting the next. Do not build "all the models", then "all the routes". A half-working slice you can demo beats three layers that don't connect.
- Never use real government IDs. Every document in this system is synthetic. Generate fake Aadhaar/passport/DL images with a seed script. If the developer uploads a real ID, the app should still work, but no real IDs go in the repo, fixtures, screenshots, or the demo.
- Do not fake the cryptography. OCR and face matching can be stubbed behind an interface during early milestones. Signature generation and verification must be real from Milestone 3 onward — it is the part that makes this project interesting.
- Every list/read query must be tenant-scoped. See Section 7. Write the failing cross-tenant test first.
- Write the seed script early (npm run seed). A demo that requires 20 minutes of manual clicking to set up will fail at the viva.
- Prefer boring, explainable code. The student has to defend every line to an examiner. No clever metaprogramming, no ORM magic that hides the SQL.
- Log honestly. When OCR confidence is low, say so in the UI. Do not silently auto-approve. The human-in-the-loop review queue is a feature, not a fallback.
- When a milestone is finished, update PROGRESS.md with what works, what doesn't, and known limitations.

## 1. What the product actually is

A hotel guest-identity platform with three parties:

- Guest — verifies their identity once, gets a reusable digital credential, then checks into any participating hotel in seconds.
- Hotel — receives cryptographic proof that the guest is who they claim to be, without ever receiving a copy of the guest's ID document.
- Issuer/Authority — a trusted third party that performs the KYC once and signs the credential. (In real DigiYatra this is the government-backed issuer; here it is a service we build and run ourselves, and we are explicit about that.)

The one-line pitch: Verify once, check in anywhere, and the hotel never stores your ID.

### Why this is not an Airbnb clone

An Airbnb clone is CRUD: listings, bookings, payments. Anyone can build it. The interesting engineering here is:

| Airbnb-style project | HotelVerify |
|---|---|
| Hotel stores photocopy of ID | Hotel stores a signed claim, never the document |
| Guest re-verifies at every hotel | Guest verifies once, reuses credential |
| Trust = "we typed it in correctly" | Trust = digital signature chain, verifiable offline |
| Privacy = a policy page | Privacy = data minimisation enforced by the protocol |

If you strip out the credential layer, you have a generic booking site. Do not strip out the credential layer to save time. Cut booking features instead.

## 2. Scope: what to build and what to refuse

### In scope (must exist for the demo)

- Guest sign-up, one-time KYC, digital credential issuance
- Hotel search + room booking (deliberately simple)
- Contactless check-in at a hotel front desk via QR + credential presentation
- Hotel staff dashboard: arrivals, review queue, occupancy, compliance exports
- Admin panel: onboard hotels, revoke credentials, view audit log
- Guest app (mobile-first PWA): wallet, bookings, consent history

### Explicitly out of scope (say no to these)

- Real Aadhaar / DigiLocker / UIDAI integration. Not legally available to a student project. We simulate the issuer. Say this openly in the report; examiners respect it and penalise pretending.
- Real payments. Use a fake payment step that always succeeds, or Razorpay test mode only if time permits.
- Liveness/anti-spoofing that actually resists attack (see 9.3).
- Hotel PMS integrations (Opera, eZee). Mention as future work.
- Native iOS/Android builds. Build a PWA; wrap in Expo only if Milestone 8 finishes early.
- Multi-language, dark mode, email marketing, chat support.

### Cut list if you fall behind

In this order: payments → fraud scoring → admin analytics → face matching (fall back to manual photo comparison by staff) → mobile wrap. Never cut: credential signing, selective disclosure, tenant isolation, audit log.

## 3. The trust model — read this before coding anything

This is the intellectual core of the project and the thing you will be asked about in the viva.

### The problem

If the guest uploads their own ID and the app just OCRs it, the guest could upload anything. Self-attested data is worthless. Real DigiYatra works because a trusted authority vouches for the identity and the airport only checks the authority's signature.

### Our approach

We build a separate Issuer Service with its own signing keypair. It is deliberately a separate deployable, separate database, separate port — because it represents a different trust domain. Do not merge it into the main API for convenience; the separation is the point.

Flow:

```
1. ISSUANCE (once per guest)
   Guest app  --(ID photo + selfie + consent)-->  Issuer Service
   Issuer: OCR → parse → face-match → human review if low confidence
   Issuer: builds claim set, signs with Ed25519 private key
   Issuer  --(signed credential)-->  Guest app (stored in wallet)
   Issuer: DELETES the raw ID image after issuance (keeps only a hash)

2. PRESENTATION (every check-in)
   Hotel kiosk/desk displays QR containing { checkinSessionId, nonce, hotelId }
   Guest app scans, guest picks which claims to share, taps Approve
   Guest app signs { credential-with-selected-claims, nonce, hotelId, timestamp }
        with the guest's OWN device key
   Guest app POSTs the presentation to the API
   API forwards to Hotel Verifier logic:
       - fetch issuer public key from /.well-known/jwks.json (cached)
       - verify issuer signature on the credential
       - verify guest device signature (proves the presenter holds the credential)
       - verify nonce matches this session, unused, < 90s old
       - check revocation list
       - recompute claim hashes for disclosed claims
   Desk screen flips to VERIFIED with only the disclosed claims shown.
```

### Key design decisions to implement

a) Credential format — SD-JWT style selective disclosure. Do not put plaintext claims in the signed payload. Instead:

- For each claim, generate a random salt. Compute `digest = SHA256(base64url(JSON.stringify([salt, claimName, claimValue])))`.
- The signed JWT payload contains only the array of digests (`_sd`), plus issuer, subject key, issue/expiry times.
- The issuer sends the guest the JWT plus the list of `[salt, name, value]` triples ("disclosures").
- At presentation, the guest transmits the JWT plus only the disclosures they chose.
- The verifier hashes each received disclosure and checks it appears in `_sd`. Undisclosed claims are cryptographically hidden — the verifier learns nothing about them, not even that they exist beyond a count.

This is ~150 lines of code and it is the single most impressive thing in the project. It is a real, published pattern (IETF SD-JWT), so you can cite it.

b) Claims to define (keep the set small and justified):

| Claim | Example | Why a hotel needs it |
|---|---|---|
| fullName | "Aniket S" | Guest register entry |
| dateOfBirth | "2003-05-14" | Age proof |
| isAdult | true | Derived — lets hotel avoid needing DOB at all |
| nationality | "IN" | Determines whether Form C is required |
| idType | "PASSPORT" | Register entry |
| idLast4 | "4417" | Register entry without full number |
| idDocHash | "sha256:..." | Duplicate detection without storing the ID |
| photoThumb | small JPEG, base64 | Optional, for desk staff visual match |
| verifiedAt | ISO timestamp | Freshness |

Demonstrate data minimisation in the demo: a domestic guest at a normal hotel discloses fullName, isAdult, idType, idLast4 — and nothing else. Show the verifier receiving a payload where DOB and nationality are absent. That moment is your best demo beat.

c) Key binding. The guest app generates its own keypair on first run (WebCrypto, Ed25519 or ECDSA P-256; store the private key in IndexedDB, non-extractable if possible). The public key JWK goes into the credential as `cnf.jwk`. Presentations are signed by this key. Without this, a stolen credential is a bearer token anyone can replay.

d) Revocation. Issuer exposes `GET /revocations` returning a version number and list of revoked credential IDs, cached by verifiers for 5 minutes. Admin can revoke. Demo: revoke a credential live, wait for cache expiry (or hit refresh), show check-in now fails. Mention bitstring status lists as the scalable alternative.

e) Offline verification. Because verification only needs the issuer's public key, a hotel desk can verify with no network. Implement `GET /.well-known/jwks.json` caching and add a demo toggle that simulates network loss. Document the honest tradeoff: offline verification cannot check revocation, so stale revocations are a real risk. Discussing this tradeoff intelligently is worth more marks than hiding it.

## 4. System architecture

```
                    ┌──────────────────────────────┐
                    │  guest-app/  (React PWA)     │
                    │  wallet · bookings · consent │
                    └───────┬───────────┬──────────┘
                            │           │
            KYC submit      │           │  presentation
                            ▼           ▼
        ┌──────────────────────┐   ┌──────────────────────────┐
        │  issuer/  :4001      │   │  api/  :4000             │
        │  ─ OCR pipeline      │   │  ─ auth (JWT)            │
        │  ─ face match        │   │  ─ hotels / rooms        │
        │  ─ review queue      │◄──┤  ─ bookings + inventory  │
        │  ─ VC signing (Ed25519)│  │  ─ check-in sessions    │
        │  ─ JWKS + revocation │   │  ─ verifier logic        │
        │  ─ OWN database      │   │  ─ compliance exports    │
        └──────────┬───────────┘   │  ─ audit log             │
                   │               └───────┬──────────────────┘
          issuer_db (PG)                   │
                                     app_db (PG) · Redis · MinIO
                                           ▲
                    ┌──────────────────────┴───────┐
                    │  web/  (React + Vite)        │
                    │  hotel dashboard · admin     │
                    └──────────────────────────────┘
```

### Repo layout (monorepo, npm workspaces)

```
hotelverify/
├─ docker-compose.yml          # postgres, redis, minio, mailhog
├─ package.json                # workspaces
├─ PROGRESS.md
├─ packages/
│  └─ credentials/             # SHARED — SD-JWT issue/verify, key utils
│     ├─ src/sdjwt.js
│     ├─ src/keys.js
│     └─ test/sdjwt.test.js
├─ issuer/
│  ├─ src/routes/{kyc,review,jwks,revocation}.js
│  ├─ src/pipeline/{ocr,parse,facematch,quality}.js
│  ├─ migrations/
│  └─ keys/                    # gitignored; generated by npm run keygen
├─ api/
│  ├─ src/routes/{auth,hotels,rooms,bookings,checkin,compliance,admin}.js
│  ├─ src/middleware/{auth,tenant,audit,rateLimit}.js
│  ├─ src/services/verifier.js
│  └─ migrations/
├─ web/                        # hotel + admin, React + Vite + Tailwind
├─ guest-app/                  # PWA, React + Vite + Tailwind
└─ scripts/
   ├─ seed.js
   └─ make-fake-ids.js
```

### Stack (already decided — do not substitute)

- Node.js 20 + Express, plain SQL via `pg` (no heavy ORM; use `node-pg-migrate` for migrations)
- PostgreSQL 16, Redis 7, MinIO (S3-compatible, runs locally — same SDK as AWS S3)
- React 18 + Vite + Tailwind CSS
- `tesseract.js` (OCR), `@vladmandic/face-api` or `face-api.js` (embeddings), `sharp` + opencv4nodejs-free preprocessing via `sharp` only if possible
- `jose` for JWT/JWS/JWK, `argon2` for passwords
- Vitest + Supertest for tests, Playwright for one end-to-end happy path
- Docker + docker-compose, GitHub Actions CI

## 5. Data model

### issuer_db

```sql
guests(id, phone_hash, device_pubkey_jwk, created_at)
kyc_submissions(id, guest_id, doc_type, doc_object_key, selfie_object_key,
                ocr_json, ocr_confidence, face_score, status,
                reviewer_id, review_note, created_at, decided_at)
   -- status: PENDING | AUTO_PASS | NEEDS_REVIEW | APPROVED | REJECTED
credentials(id, guest_id, jwt, disclosures_json, doc_hash,
            issued_at, expires_at, revoked_at, revoke_reason)
issuer_audit(id, actor, action, subject_id, meta_json, at)
```

`doc_object_key` and `selfie_object_key` are nulled and the objects deleted once a credential is issued. Only `doc_hash` survives, for duplicate detection.

### app_db

```sql
users(id, email, password_hash, role, hotel_id NULL, created_at)
   -- role: GUEST | HOTEL_STAFF | HOTEL_ADMIN | PLATFORM_ADMIN
hotels(id, name, city, address, gstin, status, created_at)
rooms(id, hotel_id, room_number, room_type, base_price)
room_availability(room_id, stay_date, booking_id NULL)   -- PK (room_id, stay_date)
bookings(id, hotel_id, room_id, guest_user_id, check_in, check_out,
         status, total_amount, created_at)
   -- status: RESERVED | CHECKED_IN | CHECKED_OUT | CANCELLED | NO_SHOW
checkin_sessions(id, booking_id, hotel_id, nonce, status, expires_at,
                 verified_claims_json, verified_at)
guest_register(id, hotel_id, booking_id, full_name, id_type, id_last4,
               nationality, arrival_at, departure_at, credential_id, created_at)
form_c_records(id, guest_register_id, passport_no_last4, visa_type,
               arrival_from, generated_at, exported_at)
consents(id, guest_user_id, hotel_id, booking_id, claims_disclosed_json,
         purpose, granted_at, expires_at, withdrawn_at)
audit_log(id, actor_user_id, actor_role, hotel_id, action, entity,
          entity_id, meta_json, ip, at)
```

Two notes the examiner will like:

- `room_availability` with PK `(room_id, stay_date)` makes double-booking structurally impossible — the insert fails on conflict. Do not implement availability as a range query with an application-level check.
- `audit_log` is append-only. Grant the app role INSERT and SELECT on it, never UPDATE or DELETE. Show the grant in the report.

## 6. API surface (abbreviated)

Issuer (:4001)

```
POST /kyc/submit              multipart: doc, selfie, consent flags
GET  /kyc/:id/status
POST /review/:id/decide       staff only { decision, note }
POST /credentials/issue       internal, after approval
GET  /.well-known/jwks.json   public
GET  /revocations             public, { version, revokedIds[] }
POST /admin/revoke/:credId    admin only
```

API (:4000)

```
POST /auth/register | /auth/login | /auth/refresh
GET  /hotels?city=&from=&to=
GET  /hotels/:id/availability?from=&to=
POST /bookings                    { hotelId, roomType, from, to }
GET  /bookings/mine
POST /checkin/sessions            staff: { bookingId } → { sessionId, nonce, qrPayload }
POST /checkin/sessions/:id/present  guest: { presentation }   ← the core endpoint
GET  /checkin/sessions/:id        staff polls (or SSE) for status
POST /checkin/sessions/:id/complete
GET  /hotel/arrivals?date=
GET  /hotel/register?from=&to=    paginated guest register
GET  /hotel/exports/form-c.csv
GET  /admin/hotels | /admin/audit
```

## 7. Multi-tenancy (do not get this wrong)

Every hotel-scoped row carries `hotel_id`. Rules:

- `hotel_id` comes from the authenticated JWT, never from the request body or query string. If a client sends `hotelId`, ignore it.
- A `tenantScope` middleware attaches `req.hotelId` and every query in hotel routes must include `WHERE hotel_id = $1`. Enforce with a code review checklist item.
- Defence in depth: enable Postgres Row-Level Security on `bookings`, `guest_register`, `checkin_sessions`, `consents`. Set `SET LOCAL app.hotel_id = ...` per transaction and write RLS policies against `current_setting('app.hotel_id')`.
- Write these tests before the features: staff of Hotel A requesting a Hotel B booking by ID gets 404, not 403 (403 leaks existence). Same for exports, sessions, register rows.

## 8. Compliance features (the "why hotels would pay" part)

- Guest register: Indian hotels are required to maintain a register of guests. Auto-populate it from verified check-ins. Show that the register contains `idLast4`, never the full number.
- Form C: required for foreign nationals, submitted to the FRRO. Generate a CSV/PDF for guests where `nationality != "IN"`. Flag them on the arrivals board.
- DPDP Act 2023 alignment (India's data protection law): implement and name these in the UI —
  - explicit consent capture with purpose string, stored in `consents`
  - purpose limitation (a hotel can only read claims disclosed for that booking)
  - retention: nightly job purges `verified_claims_json` and selfies N days after checkout; configurable, default 90 days
  - guest-facing "my data" screen: what was shared, with whom, when; plus withdraw-consent and delete-account actions
  - breach-ready audit trail

Have the agent add a short disclaimer in the README: statutory requirements vary by state and change over time; the implementation is illustrative and was not legally reviewed. This protects you and reads as maturity, not weakness.

## 9. The hard parts (where projects die)

### 9.1 OCR on ID documents

Reality: tesseract.js on a phone photo of an ID gets maybe 60–80% field accuracy. Glare, skew, holograms, and the fancy fonts on Indian IDs all hurt. Anyone claiming 99% is lying or testing on scans.

Do this:

- Preprocess with `sharp`: grayscale → normalise contrast → upscale 2× → light threshold. Measure accuracy before and after; put the numbers in your report.
- Constrain the problem. Don't do free-form OCR. For each doc type write a template parser: run OCR with `tessedit_char_whitelist` per field, then apply strict regexes (Aadhaar `^\d{4}\s?\d{4}\s?\d{4}$` + Verhoeff checksum; passport `^[A-PR-WY][0-9]{7}$`; DL per state format). A field that fails its regex is not extracted, it is flagged.
- Compute a confidence score per field from Tesseract's word confidences. Threshold it.
- Build the human review queue in Milestone 3, not as a fallback later. Low confidence → NEEDS_REVIEW → a staff screen showing the image beside the extracted fields, editable, with approve/reject. This is how real KYC works and it turns your weakest technical component into a deliberate design decision.
- Quality gate before OCR: reject blurry uploads up front using variance-of-Laplacian (blur), mean brightness, and detected document-edge area. Tell the user why ("too blurry, try again in better light"). Cheap to build, hugely improves the demo.

In the report, present OCR accuracy as a measured table, per doc type, per field, before/after preprocessing, with the sample size. Measured mediocre numbers beat unmeasured claims.

### 9.2 Face matching

Reality: face-api.js gives you a 128-d embedding; you compare with Euclidean distance. Selecting the threshold is the entire problem.

Do this:

- Build a small labelled set: ~30 genuine pairs (same person, ID photo vs selfie) and ~30 impostor pairs. Use your own friends/teammates with consent, or a public dataset like LFW.
- Sweep the threshold from 0.3 to 0.8, plot FAR vs FRR, pick the operating point, and justify it. State that you tuned for low FAR (fewer impostors accepted) at the cost of more manual reviews — appropriate for identity verification.
- Include the ROC/threshold chart in the report. This single chart makes the project look like engineering rather than a tutorial.
- Handle the failure cases explicitly: no face detected, more than one face, ID photo too low-res. Each is its own error message, not a crash.
- Know your limits out loud: ID photos are often old, low-resolution, and monochrome-ish; accuracy against them is genuinely worse than selfie-to-selfie. Say so.

### 9.3 Liveness / spoofing

Reality: you cannot build production anti-spoofing in a semester. A printed photo will defeat a naive embedding check.

Do this: implement a lightweight active challenge — random prompt ("blink twice", "turn head left"), capture a short burst of frames, check that frames differ and that a face is present throughout. Then write in the limitations section that this defeats casual photo attacks but not video replay or a 3D mask, and cite that real systems use depth sensors or specialised passive-liveness models. Examiners reward the student who knows the boundary of their own system.

### 9.4 Replay attacks on check-in

A QR code that just contains the credential is a bearer token — photograph it once, reuse forever.

Do this: the QR contains only `{ sessionId, nonce, hotelId }` generated by the hotel, valid 90 seconds, single-use (store nonce in Redis with TTL, delete on use). The guest signs the nonce with their device key. Reject presentations where: nonce unknown, nonce already consumed, hotelId mismatch, timestamp skew > 90s, or the device key doesn't match `cnf.jwk` in the credential. Write a test for each of these five rejections — it's a great slide.

Also: this design keeps the QR tiny (a URL + nonce), avoiding the classic bug of trying to cram a multi-kilobyte JWT into a QR code.

### 9.5 Booking concurrency

Two users booking the last room simultaneously is the classic exam question.

Do this: the `room_availability` table with PK `(room_id, stay_date)`. Booking = one transaction that inserts a row per night; a conflict aborts the whole transaction and returns 409. Then write a test that fires 20 concurrent booking requests for the same room and asserts exactly one succeeds. Run it in CI. This is a five-minute test that impresses everyone.

### 9.6 Document storage

Never make the bucket public. Never serve documents through a permanent URL.

- Upload via short-lived presigned PUT; read via presigned GET valid 60 seconds, generated only for an authorised reviewer.
- Encrypt at rest (MinIO/S3 SSE) and store the object key, never the URL, in the DB.
- Delete raw documents after issuance. Have the retention job actually run and log what it deleted — then show the log in the demo.
- Strip EXIF from uploads (`sharp` does this by default when re-encoding) — GPS coordinates in a selfie are a real leak.

### 9.7 Key management

The issuer's private key is the root of all trust here.

- Generate with `npm run keygen`; write to `issuer/keys/`; add to `.gitignore` and verify it's ignored before the first commit.
- Load from an env var or file path at boot, never a constant in source.
- Give the key a `kid` and publish it in JWKS so you can rotate. Implement rotation as: publish new key alongside old, sign new credentials with new, keep old in JWKS until all credentials signed with it expire. You don't have to perform a rotation — just support it and explain it.
- Be honest in the report: a real deployment uses an HSM or KMS; a file on disk is a known weakness of this implementation.

### 9.8 Fraud signals (nice-to-have, keep simple)

Don't build an ML model. Build three deterministic rules and show them in an admin view:

- Duplicate document: same `doc_hash` bound to a different guest → flag.
- Impossible travel: same credential checked in at two hotels >500 km apart within a window that makes travel implausible → flag.
- Velocity: >N KYC submissions from one device fingerprint per hour → rate-limit.

Rules you can explain beat a model you can't. If asked "why not ML?", the answer is: no labelled fraud data, and unexplainable decisions are bad in an identity system.

## 10. Milestones (8 weeks)

Each milestone ends with: it runs via `docker compose up`, tests pass in CI, PROGRESS.md updated.

| # | Week | Deliverable | Done when |
|---|---|---|---|
| 1 | 1 | Skeleton: compose file, both services boot, health checks, migrations, seed script, auth (register/login/JWT/roles), CI green | `npm run seed` then log in as guest, hotel staff, and admin |
| 2 | 2 | Booking core: hotels, rooms, availability, book/cancel, guest + hotel UI | Concurrency test: 20 parallel bookings → exactly 1 success |
| 3 | 3 | Credentials package: SD-JWT issue + verify, key gen, JWKS, disclosure selection, full unit tests. No UI. | Tests prove an undisclosed claim cannot be recovered from the presentation, and a tampered disclosure fails |
| 4 | 4 | KYC pipeline: upload → quality gate → OCR → template parse → confidence → review queue UI → approve → credential issued → raw doc deleted | Upload a fake ID, get a credential in the wallet; S3 object is gone afterwards |
| 5 | 5 | Check-in: session + nonce QR, guest wallet consent screen with per-claim toggles, presentation, verification, desk screen flips to VERIFIED, guest register row created | The five replay-rejection tests pass |
| 6 | 6 | Face matching + threshold study + liveness challenge; FAR/FRR chart generated by a script into `docs/` | Chart committed; threshold chosen and justified in PROGRESS.md |
| 7 | 7 | Compliance: register view, Form C export, consent ledger, retention purge job, audit log viewer, revocation + admin panel | Revoke a credential → next check-in fails with a clear reason |
| 8 | 8 | Hardening + demo: rate limits, error states, empty states, seeded demo dataset, Playwright happy path, README, architecture diagram, deployed URL | A cold `git clone` → `docker compose up` → `npm run seed` gives a working demo |

## 11. Testing requirements

Minimum set — CI fails without these:

- Unit: SD-JWT round-trip; tampered signature rejected; tampered disclosure rejected; expired credential rejected; revoked credential rejected; undisclosed claim not derivable.
- Concurrency: 20 parallel bookings, exactly one wins.
- Tenancy: Hotel A staff cannot read Hotel B's booking / register / session / export — all return 404.
- Replay: unknown nonce, reused nonce, wrong hotel, stale timestamp, wrong device key — five separate tests.
- Authz matrix: a table-driven test of every route × every role, asserting allowed/denied.
- E2E (Playwright): register → KYC → approve → book → check-in → register row appears.

Target ~60% line coverage but 100% on `packages/credentials`. Say exactly that in the README; it shows you know coverage targets should be risk-weighted.

## 12. What to put in the report / viva

Prepare answers for these — they will be asked:

- "How is this different from just storing a photo of the ID?" → data minimisation + signature chain + the hotel never holds the document. Demo the payload with DOB absent.
- "What if the guest's phone is lost?" → the credential is useless without the device private key; guest re-issues; old credential revoked.
- "Who is the issuer in real life?" → in production, a government-backed or regulated KYC provider. We simulate it and disclose that; the protocol is unchanged.
- "Your OCR isn't very accurate." → correct, here are the measured numbers, which is exactly why there is a confidence threshold and a human review queue. Automation rate is X%, and the residual goes to a human.
- "Can this be spoofed with a printed photo?" → the active challenge defeats casual attacks; video replay and masks are out of scope and here's what production systems use instead.
- "Why not blockchain?" → we need a trusted issuer's signature, not distributed consensus. Verification is a local public-key check; a ledger adds latency and cost with no added trust. (This is a very common examiner question and a confident, correct answer lands well.)
- "How does a hotel verify with no internet?" → cached JWKS; and then honestly name the revocation-staleness tradeoff.

Include in the written report: architecture diagram, ER diagram, sequence diagrams for issuance and presentation, the OCR accuracy table, the FAR/FRR chart, the threat model table, and a limitations section (this is where marks are won, not lost).

### Resume bullets this actually earns you

Write them from measured results, not aspirations:

- Designed and built a three-party digital identity system (issuer / holder / verifier) using SD-JWT selective disclosure with Ed25519 signatures, enabling hotels to verify guest identity without ever storing ID documents.
- Implemented cryptographic replay protection (single-use nonces, device key binding, 90s TTL) and offline verification via cached JWKS; documented the revocation-staleness tradeoff.
- Built a KYC pipeline (image quality gating → preprocessing → Tesseract OCR → template parsers with checksum validation → confidence-thresholded human review), raising field-level extraction accuracy from X% to Y% on N synthetic documents.
- Tuned a face-matching threshold from a labelled pair set using FAR/FRR analysis; selected an operating point prioritising low false accept.
- Enforced multi-tenant isolation with JWT-derived scoping plus Postgres row-level security, verified by cross-tenant tests; guaranteed booking integrity with a composite-key availability table proven under a 20-way concurrency test.
- Implemented DPDP-aligned consent ledger, purpose limitation, retention purge jobs, and an append-only audit log.

## 13. First command to give the agent

Read HOTELVERIFY_BUILD_SPEC.md in full. Then implement Milestone 1 only: monorepo with npm workspaces, docker-compose (Postgres, Redis, MinIO), issuer/ and api/ Express services with health endpoints, node-pg-migrate setup with the initial schema from Section 5, argon2 password auth with JWT access/refresh and the four roles, the tenant-scoping middleware stub, scripts/seed.js creating 2 hotels / 6 rooms / 1 platform admin / 2 hotel staff / 3 guests, Vitest + Supertest wired up with the auth tests and the cross-tenant 404 test, and a GitHub Actions workflow running lint + tests. Do not start Milestone 2.

Then review what it produced yourself before letting it continue. You have to defend this code — read every file it writes at least once.
