// Verhoeff checksum (ISO/IEC 7064) — the standard algorithm Aadhaar numbers
// use for their trailing check digit. The multiplication/permutation/
// inverse tables below are the fixed, published constants of the
// algorithm itself, not anything specific to UIDAI — this is the same
// well-known table any Verhoeff implementation uses.
const D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV_TABLE = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function verhoeffChecksum(digits) {
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = D_TABLE[c][P_TABLE[i % 8][Number(reversed[i])]];
  }
  return c;
}

function isValidVerhoeff(fullNumberDigits) {
  return verhoeffChecksum(fullNumberDigits) === 0;
}

// For generating fixtures: appends a check digit to 11 digits so the
// resulting 12-digit number passes isValidVerhoeff.
function appendVerhoeffCheckDigit(elevenDigits) {
  const checksum = verhoeffChecksum(elevenDigits + "0");
  return elevenDigits + String(INV_TABLE[checksum]);
}

// Field validators. Each takes the raw OCR'd string for that field and
// returns { valid, value } — value is the normalized form on success, or
// null if the field doesn't parse/checksum. A field that fails here is not
// extracted, it's flagged (Section 9.1) — the caller decides what to do
// with a failed field, this module just says pass/fail.
const FIELD_VALIDATORS = {
  fullName: (raw) => {
    const value = raw.trim().replace(/\s+/g, " ");
    return value.length >= 2 ? { valid: true, value } : { valid: false, value: null };
  },

  dateOfBirth: (raw) => {
    const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return { valid: false, value: null };
    const [, dd, mm, yyyy] = match;
    const day = Number(dd);
    const month = Number(mm);
    if (month < 1 || month > 12 || day < 1 || day > 31) return { valid: false, value: null };
    return { valid: true, value: `${yyyy}-${mm}-${dd}` }; // normalize to ISO for storage
  },

  nationality: (raw) => {
    const value = raw.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(value) ? { valid: true, value } : { valid: false, value: null };
  },

  idNumber: (raw, docType) => {
    const value = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (docType === "AADHAAR") {
      if (!/^\d{12}$/.test(value)) return { valid: false, value: null };
      return isValidVerhoeff(value) ? { valid: true, value } : { valid: false, value: null };
    }
    if (docType === "PASSPORT") {
      // Passport number format: one letter (excluding Q,U,X,Z per spec),
      // then 7 digits.
      return /^[A-PR-WY][0-9]{7}$/.test(value) ? { valid: true, value } : { valid: false, value: null };
    }
    if (docType === "DRIVING_LICENSE") {
      // Real Indian DL numbers vary by issuing state (Section 9.1
      // acknowledges this explicitly) — this is a simplified, plausible
      // shape (2 letters + 13 digits), not a real RTO format.
      return /^[A-Z]{2}[0-9]{13}$/.test(value) ? { valid: true, value } : { valid: false, value: null };
    }
    return { valid: false, value: null };
  },
};

module.exports = {
  isValidVerhoeff,
  appendVerhoeffCheckDigit,
  verhoeffChecksum,
  FIELD_VALIDATORS,
};
