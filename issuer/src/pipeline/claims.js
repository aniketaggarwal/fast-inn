const sharp = require("sharp");

// isAdult is derived once here so the hotel never needs dateOfBirth at
// all for the common case — exactly the data-minimisation example from
// Section 3b.
function computeIsAdult(isoDateOfBirth, now = new Date()) {
  const dob = new Date(`${isoDateOfBirth}T00:00:00Z`);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age >= 18;
}

// Shared by both the auto-pass path (extracted values used as-is) and the
// reviewer-approve path (values a human may have corrected) — a
// credential built by either route has the identical claim shape.
async function buildClaims({ values, docType, docHash, selfieBuffer }) {
  const claims = {
    fullName: values.fullName,
    dateOfBirth: values.dateOfBirth,
    isAdult: computeIsAdult(values.dateOfBirth),
    nationality: values.nationality,
    idType: docType,
    idLast4: values.idNumber.slice(-4),
    idDocHash: docHash,
    verifiedAt: new Date().toISOString(),
  };

  if (selfieBuffer) {
    // Optional, for desk staff visual match (Section 3b) — a small
    // thumbnail, not a face embedding; no comparison happens against it
    // until Milestone 6's real face matching.
    const thumb = await sharp(selfieBuffer).resize(80, 80, { fit: "cover" }).jpeg({ quality: 60 }).toBuffer();
    claims.photoThumb = thumb.toString("base64");
  }

  return claims;
}

module.exports = { buildClaims, computeIsAdult };
