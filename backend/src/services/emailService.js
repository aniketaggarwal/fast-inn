'use strict';
/**
 * emailService.js — Nodemailer email service
 * Dev: uses Ethereal auto-test account (no config needed)
 * Prod: uses SMTP credentials from env
 */
const nodemailer = require('nodemailer');
const config     = require('../config/env');
const logger     = require('../utils/logger');

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (config.email.host) {
    // Production SMTP
    transporter = nodemailer.createTransport({
      host:   config.email.host,
      port:   config.email.port,
      secure: config.email.port === 465,
      auth:   { user: config.email.user, pass: config.email.pass },
    });
  } else {
    // Ethereal test account (dev only)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      auth:   { user: testAccount.user, pass: testAccount.pass },
    });
    logger.info(`[Dev Email] Ethereal account: ${testAccount.user}`);
  }

  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const t = await getTransporter();
  try {
    const info = await t.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    logger.info('Email sent', { messageId: info.messageId, to });
    if (nodemailer.getTestMessageUrl(info)) {
      logger.info(`[Dev Email Preview] ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (err) {
    logger.error('Email send failed', { error: err.message, to });
  }
}

// ── Email templates ──────────────────────────────────────────

const sendKYCApproved = (to, name) =>
  sendEmail({
    to,
    subject: 'HotelVerify — KYC Verification Approved ✅',
    html: `<h2>Hello ${name},</h2><p>Your identity has been verified. You can now complete hotel check-ins seamlessly.</p><br><p>— HotelVerify Team</p>`,
  });

const sendKYCRejected = (to, name, reason) =>
  sendEmail({
    to,
    subject: 'HotelVerify — KYC Verification Requires Attention',
    html: `<h2>Hello ${name},</h2><p>Your KYC submission was not approved. Reason: <strong>${reason}</strong>.</p><p>Please re-upload a clear, valid government ID.</p><br><p>— HotelVerify Team</p>`,
  });

const sendBookingConfirmation = (to, { guestName, hotelName, roomNumber, checkIn, checkOut, reference }) =>
  sendEmail({
    to,
    subject: `HotelVerify — Booking Confirmed (#${reference})`,
    html: `
      <h2>Booking Confirmed!</h2>
      <p>Dear ${guestName},</p>
      <table border="0" cellpadding="8">
        <tr><td><strong>Hotel</strong></td><td>${hotelName}</td></tr>
        <tr><td><strong>Room</strong></td><td>${roomNumber}</td></tr>
        <tr><td><strong>Check-in</strong></td><td>${checkIn}</td></tr>
        <tr><td><strong>Check-out</strong></td><td>${checkOut}</td></tr>
        <tr><td><strong>Reference</strong></td><td>${reference}</td></tr>
      </table>
      <p>Show your QR code at the hotel reception for seamless check-in.</p>
      <br><p>— HotelVerify Team</p>
    `,
  });

module.exports = {
  sendEmail,
  sendKYCApproved,
  sendKYCRejected,
  sendBookingConfirmation,
};
