// Single source of truth for the synthetic ID card layout, shared by
// scripts/make-fake-ids.js (the renderer) and src/pipeline/ocr.js (the
// cropper). Keeping both in one place means the generator and the parser
// can never drift out of sync with each other — a real risk if the crop
// coordinates were duplicated in two files.
//
// This only works because we fully control the layout: real government IDs
// vary by state/issuer and would need actual template-matching or
// full-card OCR. A fixed, known template is what makes field-level
// cropping (and therefore field-level confidence) tractable here — see
// PROGRESS.md for the honest limitations this implies.

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 640;
const FIELD_START_Y = 130;
const FIELD_HEIGHT = 100;
const LABEL_OFFSET_Y = 25;
const VALUE_OFFSET_Y = 65;
const CROP_MARGIN_X = 30;
const CROP_TOP_OFFSET = 34;
const CROP_BOTTOM_OFFSET = 92;

const FIELD_LABELS = {
  fullName: "Name",
  dateOfBirth: "Date of Birth (DD/MM/YYYY)",
  idNumber: "ID Number",
  nationality: "Nationality",
};

const DOC_TEMPLATES = {
  AADHAAR: {
    title: "GOVERNMENT OF INDIA — AADHAAR",
    fields: ["fullName", "dateOfBirth", "idNumber", "nationality"],
  },
  PASSPORT: {
    title: "REPUBLIC OF INDIA — PASSPORT",
    fields: ["fullName", "dateOfBirth", "idNumber", "nationality"],
  },
  DRIVING_LICENSE: {
    title: "UNION OF INDIA — DRIVING LICENCE",
    fields: ["fullName", "dateOfBirth", "idNumber", "nationality"],
  },
};

function fieldRowY(index) {
  return FIELD_START_Y + index * FIELD_HEIGHT;
}

// The rectangle sharp().extract() should crop to isolate just this field's
// value line (not its label) for per-field OCR.
function fieldCropRegion(index) {
  const y = fieldRowY(index);
  return {
    left: CROP_MARGIN_X,
    top: y + CROP_TOP_OFFSET,
    width: CARD_WIDTH - 2 * CROP_MARGIN_X,
    height: CROP_BOTTOM_OFFSET - CROP_TOP_OFFSET,
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// values: { fullName, dateOfBirth, idNumber, nationality } (subset of
// whatever DOC_TEMPLATES[docType].fields lists)
function renderIdCardSVG(docType, values) {
  const template = DOC_TEMPLATES[docType];
  if (!template) {
    throw new Error(`unknown doc type: ${docType}`);
  }

  const fieldsSvg = template.fields
    .map((name, index) => {
      const y = fieldRowY(index);
      const label = escapeXml(FIELD_LABELS[name]);
      const value = escapeXml(values[name] ?? "");
      return `
        <text x="${CROP_MARGIN_X}" y="${y + LABEL_OFFSET_Y}" font-size="18" font-family="sans-serif" fill="#555">${label}</text>
        <text x="${CROP_MARGIN_X}" y="${y + VALUE_OFFSET_Y}" font-size="32" font-family="monospace" font-weight="bold" fill="#111">${value}</text>
      `;
    })
    .join("\n");

  return `
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fdfdf7" stroke="#333" stroke-width="4"/>
      <rect x="0" y="0" width="100%" height="90" fill="#1e3a5f"/>
      <text x="${CROP_MARGIN_X}" y="55" font-size="26" font-family="sans-serif" font-weight="bold" fill="#ffffff">${escapeXml(template.title)}</text>
      ${fieldsSvg}
      <text x="${CROP_MARGIN_X}" y="${CARD_HEIGHT - 20}" font-size="14" font-family="sans-serif" fill="#999">SYNTHETIC DOCUMENT — NOT A REAL GOVERNMENT ID — GENERATED FOR HOTELVERIFY TESTING</text>
    </svg>
  `;
}

module.exports = {
  CARD_WIDTH,
  CARD_HEIGHT,
  DOC_TEMPLATES,
  FIELD_LABELS,
  fieldRowY,
  fieldCropRegion,
  renderIdCardSVG,
};
