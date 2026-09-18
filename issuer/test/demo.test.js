const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { runQualityGate } = require("../src/pipeline/quality");
const { extractFields } = require("../src/pipeline/extract");
const { matchFaces } = require("../src/pipeline/facematch");
const { FACE_A } = require("./helpers");

const app = createApp();

afterAll(async () => {
  delete process.env.DEMO_MODE;
  await pool.end();
});

const body = () => ({
  docType: "AADHAAR",
  fullName: "Demo Person",
  dateOfBirth: "1998-04-21",
  nationality: "IN",
  faceImage: `data:image/jpeg;base64,${FACE_A.toString("base64")}`,
});

describe("demo ID-card generator", () => {
  it("is off (404) unless DEMO_MODE=true", async () => {
    delete process.env.DEMO_MODE;
    expect((await request(app).get("/demo/status")).body.enabled).toBe(false);
    expect((await request(app).post("/demo/id-card").send(body())).status).toBe(404);
  });

  it("renders a card the real pipeline accepts: quality gate, OCR + checksum, and face match all pass", async () => {
    process.env.DEMO_MODE = "true";
    const res = await request(app).post("/demo/id-card").send(body()).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");

    expect((await runQualityGate(res.body)).passed).toBe(true);
    const extraction = await extractFields(res.body, "AADHAAR");
    expect(extraction.allPassed).toBe(true);
    expect(extraction.fields.fullName.value).toBe("Demo Person");
    expect(extraction.fields.dateOfBirth.value).toBe("1998-04-21");
    expect((await matchFaces(res.body, FACE_A)).matched).toBe(true);
  });

  it("rejects malformed input instead of rendering it", async () => {
    process.env.DEMO_MODE = "true";
    expect((await request(app).post("/demo/id-card").send({ ...body(), fullName: "<svg onload=x>" })).status).toBe(400);
    expect((await request(app).post("/demo/id-card").send({ ...body(), dateOfBirth: "yesterday" })).status).toBe(400);
    expect((await request(app).post("/demo/id-card").send({ ...body(), docType: "NOPE" })).status).toBe(400);
  });
});
