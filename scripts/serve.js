// Production/container entrypoint: everything HotelVerify needs in ONE
// process tree, behind the gateway on $PORT. Used by the Dockerfile.
//
// The only external dependency is Postgres (DATABASE_URL). Redis and MinIO
// run alongside — both hold nothing that outlives a restart:
//   - Redis only caches the issuer's JWKS/revocation list (refetched on demand)
//   - MinIO only holds KYC images for the seconds between upload and
//     credential issuance (Section 9.6 deletes them right after)
// What does NOT survive a restart is the issuer's signing key (a generated
// file) — credentials issued before a redeploy stop verifying, because their
// key is no longer in the JWKS. Fine for a demo; a real deployment would
// mount a persistent disk at ISSUER_KEYS_DIR.
//
// Postgres is one database, not two: the api and issuer each keep their own
// migration history, so the issuer's runs under its own table name
// (issuer_migrations) instead of colliding on node-pg-migrate's default.
//
// Required env : DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ISSUER_SERVICE_TOKEN
// Optional env : PORT (10000)  DEMO_MODE  DEMO_PASSWORD  REDIS_URL
//                GATEWAY_PROXY_HOPS (1 behind a hosting load balancer)
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");
const { startGateway } = require("./demo-gateway");
const { portOpen, waitFor: waitForRaw, healthy, createSupervisor } = require("./lib/proc");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 10000;
const API_PORT = 4100;
const ISSUER_PORT = 4101;
const REDIS_PORT = Number(process.env.INTERNAL_REDIS_PORT) || 6379;
const MINIO_PORT = Number(process.env.INTERNAL_MINIO_PORT) || 9000;
const BUCKET = process.env.S3_BUCKET || "hotelverify-kyc";

const log = (msg) => console.log(`[serve] ${msg}`);
function fail(msg) {
  console.error(`[serve] FATAL: ${msg}`);
  supervisor.killAll();
  process.exit(1);
}
const supervisor = createSupervisor({ logDir: process.env.SERVE_LOG_DIR || "/tmp/hotelverify-logs", onFatal: fail });
const waitFor = (check, label, ms = 90000) => waitForRaw(check, label, ms, fail);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    supervisor.killAll();
    process.exit(0);
  });
}

for (const name of ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "ISSUER_SERVICE_TOKEN"]) {
  if (!process.env[name]) fail(`missing required environment variable ${name}`);
}

function run(cwd, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`\`${cmd} ${args.join(" ")}\` failed:\n${r.stdout}${r.stderr}`);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const internal = { HOST: "127.0.0.1", TRUST_PROXY: "1" };

  let redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    log("starting Redis");
    supervisor.launch("redis", "redis-server", ["--port", String(REDIS_PORT), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no"]);
    await waitFor(() => portOpen(REDIS_PORT), "Redis", 20000);
    redisUrl = `redis://127.0.0.1:${REDIS_PORT}`;
  }

  // Random per boot: only the issuer and MinIO ever use these — browsers
  // reach storage through presigned URLs, never with these credentials.
  const s3 = {
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || "hv" + crypto.randomBytes(8).toString("hex"),
    S3_SECRET_KEY: process.env.S3_SECRET_KEY || crypto.randomBytes(24).toString("hex"),
    S3_BUCKET: BUCKET,
  };
  // Always the bundled MinIO: the gateway routes the bucket path to it, and
  // presigned URLs are signed for the public origin (S3_PUBLIC_ENDPOINT=auto).
  log("starting MinIO");
  supervisor.launch("minio", "minio", ["server", process.env.MINIO_DATA_DIR || "/tmp/minio-data", "--address", `127.0.0.1:${MINIO_PORT}`], {
    env: { MINIO_ROOT_USER: s3.S3_ACCESS_KEY, MINIO_ROOT_PASSWORD: s3.S3_SECRET_KEY },
  });
  await waitFor(() => portOpen(MINIO_PORT), "MinIO", 30000);

  log("migrating database");
  run(path.join(ROOT, "api"), "npx", ["node-pg-migrate", "-m", "migrations", "up"], { DATABASE_URL: dbUrl });
  run(path.join(ROOT, "issuer"), "npx", ["node-pg-migrate", "-m", "migrations", "-t", "issuer_migrations", "up"], { DATABASE_URL: dbUrl });

  const pool = new Pool({ connectionString: dbUrl });
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM hotels");
  await pool.end();
  if (rows[0].n === 0) {
    log("seeding demo data");
    run(ROOT, "node", ["scripts/seed.js"], { DATABASE_URL: dbUrl });
  }

  log("starting api + issuer");
  supervisor.launch("api", "node", ["src/server.js"], {
    cwd: path.join(ROOT, "api"),
    env: { ...internal, PORT: String(API_PORT), REDIS_URL: redisUrl, WEB_BASE_URL: "auto", ISSUER_BASE_URL: `http://127.0.0.1:${ISSUER_PORT}` },
  });
  supervisor.launch("issuer", "node", ["src/server.js"], {
    cwd: path.join(ROOT, "issuer"),
    env: { ...internal, ...s3, PORT: String(ISSUER_PORT), S3_ENDPOINT: `http://127.0.0.1:${MINIO_PORT}`, S3_PUBLIC_ENDPOINT: "auto" },
  });
  await waitFor(healthy(API_PORT), "api");
  await waitFor(healthy(ISSUER_PORT), "issuer");

  await startGateway({
    port: PORT,
    apiPort: API_PORT,
    issuerPort: ISSUER_PORT,
    minioPort: MINIO_PORT,
    bucket: BUCKET,
    webDir: path.join(ROOT, "web", "dist"),
    proxyHops: Number(process.env.GATEWAY_PROXY_HOPS) || 0,
  });
  log(`ready on :${PORT}`);
}

main().catch((err) => fail(err.stack || err.message));
