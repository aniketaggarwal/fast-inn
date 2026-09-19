const os = require("os");
const path = require("path");
const fs = require("fs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hv-fs-test-"));
process.env.STORAGE_DRIVER = "fs";
process.env.STORAGE_DIR = dir;
process.env.STORAGE_URL_PREFIX = "/issuer";

const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const storage = require("../src/storage/fsStorage");

const app = createApp();

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.STORAGE_DRIVER;
  await pool.end();
});

// A presigned URL is "<origin>/issuer/storage/object?…"; the test talks to the
// app directly, without the gateway that strips "/issuer".
const local = (url) => url.replace(/^https?:\/\/[^/]+\/issuer/, "");

describe("filesystem storage driver (STORAGE_DRIVER=fs)", () => {
  it("round-trips an object through signed PUT and GET URLs, and the URL carries the public origin and prefix", async () => {
    const key = storage.newObjectKey("kyc/docs", "png");
    const put = await storage.presignedPutUrl(key, "image/png", 60, "https://demo.example.com");
    expect(put.startsWith("https://demo.example.com/issuer/storage/object?")).toBe(true);

    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect((await request(app).put(local(put)).set("Content-Type", "image/png").send(body)).status).toBe(200);
    expect(await storage.objectExists(key)).toBe(true);
    expect(await storage.getObjectBuffer(key)).toEqual(body);

    const get = await request(app).get(local(await storage.presignedGetUrl(key)));
    expect(get.status).toBe(200);
    expect(get.headers["content-type"]).toContain("image/png");

    await storage.deleteObject(key);
    expect(await storage.objectExists(key)).toBe(false);
  });

  it("rejects a tampered key, a swapped operation, an expired URL, and a bad signature", async () => {
    const key = storage.newObjectKey("kyc/docs", "png");
    const other = storage.newObjectKey("kyc/docs", "png");
    const put = local(await storage.presignedPutUrl(key, "image/png"));

    const tamperedKey = put.replace(encodeURIComponent(key), encodeURIComponent(other));
    expect((await request(app).put(tamperedKey).send(Buffer.from("x"))).status).toBe(403);

    const asGet = put.replace("op=put", "op=get");
    expect((await request(app).get(asGet)).status).toBe(403);

    const expired = local(await storage.presignedPutUrl(key, "image/png", -10));
    expect((await request(app).put(expired).send(Buffer.from("x"))).status).toBe(403);

    expect((await request(app).put(put.replace(/sig=[0-9a-f]+/, "sig=deadbeef")).send(Buffer.from("x"))).status).toBe(403);
    expect(await storage.objectExists(key)).toBe(false);
  });

  it("refuses keys that aren't the exact shape newObjectKey produces (no path traversal)", async () => {
    await expect(storage.presignedPutUrl("kyc/docs/../../etc/passwd", "image/png")).rejects.toThrow("invalid_storage_key");
    await expect(storage.getObjectBuffer("../secret.png")).rejects.toThrow("invalid_storage_key");
    expect(await storage.objectExists("kyc/docs/../../x.png")).toBe(false);
  });

  it("is a 404 when the driver isn't enabled", async () => {
    process.env.STORAGE_DRIVER = "s3";
    expect((await request(app).put("/storage/object?op=put").send(Buffer.from("x"))).status).toBe(404);
    process.env.STORAGE_DRIVER = "fs";
  });
});
