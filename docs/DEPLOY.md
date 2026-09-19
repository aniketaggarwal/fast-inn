# Deploying HotelVerify

The whole product ships as **one container** (`Dockerfile`): web, api, issuer,
plus a private Redis and MinIO, all behind a single port. Its only external
dependency is Postgres. `scripts/serve.js` is the entrypoint — it migrates,
seeds an empty database, starts everything, and only opens the port once api
and issuer are healthy.

## Render (one file, a few clicks)

`render.yaml` is a Blueprint: a Postgres database + one Docker web service.

1. The repo is at <https://github.com/aniketaggarwal/fast-inn> (`origin/main`).
2. On [render.com](https://render.com): **New + → Blueprint**, pick the repo, **Apply**.
3. First build takes several minutes (native deps, MinIO download). When it's
   live, open the service URL. Get the shared demo password from the service's
   **Environment** tab (`DEMO_PASSWORD`) — the login page also shows tap-to-fill
   accounts while `DEMO_MODE=true`.

Cost/plan notes: the `standard` web plan is deliberate — the issuer loads
face-recognition models and Tesseract per KYC request, and a 512 MB instance
is likely to be OOM-killed. Render's free Postgres expires after 30 days.
Plan names change; check `render.yaml` against current pricing.

Any host that runs a Dockerfile and provides a Postgres URL works the same way
(Fly.io, Railway, a VPS): set the env vars below, expose `$PORT`.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | One Postgres database; the api and issuer keep separate migration tables in it |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | Random, distinct |
| `ISSUER_SERVICE_TOKEN` | yes | Shared secret between api and issuer (same container) |
| `PORT` | no | Defaults to 10000 |
| `DEMO_MODE` | no | `true` shows tap-to-fill logins and the synthetic-ID generator. Leave **off** for anything that isn't a throwaway demo |
| `DEMO_PASSWORD` | no | Password for every seeded account (default `Password123!`) |
| `GATEWAY_PROXY_HOPS` | no | `1` behind a load balancer, so per-client rate limits see real client IPs |

## What a redeploy resets

- **The issuer's signing key.** It's a generated file inside the container, so
  credentials issued before a redeploy stop verifying (their key is gone from
  the JWKS) and guests re-verify. Mount a persistent disk at `ISSUER_KEYS_DIR`
  to keep it.
- Redis (a cache) and MinIO (KYC images that live for seconds before being
  deleted) — nothing of value.

Bookings, users, consents and the audit log are in Postgres and survive.

## Public-demo caveats

- With `DEMO_MODE` on, the admin login is on the login page. Anyone can use the
  admin panel, revoke credentials, and see the review queue. Fine for a demo of
  throwaway data; don't put real documents in it.
- Rate limiting is per client IP, in memory (per process) — adequate here, not
  a substitute for an edge WAF on a real service.

## Status

`scripts/serve.js` — the part that does the work — was run and exercised end to
end locally (single database, its own Redis and MinIO, a full KYC through the
gateway). The **Dockerfile and `render.yaml` have not been built or deployed**:
Docker isn't installed on the machine this was written on. Expect to iterate on
the first build (most likely spots: an apt package name, or a plan name).
