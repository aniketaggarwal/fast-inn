// npm run make-fake-ids — generates synthetic ID card images for demo/test
// use. Every document here is fake (Section 0: "Never use real government
// IDs"); output goes to a gitignored fixtures directory, never committed.
//
// Uses the exact same template renderer the OCR pipeline crops against
// (issuer/src/pipeline/template.js), so these fixtures are genuinely
// readable by the real pipeline, not hand-waved samples.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { renderIdCardSVG } = require("../issuer/src/pipeline/template");
const { appendVerhoeffCheckDigit } = require("../issuer/src/pipeline/validators");

const OUT_DIR = path.join(__dirname, "..", "fixtures", "fake-ids");

const PEOPLE = [
  { fullName: "Aniket Sharma", dateOfBirth: "14/05/2003", nationality: "IN" },
  { fullName: "Priya Nair", dateOfBirth: "22/11/1998", nationality: "IN" },
  { fullName: "Rohan Gupta", dateOfBirth: "05/01/2010", nationality: "IN" }, // minor, for isAdult=false testing
];

function aadhaarNumberFor(seed) {
  const eleven = String(seed).padStart(11, "3");
  return appendVerhoeffCheckDigit(eleven);
}

function passportNumberFor(seed) {
  return "K" + String(seed).padStart(7, "0");
}

function dlNumberFor(seed) {
  return "KA" + String(seed).padStart(13, "0");
}

async function renderCard(docType, values, outPath) {
  const svg = renderIdCardSVG(docType, values);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];

  for (let i = 0; i < PEOPLE.length; i++) {
    const person = PEOPLE[i];
    const seed = 1000 + i;

    const aadhaarValues = { ...person, idNumber: aadhaarNumberFor(seed) };
    const aadhaarPath = path.join(OUT_DIR, `good-aadhaar-${i}.png`);
    await renderCard("AADHAAR", aadhaarValues, aadhaarPath);
    manifest.push({ file: path.basename(aadhaarPath), docType: "AADHAAR", ...aadhaarValues, expected: "AUTO_PASS" });

    const passportValues = { ...person, idNumber: passportNumberFor(seed) };
    const passportPath = path.join(OUT_DIR, `good-passport-${i}.png`);
    await renderCard("PASSPORT", passportValues, passportPath);
    manifest.push({ file: path.basename(passportPath), docType: "PASSPORT", ...passportValues, expected: "AUTO_PASS" });

    const dlValues = { ...person, idNumber: dlNumberFor(seed) };
    const dlPath = path.join(OUT_DIR, `good-dl-${i}.png`);
    await renderCard("DRIVING_LICENSE", dlValues, dlPath);
    manifest.push({ file: path.basename(dlPath), docType: "DRIVING_LICENSE", ...dlValues, expected: "AUTO_PASS" });
  }

  // Deliberately bad fixtures, to exercise the NEEDS_REVIEW / rejection
  // paths (not just the happy path) — same field values as the first good
  // Aadhaar, but corrupted differently.
  const base = { ...PEOPLE[0], idNumber: aadhaarNumberFor(1000) };

  const blurryPath = path.join(OUT_DIR, "blurry-aadhaar.png");
  const svg = renderIdCardSVG("AADHAAR", base);
  await sharp(Buffer.from(svg)).blur(50).png().toFile(blurryPath);
  manifest.push({ file: path.basename(blurryPath), docType: "AADHAAR", ...base, expected: "REJECTED (quality gate: too_blurry)" });

  const darkPath = path.join(OUT_DIR, "dark-aadhaar.png");
  await sharp(Buffer.from(svg)).modulate({ brightness: 0.15 }).png().toFile(darkPath);
  manifest.push({ file: path.basename(darkPath), docType: "AADHAAR", ...base, expected: "REJECTED (quality gate: too_dark)" });

  const badChecksumValues = { ...PEOPLE[1], idNumber: "234123412340" }; // fails Verhoeff
  const badChecksumPath = path.join(OUT_DIR, "bad-checksum-aadhaar.png");
  await renderCard("AADHAAR", badChecksumValues, badChecksumPath);
  manifest.push({
    file: path.basename(badChecksumPath),
    docType: "AADHAAR",
    ...badChecksumValues,
    expected: "NEEDS_REVIEW (idNumber fails Verhoeff checksum)",
  });

  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Generated ${manifest.length} fake ID fixtures in ${OUT_DIR}`);
  console.log("See manifest.json for the field values and expected pipeline outcome of each.");
}

main().catch((err) => {
  console.error("make-fake-ids failed:", err);
  process.exit(1);
});
