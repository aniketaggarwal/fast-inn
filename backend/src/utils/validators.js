'use strict';
/**
 * validators.js — Zod request-body schemas
 */
const { z } = require('zod');

// ── Shared primitives ─────────────────────────────────────────
const uuid = z.string().uuid();
const email = z.string().email('Invalid email address');
const phone = z.string()
  .regex(/^\+?[6-9]\d{9}$/, 'Invalid Indian phone number (10 digits, starts with 6-9)');
const password = z.string().min(8, 'Password must be at least 8 characters');

// ── Auth ──────────────────────────────────────────────────────
const registerSchema = z.object({
  full_name: z.string().min(2, 'Full name required'),
  email,
  phone,
  password,
  role: z.enum(['guest', 'hotel_staff', 'admin']).default('guest'),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password required'),
});

const otpSendSchema = z.object({
  phone: phone.optional(),
  email: email.optional(),
  purpose: z.enum(['login', 'kyc_verify', 'checkout']).default('login'),
}).refine((d) => d.phone || d.email, { message: 'Phone or email is required' });

const otpVerifySchema = z.object({
  phone: phone.optional(),
  email: email.optional(),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/),
  purpose: z.enum(['login', 'kyc_verify', 'checkout']).default('login'),
});

// ── Hotel ─────────────────────────────────────────────────────
const createHotelSchema = z.object({
  name:                  z.string().min(2),
  address:               z.string().min(5),
  city:                  z.string().min(2),
  state:                 z.string().min(2),
  pincode:               z.string().regex(/^\d{6}$/, 'Invalid pincode'),
  phone:                 z.string().min(8),
  email,
  latitude:              z.number().optional(),
  longitude:             z.number().optional(),
  room_count:            z.number().int().positive().optional(),
  registration_license:  z.string().optional(),
});

const updateHotelSchema = createHotelSchema.partial();

// ── KYC ──────────────────────────────────────────────────────
const kycUploadSchema = z.object({
  id_type:       z.enum(['aadhaar', 'passport', 'driving_license', 'pan']),
  id_number:     z.string().min(4, 'ID number required'),
  id_expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

const kycRejectSchema = z.object({
  rejection_reason: z.string().min(5, 'Rejection reason required'),
});

// ── Booking ───────────────────────────────────────────────────
const createBookingSchema = z.object({
  hotel_id:       uuid,
  room_number:    z.string().min(1),
  room_type:      z.string().optional(),
  check_in_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  num_guests:     z.number().int().min(1).max(10).default(1),
  price:          z.number().positive().optional(),
  special_requests: z.string().max(500).optional(),
}).refine((d) => d.check_out_date > d.check_in_date, {
  message: 'Check-out must be after check-in',
});

// ── Check-in ──────────────────────────────────────────────────
const checkInSchema = z.object({
  booking_id: uuid,
  pin_code:   z.string().length(6).regex(/^\d+$/),
});

const checkOutSchema = z.object({
  booking_id: uuid,
  notes:      z.string().max(500).optional(),
});

// ── Compliance ────────────────────────────────────────────────
const generateReportSchema = z.object({
  hotel_id:            uuid,
  report_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  report_period_end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((d) => d.report_period_end >= d.report_period_start, {
  message: 'End date must be >= start date',
});

/**
 * Validate request body against a Zod schema
 * Returns parsed data or throws ZodError
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error:   'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validate,
  schemas: {
    registerSchema,
    loginSchema,
    otpSendSchema,
    otpVerifySchema,
    createHotelSchema,
    updateHotelSchema,
    kycUploadSchema,
    kycRejectSchema,
    createBookingSchema,
    checkInSchema,
    checkOutSchema,
    generateReportSchema,
  },
};
