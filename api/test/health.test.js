const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");

afterAll(async () => {
  await pool.end();
});

describe("GET /health", () => {
  it("reports service identity and db connectivity", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("api");
    expect(res.body.db).toBe(true);
  });
});
