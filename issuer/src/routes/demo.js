const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { DOC_TEMPLATES } = require("../pipeline/template");
const { renderCardWithFace, randomIdNumber } = require("../pipeline/demoCard");

const router = Router();

const enabled = () => process.env.DEMO_MODE === "true";

router.get("/demo/status", (req, res) => res.json({ enabled: enabled() }));

// Demo-only (DEMO_MODE=true, set by scripts/demo.js): nobody demoing this
// on a phone has a synthetic Aadhaar card to photograph, so this renders
// one — the exact same template the OCR pipeline crops against — with the
// guest's own selfie as the ID photo. It still goes through the real
// pipeline afterward: quality gate, OCR, checksum, face match.
router.post(
  "/demo/id-card",
  asyncHandler(async (req, res) => {
    if (!enabled()) return res.status(404).json({ error: "not_found" });

    const { docType, fullName, dateOfBirth, nationality, faceImage } = req.body || {};
    if (!DOC_TEMPLATES[docType]) return res.status(400).json({ error: "invalid_doc_type" });
    if (typeof fullName !== "string" || !/^[A-Za-z][A-Za-z ]{1,39}$/.test(fullName.trim())) {
      return res.status(400).json({ error: "invalid_full_name" });
    }
    const dob = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth || "");
    if (!dob) return res.status(400).json({ error: "invalid_date_of_birth" });
    const nat = (nationality || "IN").toUpperCase();
    if (!/^[A-Z]{2}$/.test(nat)) return res.status(400).json({ error: "invalid_nationality" });
    if (typeof faceImage !== "string") return res.status(400).json({ error: "face_image_required" });

    const faceBuffer = Buffer.from(faceImage.includes(",") ? faceImage.slice(faceImage.indexOf(",") + 1) : faceImage, "base64");

    const png = await renderCardWithFace(
      docType,
      {
        fullName: fullName.trim().replace(/\s+/g, " "),
        dateOfBirth: `${dob[3]}/${dob[2]}/${dob[1]}`,
        idNumber: randomIdNumber(docType),
        nationality: nat,
      },
      faceBuffer
    );
    res.type("image/png").send(png);
  })
);

module.exports = router;
