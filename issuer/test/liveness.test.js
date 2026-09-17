const sharp = require("sharp");
const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { FACE_A } = require("./helpers");

const app = createApp();

afterAll(async () => {
  await pool.end();
});

async function varyBrightness(buffer, factor) {
  return sharp(buffer).modulate({ brightness: factor }).jpeg().toBuffer();
}

function toDataUrl(buffer) {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

describe("POST /kyc/liveness/check", () => {
  it("passes distinct frames with a face throughout, accepting data-URL-prefixed base64", async () => {
    const frames = await Promise.all([1.0, 1.15, 0.85].map((f) => varyBrightness(FACE_A, f)));
    const res = await request(app)
      .post("/kyc/liveness/check")
      .send({ frames: frames.map(toDataUrl) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ passed: true, reason: null });
  });

  it("also accepts raw base64 with no data-URL prefix", async () => {
    const frames = await Promise.all([1.0, 1.15, 0.85].map((f) => varyBrightness(FACE_A, f)));
    const res = await request(app)
      .post("/kyc/liveness/check")
      .send({ frames: frames.map((f) => f.toString("base64")) });

    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
  });

  it("fails a static photo held motionless in front of the camera", async () => {
    const res = await request(app)
      .post("/kyc/liveness/check")
      .send({ frames: [FACE_A, FACE_A, FACE_A].map(toDataUrl) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ passed: false, reason: "no_motion_detected" });
  });

  it("rejects a malformed request body instead of crashing", async () => {
    const res = await request(app).post("/kyc/liveness/check").send({ frames: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("frames_required");
  });
});
