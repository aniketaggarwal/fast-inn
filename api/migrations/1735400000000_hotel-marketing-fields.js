// Milestone 8 (hardening + demo): the hotel list only ever had
// name/city/address to show, which made the guest-facing browse flow
// look like a database dump rather than a booking site. These three
// fields are purely descriptive/marketing content — nothing security- or
// tenancy-relevant reads them, so they need no RLS and no new indexes.
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("hotels", {
    description: { type: "text" },
    star_rating: { type: "smallint" },
    amenities: { type: "text[]", notNull: true, default: pgm.func("'{}'::text[]") },
  });
  pgm.addConstraint("hotels", "hotels_star_rating_chk", {
    check: "star_rating IS NULL OR star_rating BETWEEN 1 AND 5",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("hotels", "hotels_star_rating_chk");
  pgm.dropColumns("hotels", ["description", "star_rating", "amenities"]);
};
