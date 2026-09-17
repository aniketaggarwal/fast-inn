// This test's ISSUER_BASE_URL override must happen before ../src/app (and
// transitively ../src/routes/issuerReview) is first required, since that
// module reads process.env.ISSUER_BASE_URL once, at load time, into a
// constant.
process.env.ISSUER_BASE_URL = "http://localhost:4099";

const http = require("http");
const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { uniqueEmail, createUser, deleteUser } = require("./helpers");

const app = createApp();
let fakeIssuerServer;
let receivedRequests;
let platformAdmin;
let adminToken;
let guest;
let guestToken;

function startFakeIssuer() {
  return new Promise((resolve) => {
    fakeIssuerServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : null;
        receivedRequests.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.setHeader("Content-Type", "application/json");

        if (req.headers["x-issuer-service-token"] !== process.env.ISSUER_SERVICE_TOKEN) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: "invalid_service_token" }));
        }

        if (req.method === "GET" && req.url === "/review") {
          res.statusCode = 200;
          return res.end(JSON.stringify({ submissions: [{ id: "sub-1", docType: "AADHAAR" }] }));
        }
        if (req.method === "POST" && /^\/review\/.+\/decide$/.test(req.url)) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ status: "APPROVED" }));
        }
        if (req.method === "POST" && /^\/admin\/revoke\/.+$/.test(req.url)) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", revokedAt: "2026-01-01T00:00:00.000Z" }));
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not_found" }));
      });
    });
    fakeIssuerServer.listen(4099, resolve);
  });
}

beforeAll(async () => {
  receivedRequests = [];
  await startFakeIssuer();

  platformAdmin = await createUser({ email: uniqueEmail("proxy-admin"), role: "PLATFORM_ADMIN" });
  const adminLogin = await request(app)
    .post("/auth/login")
    .send({ email: platformAdmin.email, password: platformAdmin.password });
  adminToken = adminLogin.body.accessToken;

  guest = await createUser({ email: uniqueEmail("proxy-guest"), role: "GUEST" });
  const guestLogin = await request(app).post("/auth/login").send({ email: guest.email, password: guest.password });
  guestToken = guestLogin.body.accessToken;
});

afterAll(async () => {
  await new Promise((resolve) => fakeIssuerServer.close(resolve));
  await deleteUser(platformAdmin.id);
  await deleteUser(guest.id);
  await pool.end();
});

describe("GET /issuer/review", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/issuer/review");
    expect(res.status).toBe(401);
  });

  it("rejects a GUEST token — only PLATFORM_ADMIN reaches the issuer", async () => {
    const res = await request(app).get("/issuer/review").set("Authorization", `Bearer ${guestToken}`);
    expect(res.status).toBe(403);
  });

  it("forwards to the issuer with the shared service token attached, and relays the response", async () => {
    const res = await request(app).get("/issuer/review").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);

    const forwarded = receivedRequests.find((r) => r.url === "/review");
    expect(forwarded.headers["x-issuer-service-token"]).toBe(process.env.ISSUER_SERVICE_TOKEN);
  });
});

describe("POST /issuer/review/:id/decide", () => {
  it("attaches the calling admin's own user id as reviewerId — the browser never sends it", async () => {
    const res = await request(app)
      .post("/issuer/review/sub-1/decide")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "APPROVE", correctedFields: { fullName: "Test" } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");

    const forwarded = receivedRequests.find((r) => r.url === "/review/sub-1/decide");
    expect(forwarded.body.reviewerId).toBe(platformAdmin.id);
    expect(forwarded.body.decision).toBe("APPROVE");
    expect(forwarded.headers["x-issuer-service-token"]).toBe(process.env.ISSUER_SERVICE_TOKEN);
  });

  it("rejects a non-admin", async () => {
    const res = await request(app)
      .post("/issuer/review/sub-1/decide")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ decision: "REJECT" });
    expect(res.status).toBe(403);
  });
});

describe("POST /issuer/admin/revoke/:credId", () => {
  it("attaches the calling admin's user id as actorId and relays the issuer's response", async () => {
    const res = await request(app)
      .post("/issuer/admin/revoke/11111111-1111-1111-1111-111111111111")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "lost device" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("11111111-1111-1111-1111-111111111111");

    const forwarded = receivedRequests.find((r) => r.url === "/admin/revoke/11111111-1111-1111-1111-111111111111");
    expect(forwarded.body.actorId).toBe(platformAdmin.id);
    expect(forwarded.body.reason).toBe("lost device");
  });

  it("rejects a non-admin", async () => {
    const res = await request(app)
      .post("/issuer/admin/revoke/11111111-1111-1111-1111-111111111111")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});
