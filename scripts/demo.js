// npm run demo         — everything, on http://localhost:8080
// npm run demo:live    — same, plus a public https URL (Cloudflare quick tunnel)
//
// One command that checks the backing services, migrates + seeds, builds the
// web app, starts api + issuer behind scripts/demo-gateway.js, and prints
// what to open. Postgres, Redis and MinIO are expected to already be running
// (docker compose up -d postgres redis minio, or brew services) — this
// script only ever starts MinIO itself, and only if nothing answers on :9000.
//
// Flags: --live (public tunnel)  --reseed (wipe + reseed demo data)
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const { startGateway } = require("./demo-gateway");
const { portOpen, waitFor: waitForRaw, healthy, createSupervisor } = require("./lib/proc");

const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, ".demo", "logs");
const GATEWAY_PORT = Number(process.env.DEMO_PORT) || 8080;
const API_PORT = Number(process.env.DEMO_API_PORT) || 4100;
const ISSUER_PORT = Number(process.env.DEMO_ISSUER_PORT) || 4101;
const MINIO_PORT = 9000;
// Parsed, not loaded into process.env: api/.env and issuer/.env both define
// DATABASE_URL/PORT with different values, and anything put in process.env
// here would be inherited by every child (dotenv never overrides an
// already-set variable), silently pointing the issuer at the api's database.
const apiEnv = dotenv.parse(fs.existsSync(path.join(ROOT, "api", ".env")) ? fs.readFileSync(path.join(ROOT, "api", ".env")) : "");
const BUCKET = process.env.S3_BUCKET || "hotelverify-kyc";
const live = process.argv.includes("--live");
const reseed = process.argv.includes("--reseed");

const step = (msg) => console.log(`\n▸ ${msg}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  shutdown(1);
};
const supervisor = createSupervisor({ logDir: LOG_DIR, onFatal: fail });
const { launch } = supervisor;
const waitFor = (check, label, timeoutMs = 60000) => waitForRaw(check, label, timeoutMs, (m) => fail(`${m} — see ${LOG_DIR}`));

function shutdown(code = 0) {
  supervisor.killAll();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Output is captured and only shown if the step fails — a clean run should
// read like a checklist, not a wall of migration/vite logs.
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (r.status !== 0) {
    console.error((r.stdout || "") + (r.stderr || ""));
    fail(`\`${cmd} ${args.join(" ")}\` failed`);
  }
}

function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  step("Checking Postgres, Redis, MinIO");
  const dbUrl = apiEnv.DATABASE_URL || "postgresql://hotelverify:hotelverify@localhost:5432/hotelverify_app";
  const pool = new Pool({ connectionString: dbUrl });
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    return fail(`Can't reach Postgres (${err.message}).\n  docker compose up -d postgres redis minio   — or —   brew services start postgresql`);
  }
  if (!(await portOpen(6379))) return fail("Can't reach Redis on :6379.\n  docker compose up -d redis   — or —   brew services start redis");
  if (!(await portOpen(MINIO_PORT))) {
    if (spawnSync("which", ["minio"]).status !== 0) return fail("Nothing on :9000 and MinIO isn't installed.\n  docker compose up -d minio   — or —   brew install minio");
    console.log("  starting MinIO (data in .demo/minio)");
    const dataDir = path.join(ROOT, ".demo", "minio");
    fs.mkdirSync(dataDir, { recursive: true });
    launch("minio", "minio", ["server", dataDir, "--address", `:${MINIO_PORT}`], {
      env: { MINIO_ROOT_USER: process.env.S3_ACCESS_KEY || "hotelverify", MINIO_ROOT_PASSWORD: process.env.S3_SECRET_KEY || "hotelverify_dev_only" },
    });
    await waitFor(() => portOpen(MINIO_PORT), "MinIO", 20000);
  }

  step("Migrating databases");
  run("npm", ["run", "migrate"]);

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM hotels");
  await pool.end();
  if (reseed || rows[0].n === 0) {
    step("Seeding demo data");
    run("npm", ["run", "seed"]);
  }

  step("Building web app");
  run("npm", ["run", "build", "--workspace=web"], {
    env: { ...process.env, VITE_API_BASE: "/api", VITE_ISSUER_BASE: "/issuer" },
  });

  step("Starting api + issuer");
  const shared = { HOST: "127.0.0.1", TRUST_PROXY: "1", DEMO_MODE: "true" };
  launch("api", "node", ["src/server.js"], {
    cwd: path.join(ROOT, "api"),
    env: { ...shared, PORT: String(API_PORT), WEB_BASE_URL: "auto", ISSUER_BASE_URL: `http://127.0.0.1:${ISSUER_PORT}` },
  });
  launch("issuer", "node", ["src/server.js"], {
    cwd: path.join(ROOT, "issuer"),
    env: { ...shared, PORT: String(ISSUER_PORT), S3_PUBLIC_ENDPOINT: "auto" },
  });
  await waitFor(healthy(API_PORT), "api");
  await waitFor(healthy(ISSUER_PORT), "issuer");

  await startGateway({ port: GATEWAY_PORT, apiPort: API_PORT, issuerPort: ISSUER_PORT, minioPort: MINIO_PORT, bucket: BUCKET, webDir: path.join(ROOT, "web", "dist") });

  const lan = lanAddress();
  console.log("\n────────────────────────────────────────────────────────");
  console.log(` HotelVerify is running`);
  console.log(`   this machine : http://localhost:${GATEWAY_PORT}`);
  if (lan) console.log(`   same Wi-Fi   : http://${lan}:${GATEWAY_PORT}   (camera needs https — use --live for a phone)`);
  console.log(`\n Demo logins (password: Password123!)`);
  console.log(`   guest  guest1@hotelverify.test`);
  console.log(`   staff  staff.ramaiah@hotelverify.test`);
  console.log(`   admin  admin@hotelverify.test`);
  console.log("────────────────────────────────────────────────────────");

  if (live) {
    if (spawnSync("which", ["cloudflared"]).status !== 0) {
      return fail("--live needs cloudflared:  brew install cloudflared");
    }
    step("Opening public tunnel");
    const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${GATEWAY_PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    supervisor.track(tunnel);
    let announced = false;
    const scan = (chunk) => {
      const match = !announced && /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
      if (match) {
        announced = true;
        console.log(`\n  LIVE  ${match[0]}\n  (anyone with this link can use the demo — Ctrl+C closes it)\n`);
      }
    };
    tunnel.stdout.on("data", scan);
    tunnel.stderr.on("data", scan);
  }
  console.log("\n Ctrl+C to stop.\n");
}

main().catch((err) => fail(err.stack || err.message));
