const { Pool, types } = require("pg");

// pg's default NUMERIC (OID 1700) parser returns a string, to avoid
// silently losing precision on values too large for a JS number. Our
// numeric columns here (ocr_confidence, face_score) are confidence scores
// in [0, 100], nowhere near that range, and callers (including web/'s
// AdminReviewPage, which calls .toFixed() on it) expect a real number —
// same rationale as api/src/db.js's DATE type parser fix in Milestone 2.
types.setTypeParser(1700, parseFloat);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
