const { Router } = require("express");
const { withTenantTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenant");
const { asyncHandler } = require("../utils/asyncHandler");

const router = Router();

// Section 8: "Auto-populate [the register] from verified check-ins. Show
// that the register contains idLast4, never the full number." — this
// query literally cannot select a full ID number, because guest_register
// was never given a column for one (Section 5's schema).
router.get(
  "/hotel/register",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const rows = await withTenantTransaction(req.hotelId, async (client) => {
      const result = await client.query(
        `SELECT g.id, g.full_name, g.id_type, g.id_last4, g.nationality,
                g.arrival_at, g.departure_at, g.credential_id, g.booking_id,
                (f.id IS NOT NULL) AS form_c_required
         FROM guest_register g
         LEFT JOIN form_c_records f ON f.guest_register_id = g.id
         WHERE g.hotel_id = $1
           AND ($2::timestamptz IS NULL OR g.arrival_at >= $2::timestamptz)
           AND ($3::timestamptz IS NULL OR g.arrival_at <= $3::timestamptz)
         ORDER BY g.arrival_at DESC`,
        [req.hotelId, from || null, to || null]
      );
      return result.rows;
    });
    res.json({ entries: rows });
  })
);

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// CSV, not a PDF — the spec allows either, and a CSV is what an FRRO
// filing tool or a spreadsheet actually wants to ingest.
router.get(
  "/hotel/exports/form-c.csv",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const rows = await withTenantTransaction(req.hotelId, async (client) => {
      const result = await client.query(
        `SELECT g.full_name, g.id_type, g.id_last4, g.nationality, g.arrival_at, g.departure_at,
                f.id AS form_c_id, f.passport_no_last4, f.visa_type, f.arrival_from
         FROM guest_register g
         JOIN form_c_records f ON f.guest_register_id = g.id
         WHERE g.hotel_id = $1
         ORDER BY g.arrival_at DESC`,
        [req.hotelId]
      );
      if (result.rows.length > 0) {
        await client.query(
          "UPDATE form_c_records SET exported_at = now() WHERE id = ANY($1::uuid[])",
          [result.rows.map((r) => r.form_c_id)]
        );
      }
      return result.rows;
    });

    const header = "full_name,id_type,id_last4,nationality,passport_no_last4,visa_type,arrival_from,arrival_at,departure_at";
    const lines = rows.map((r) =>
      [r.full_name, r.id_type, r.id_last4, r.nationality, r.passport_no_last4, r.visa_type, r.arrival_from, r.arrival_at, r.departure_at]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="form-c.csv"');
    res.send(csv);
  })
);

module.exports = router;
