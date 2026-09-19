const express = require("express");
const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");

const router = Router();

const isFs = () => process.env.STORAGE_DRIVER === "fs";
const MAX_BYTES = 8 * 1024 * 1024;

// The receiving end of storage/fsStorage.js's signed URLs — only exists when
// STORAGE_DRIVER=fs. With the S3 driver the browser talks to MinIO/S3
// directly and this route is a 404.
function guard(op) {
  return (req, res, next) => {
    if (!isFs()) return res.status(404).json({ error: "not_found" });
    const { key, expires, sig } = req.query;
    if (req.query.op !== op || !require("../storage/fsStorage").verifySignature(op, key, expires, sig)) {
      return res.status(403).json({ error: "invalid_or_expired_url" });
    }
    next();
  };
}

router.put(
  "/storage/object",
  guard("put"),
  express.raw({ type: () => true, limit: MAX_BYTES }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "empty_body" });
    await require("../storage/fsStorage").putObjectBuffer(req.query.key, req.body);
    res.status(200).end();
  })
);

router.get(
  "/storage/object",
  guard("get"),
  asyncHandler(async (req, res) => {
    let data;
    try {
      data = await require("../storage/fsStorage").getObjectBuffer(req.query.key);
    } catch {
      return res.status(404).json({ error: "not_found" });
    }
    // Sniffed rather than trusted: the upload's declared type isn't kept.
    res.type(data[0] === 0xff ? "image/jpeg" : "image/png").send(data);
  })
);

module.exports = router;
