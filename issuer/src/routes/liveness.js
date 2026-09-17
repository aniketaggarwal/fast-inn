const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { checkLiveness } = require("../pipeline/liveness");

const router = Router();

function decodeFrame(frame) {
  if (typeof frame !== "string") return null;
  const base64 = frame.includes(",") ? frame.slice(frame.indexOf(",") + 1) : frame;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

// Public, like /kyc/uploads/presign and /kyc/submit — this runs before a
// guest even has a submission, as a pass/fail gate the frontend checks
// before letting the guest proceed to upload the captured frame as their
// selfie (Section 9.3).
router.post(
  "/kyc/liveness/check",
  asyncHandler(async (req, res) => {
    const { frames } = req.body || {};
    if (!Array.isArray(frames)) {
      return res.status(400).json({ error: "frames_required" });
    }

    const decoded = frames.map(decodeFrame);
    if (decoded.some((buf) => buf === null)) {
      return res.status(400).json({ error: "invalid_frame_encoding" });
    }

    const result = await checkLiveness(decoded);
    res.json(result);
  })
);

module.exports = router;
