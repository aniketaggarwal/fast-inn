const sharp = require("sharp");
const { createWorker, PSM } = require("tesseract.js");
const { DOC_TEMPLATES, fieldCropRegion } = require("./template");

// Section 9.1: grayscale -> normalise contrast -> upscale 2x -> light
// threshold. "Light" because too aggressive a threshold wipes out
// anti-aliased character edges instead of cleaning up noise.
async function preprocessForOcr(buffer) {
  const image = sharp(buffer).greyscale().normalize();
  const { width, height } = await image.metadata();
  return image
    .resize(width * 2, height * 2)
    .threshold(200)
    .png()
    .toBuffer();
}

// One char whitelist per field type — constrains what Tesseract can even
// output, per Section 9.1, instead of doing free-form OCR and hoping a
// regex sorts it out afterward.
function charWhitelistFor(fieldName, docType) {
  if (fieldName === "dateOfBirth") return "0123456789/";
  if (fieldName === "nationality") return "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (fieldName === "fullName") return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ";
  if (fieldName === "idNumber") {
    if (docType === "AADHAAR") return "0123456789 ";
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  }
  return undefined;
}

// Runs OCR once per field, cropped to just that field's value line (see
// template.js) and constrained to a single-line page segmentation mode,
// since that's exactly what a correctly-cropped field region contains.
// Reuses one Tesseract worker across all fields on a document instead of
// paying worker-startup cost per field.
async function runDocumentOcr(cardBuffer, docType) {
  const template = DOC_TEMPLATES[docType];
  if (!template) {
    throw new Error(`unknown doc type: ${docType}`);
  }

  const worker = await createWorker("eng", 1, { logger: () => {} });
  try {
    const fields = {};
    for (let index = 0; index < template.fields.length; index++) {
      const fieldName = template.fields[index];
      const region = fieldCropRegion(index);
      const cropped = await sharp(cardBuffer).extract(region).toBuffer();
      const preprocessed = await preprocessForOcr(cropped);

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: charWhitelistFor(fieldName, docType) || "",
      });
      const { data } = await worker.recognize(preprocessed);

      const words = data.words || [];
      const confidence = words.length
        ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
        : data.confidence;

      fields[fieldName] = { rawText: data.text.trim(), confidence };
    }
    return fields;
  } finally {
    await worker.terminate();
  }
}

module.exports = { runDocumentOcr, preprocessForOcr, charWhitelistFor };
