const crypto = require("crypto");
const sharp = require("sharp");
const { renderIdCardSVG, CARD_HEIGHT } = require("./template");
const { appendVerhoeffCheckDigit } = require("./validators");

// Renders the synthetic ID card with a real face photo composited into a
// margin appended *below* the card's own CARD_HEIGHT — the OCR field crops
// (template.js) only ever read y < CARD_HEIGHT, so this can't perturb OCR.
//
// The margin is neutral grey, not the card's near-white background: the
// card alone sits at brightness ~219 of quality.js's 220 ceiling, so
// extending it with more near-white area fails the quality gate on a
// perfectly good image.
async function renderCardWithFace(docType, values, faceBuffer) {
  const svg = renderIdCardSVG(docType, values);
  const card = sharp(Buffer.from(svg)).png();
  if (!faceBuffer) return card.toBuffer();

  const face = await sharp(faceBuffer).resize(180, 180, { fit: "cover" }).png().toBuffer();
  return card
    .extend({ bottom: 200, background: "#808080" })
    .composite([{ input: face, top: CARD_HEIGHT + 10, left: 20 }])
    .png()
    .toBuffer();
}

function randomDigits(n) {
  return Array.from({ length: n }, () => crypto.randomInt(0, 10)).join("");
}

// A number that passes the same validator the OCR pipeline applies
// (validators.js), so a generated demo card isn't itself flagged for review.
function randomIdNumber(docType) {
  if (docType === "AADHAAR") return appendVerhoeffCheckDigit(String(crypto.randomInt(2, 10)) + randomDigits(10));
  if (docType === "PASSPORT") return "K" + randomDigits(7);
  return "KA" + randomDigits(13);
}

module.exports = { renderCardWithFace, randomIdNumber };
