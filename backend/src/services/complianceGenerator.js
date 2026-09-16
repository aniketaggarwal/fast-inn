'use strict';
/**
 * complianceGenerator.js — Generates compliance reports for hotels
 * Produces JSON summary + FRRO Form C-compatible structure
 */
const { query } = require('../config/db');
const logger    = require('../utils/logger');

/**
 * Fetch all booking + guest data for a hotel within a date range
 */
async function fetchReportData(hotelId, startDate, endDate) {
  const { rows } = await query(
    `SELECT
       b.id              AS booking_id,
       b.booking_reference,
       b.room_number,
       b.room_type,
       b.check_in_date,
       b.check_out_date,
       b.num_guests,
       b.status          AS booking_status,
       u.full_name       AS guest_name,
       u.email           AS guest_email,
       u.phone           AS guest_phone,
       k.id_type,
       k.id_number,
       k.extracted_name,
       k.extracted_dob,
       k.extracted_address,
       k.verification_status AS kyc_status,
       cc.check_in_time,
       cc.check_out_time
     FROM bookings b
     JOIN users u ON u.id = b.guest_user_id
     LEFT JOIN guest_kyc k ON k.user_id = b.guest_user_id
     LEFT JOIN checkin_checkouts cc ON cc.booking_id = b.id
     WHERE b.hotel_id = $1
       AND b.check_in_date BETWEEN $2 AND $3
     ORDER BY b.check_in_date ASC`,
    [hotelId, startDate, endDate]
  );
  return rows;
}

/**
 * Generate a compliance report for a hotel
 * @param {Object} params
 * @param {string} params.hotelId
 * @param {string} params.startDate  YYYY-MM-DD
 * @param {string} params.endDate    YYYY-MM-DD
 * @param {string} params.generatedBy - admin user ID
 * @returns {Promise<Object>} compliance report record
 */
async function generateReport({ hotelId, startDate, endDate, generatedBy }) {
  logger.info('Generating compliance report', { hotelId, startDate, endDate });

  const bookings = await fetchReportData(hotelId, startDate, endDate);

  const totalGuests     = bookings.length;
  const verifiedGuests  = bookings.filter(b => b.kyc_status === 'verified').length;
  const unverifiedGuests = totalGuests - verifiedGuests;
  const checkedIn       = bookings.filter(b => b.check_in_time).length;
  const checkedOut      = bookings.filter(b => b.check_out_time).length;

  // FRRO Form C compatible structure
  const reportData = {
    metadata: {
      generated_at:     new Date().toISOString(),
      period_start:     startDate,
      period_end:       endDate,
      generated_by:     generatedBy,
    },
    summary: {
      total_guests:      totalGuests,
      verified_guests:   verifiedGuests,
      unverified_guests: unverifiedGuests,
      checked_in:        checkedIn,
      checked_out:       checkedOut,
      compliance_rate:   totalGuests > 0 ? ((verifiedGuests / totalGuests) * 100).toFixed(1) : '0',
    },
    guests: bookings.map(b => ({
      booking_reference:  b.booking_reference,
      room_number:        b.room_number,
      check_in_date:      b.check_in_date,
      check_out_date:     b.check_out_date,
      check_in_time:      b.check_in_time,
      check_out_time:     b.check_out_time,
      guest_name:         b.guest_name,
      guest_phone:        b.guest_phone,
      id_type:            b.id_type,
      id_number:          b.id_number ? maskIdNumber(b.id_number) : null,
      kyc_status:         b.kyc_status,
      address:            b.extracted_address,
      dob:                b.extracted_dob,
    })),
  };

  // Save report to DB
  const { rows: [report] } = await query(
    `INSERT INTO compliance_reports
       (hotel_id, report_date, report_period_start, report_period_end,
        total_guests, verified_guests, unverified_guests,
        checked_in_count, checked_out_count, report_data, generated_by)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      hotelId,
      startDate,
      endDate,
      totalGuests,
      verifiedGuests,
      unverifiedGuests,
      checkedIn,
      checkedOut,
      JSON.stringify(reportData),
      generatedBy,
    ]
  );

  logger.info('Compliance report saved', { reportId: report.id });
  return report;
}

/** Mask middle digits of ID number for privacy in reports */
function maskIdNumber(id) {
  if (id.length <= 4) return id;
  return id.slice(0, 2) + '*'.repeat(id.length - 4) + id.slice(-2);
}

module.exports = { generateReport };
