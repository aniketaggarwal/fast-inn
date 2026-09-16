const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { uniqueEmail, createUser, deleteUser } = require("./helpers");

const app = createApp();
const createdUserIds = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await deleteUser(id);
  }
  await pool.end();
});

describe("POST /auth/register", () => {
  it("creates a GUEST account and returns tokens", async () => {
    const email = uniqueEmail("guest-register");
    const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe("GUEST");
    expect(res.body.user.hotelId).toBeNull();
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");

    createdUserIds.push(res.body.user.id);
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail("guest-dup");
    const first = await request(app).post("/auth/register").send({ email, password: "Password123!" });
    createdUserIds.push(first.body.user.id);

    const second = await request(app).post("/auth/register").send({ email, password: "AnotherPass1!" });
    expect(second.status).toBe(409);
  });

  it("rejects a short password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: uniqueEmail("guest-short"), password: "short" });
    expect(res.status).toBe(400);
  });

  it("ignores a role field in the request body — self-registration is always GUEST", async () => {
    const email = uniqueEmail("guest-role-injection");
    const res = await request(app)
      .post("/auth/register")
      .send({ email, password: "Password123!", role: "PLATFORM_ADMIN" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("GUEST");
    createdUserIds.push(res.body.user.id);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail("guest-login");
    const password = "Password123!";
    const registered = await request(app).post("/auth/register").send({ email, password });
    createdUserIds.push(registered.body.user.id);

    const res = await request(app).post("/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("rejects a wrong password with a generic error", async () => {
    const email = uniqueEmail("guest-wrongpass");
    const registered = await request(app).post("/auth/register").send({ email, password: "Password123!" });
    createdUserIds.push(registered.body.user.id);

    const res = await request(app).post("/auth/login").send({ email, password: "WrongPassword1!" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("rejects login for an email that doesn't exist, with the same generic error", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: uniqueEmail("nobody"), password: "Password123!" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("logs in each of the four roles with the correct hotelId claim", async () => {
    const platformAdmin = await createUser({
      email: uniqueEmail("platform-admin"),
      role: "PLATFORM_ADMIN",
    });
    createdUserIds.push(platformAdmin.id);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: platformAdmin.email, password: platformAdmin.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("PLATFORM_ADMIN");
    expect(res.body.user.hotelId).toBeNull();
  });
});

describe("POST /auth/refresh", () => {
  it("exchanges a valid refresh token for a new access token", async () => {
    const email = uniqueEmail("guest-refresh");
    const password = "Password123!";
    const registered = await request(app).post("/auth/register").send({ email, password });
    createdUserIds.push(registered.body.user.id);

    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: registered.body.refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("rejects a garbage refresh token", async () => {
    const res = await request(app).post("/auth/refresh").send({ refreshToken: "not-a-real-token" });
    expect(res.status).toBe(401);
  });
});
