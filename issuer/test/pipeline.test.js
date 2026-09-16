const sharp = require("sharp");
const { runQualityGate } = require("../src/pipeline/quality");
const { extractFields } = require("../src/pipeline/extract");
const { isValidVerhoeff, appendVerhoeffCheckDigit, FIELD_VALIDATORS } = require("../src/pipeline/validators");
const { computeIsAdult } = require("../src/pipeline/claims");
const { makeCardBuffer, validAadhaarNumber, GOOD_AADHAAR_VALUES } = require("./helpers");

describe("Verhoeff checksum", () => {
  it("generates a check digit that validates", () => {
    const number = appendVerhoeffCheckDigit("12345678901");
    expect(number).toHaveLength(12);
    expect(isValidVerhoeff(number)).toBe(true);
  });

  it("rejects a number with a corrupted digit", () => {
    const number = appendVerhoeffCheckDigit("12345678901");
    const corrupted = number.slice(0, -1) + (number.at(-1) === "0" ? "1" : "0");
    expect(isValidVerhoeff(corrupted)).toBe(false);
  });

  it("rejects a number with two transposed digits (the property Verhoeff exists for)", () => {
    const number = appendVerhoeffCheckDigit("12345678901");
    const chars = number.split("");
    [chars[0], chars[1]] = [chars[1], chars[0]];
    const transposed = chars.join("");
    if (transposed !== number) {
      expect(isValidVerhoeff(transposed)).toBe(false);
    }
  });
});

describe("field validators", () => {
  it("accepts a well-formed date and normalizes to ISO", () => {
    expect(FIELD_VALIDATORS.dateOfBirth("14/05/2000")).toEqual({ valid: true, value: "2000-05-14" });
  });

  it("rejects an impossible date", () => {
    expect(FIELD_VALIDATORS.dateOfBirth("35/13/2000").valid).toBe(false);
  });

  it("rejects a date in the wrong format", () => {
    expect(FIELD_VALIDATORS.dateOfBirth("2000-05-14").valid).toBe(false);
  });

  it("validates a passport number shape", () => {
    expect(FIELD_VALIDATORS.idNumber("K1234567", "PASSPORT").valid).toBe(true);
    expect(FIELD_VALIDATORS.idNumber("Q1234567", "PASSPORT").valid).toBe(false); // Q excluded
    expect(FIELD_VALIDATORS.idNumber("K123456", "PASSPORT").valid).toBe(false); // too short
  });

  it("validates an Aadhaar number's format and checksum together", () => {
    const valid = validAadhaarNumber(1);
    expect(FIELD_VALIDATORS.idNumber(valid, "AADHAAR")).toEqual({ valid: true, value: valid });
    expect(FIELD_VALIDATORS.idNumber("123456789012", "AADHAAR").valid).toBe(false); // fails checksum
  });

  it("rejects a full name that's just whitespace", () => {
    expect(FIELD_VALIDATORS.fullName("  ").valid).toBe(false);
  });
});

describe("computeIsAdult", () => {
  it("is true for someone who turned 18 exactly today", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(computeIsAdult("2008-06-15", now)).toBe(true);
  });

  it("is false for someone who turns 18 tomorrow", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(computeIsAdult("2008-06-16", now)).toBe(false);
  });

  it("is false for a minor", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(computeIsAdult("2015-01-01", now)).toBe(false);
  });
});

describe("runQualityGate", () => {
  it("passes a clean rendered card", async () => {
    const buffer = await makeCardBuffer("AADHAAR", GOOD_AADHAAR_VALUES());
    const result = await runQualityGate(buffer);
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects a heavily blurred image", async () => {
    const buffer = await makeCardBuffer("AADHAAR", GOOD_AADHAAR_VALUES());
    const blurred = await sharp(buffer).blur(50).png().toBuffer();
    const result = await runQualityGate(blurred);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("too_blurry");
  });

  it("rejects a too-dark image", async () => {
    const buffer = await makeCardBuffer("AADHAAR", GOOD_AADHAAR_VALUES());
    const dark = await sharp(buffer).modulate({ brightness: 0.15 }).png().toBuffer();
    const result = await runQualityGate(dark);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("too_dark");
  });

  it("rejects a too-bright/washed-out image", async () => {
    const buffer = await makeCardBuffer("AADHAAR", GOOD_AADHAAR_VALUES());
    const bright = await sharp(buffer).modulate({ brightness: 3 }).png().toBuffer();
    const result = await runQualityGate(bright);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("too_bright");
  });
});

describe("extractFields (real OCR against our own rendered template)", () => {
  it("extracts every field correctly from a clean AADHAAR card", async () => {
    const values = GOOD_AADHAAR_VALUES(2);
    const buffer = await makeCardBuffer("AADHAAR", values);
    const result = await extractFields(buffer, "AADHAAR");

    expect(result.allPassed).toBe(true);
    expect(result.fields.fullName.value).toBe(values.fullName);
    expect(result.fields.dateOfBirth.value).toBe("2000-05-14");
    expect(result.fields.idNumber.value).toBe(values.idNumber);
    expect(result.fields.nationality.value).toBe("IN");
    expect(result.overallConfidence).toBeGreaterThan(70);
  });

  it("extracts every field correctly from a clean PASSPORT card", async () => {
    const values = { fullName: "Jane Doe", dateOfBirth: "01/01/1995", idNumber: "M7654321", nationality: "IN" };
    const buffer = await makeCardBuffer("PASSPORT", values);
    const result = await extractFields(buffer, "PASSPORT");
    expect(result.allPassed).toBe(true);
    expect(result.fields.idNumber.value).toBe("M7654321");
  });

  it("flags (does not extract) a field that fails its checksum, without failing the others", async () => {
    const values = { ...GOOD_AADHAAR_VALUES(3), idNumber: "111111111111" }; // 12 digits, bad checksum
    const buffer = await makeCardBuffer("AADHAAR", values);
    const result = await extractFields(buffer, "AADHAAR");

    expect(result.allPassed).toBe(false);
    expect(result.fields.idNumber.passed).toBe(false);
    expect(result.fields.idNumber.value).toBeNull();
    expect(result.fields.idNumber.failureReason).toBe("did_not_parse_or_failed_checksum");
    expect(result.fields.fullName.passed).toBe(true); // other fields still extracted fine
  });
});
