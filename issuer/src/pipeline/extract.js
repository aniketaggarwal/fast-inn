const { DOC_TEMPLATES, FIELD_LABELS } = require("./template");
const { runDocumentOcr } = require("./ocr");
const { FIELD_VALIDATORS } = require("./validators");

// A field that Tesseract read with low confidence, or that fails its
// validator/checksum, is not extracted — it's flagged (Section 9.1). This
// threshold is Tesseract's own 0-100 word-confidence scale.
const FIELD_CONFIDENCE_MIN = 70;

// Runs OCR for every field on the template, then validates+normalizes
// each one independently. A submission only auto-passes if every field
// both parses and clears the confidence bar; any single failure sends the
// whole submission to human review rather than issuing a credential with
// a guessed field.
async function extractFields(cardBuffer, docType) {
  const template = DOC_TEMPLATES[docType];
  if (!template) {
    throw new Error(`unknown doc type: ${docType}`);
  }

  const ocrFields = await runDocumentOcr(cardBuffer, docType);

  const fields = {};
  let allPassed = true;
  let confidenceSum = 0;

  for (const fieldName of template.fields) {
    const { rawText, confidence } = ocrFields[fieldName];
    const { valid, value } = FIELD_VALIDATORS[fieldName](rawText, docType);
    const confidenceOk = confidence >= FIELD_CONFIDENCE_MIN;
    const passed = valid && confidenceOk;

    fields[fieldName] = {
      label: FIELD_LABELS[fieldName],
      rawText,
      confidence,
      value: passed ? value : null,
      passed,
      failureReason: passed ? null : !valid ? "did_not_parse_or_failed_checksum" : "low_confidence",
    };

    confidenceSum += confidence;
    if (!passed) allPassed = false;
  }

  return {
    fields,
    overallConfidence: confidenceSum / template.fields.length,
    allPassed,
  };
}

module.exports = { extractFields, FIELD_CONFIDENCE_MIN };
