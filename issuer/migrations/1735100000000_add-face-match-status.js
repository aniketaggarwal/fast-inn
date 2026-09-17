exports.shorthands = undefined;

// face_score alone can't tell a human reviewer *why* a submission wasn't
// auto-passed on the face-match check (Section 9.4: no face found,
// multiple faces found, and below-threshold score are three different
// situations that want three different reviewer-facing messages, not one
// null-or-low-number column).
exports.up = (pgm) => {
  pgm.addColumn("kyc_submissions", {
    face_match_status: { type: "text" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("kyc_submissions", "face_match_status");
};
