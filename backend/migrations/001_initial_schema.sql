-- ============================================================
--  HotelVerify — Initial Database Schema
--  Migration: 001_initial_schema.sql
--  PostgreSQL 14+
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
--  ENUM Types
-- ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('guest', 'hotel_staff', 'admin');

CREATE TYPE hotel_verification_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TYPE id_type AS ENUM ('aadhaar', 'passport', 'driving_license', 'pan');

CREATE TYPE kyc_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TYPE booking_status AS ENUM (
  'pending_kyc',
  'kyc_verified',
  'checked_in',
  'checked_out',
  'cancelled'
);

-- ─────────────────────────────────────────
--  Helper: auto-update updated_at
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────
--  Table: users
-- ─────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(15) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'guest',
  full_name     VARCHAR(255) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role  ON users(role);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
--  Table: hotels
-- ─────────────────────────────────────────
CREATE TABLE hotels (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  name                  VARCHAR(255) NOT NULL,
  address               TEXT NOT NULL,
  city                  VARCHAR(100) NOT NULL,
  state                 VARCHAR(100) NOT NULL,
  pincode               VARCHAR(10) NOT NULL,
  phone                 VARCHAR(15) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  latitude              DECIMAL(9,6),
  longitude             DECIMAL(9,6),
  room_count            INT,
  registration_license  VARCHAR(100) UNIQUE,
  logo_url              VARCHAR(500),
  verification_status   hotel_verification_status NOT NULL DEFAULT 'pending',
  verified_at           TIMESTAMP,
  rejected_reason       TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hotels_admin_id           ON hotels(admin_id);
CREATE INDEX idx_hotels_verification_status ON hotels(verification_status);
CREATE INDEX idx_hotels_city               ON hotels(city);

CREATE TRIGGER trg_hotels_updated_at
  BEFORE UPDATE ON hotels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
--  Table: guest_kyc
-- ─────────────────────────────────────────
CREATE TABLE guest_kyc (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  id_type               id_type NOT NULL,
  id_number             VARCHAR(50) NOT NULL,
  id_document_url       VARCHAR(500) NOT NULL,
  id_document_back_url  VARCHAR(500),
  id_expiry_date        DATE,
  face_photo_url        VARCHAR(500),
  extracted_name        VARCHAR(255),
  extracted_dob         DATE,
  extracted_address     TEXT,
  extracted_id_number   VARCHAR(50),
  ocr_confidence_score  DECIMAL(4,3),  -- 0.000 to 1.000
  verification_status   kyc_status NOT NULL DEFAULT 'pending',
  verified_by_admin_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at           TIMESTAMP,
  rejection_reason      TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guest_kyc_user_id            ON guest_kyc(user_id);
CREATE INDEX idx_guest_kyc_verification_status ON guest_kyc(verification_status);
CREATE INDEX idx_guest_kyc_id_type            ON guest_kyc(id_type);

CREATE TRIGGER trg_guest_kyc_updated_at
  BEFORE UPDATE ON guest_kyc
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
--  Table: bookings
-- ─────────────────────────────────────────
CREATE TABLE bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
  hotel_id          UUID REFERENCES hotels(id) ON DELETE RESTRICT,
  room_number       VARCHAR(20) NOT NULL,
  room_type         VARCHAR(50),
  check_in_date     DATE NOT NULL,
  check_out_date    DATE NOT NULL,
  num_guests        INT NOT NULL DEFAULT 1,
  price             DECIMAL(10,2),
  status            booking_status NOT NULL DEFAULT 'pending_kyc',
  booking_reference VARCHAR(20) UNIQUE NOT NULL,
  special_requests  TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dates CHECK (check_out_date > check_in_date),
  CONSTRAINT chk_num_guests CHECK (num_guests > 0)
);

CREATE INDEX idx_bookings_guest_user_id ON bookings(guest_user_id);
CREATE INDEX idx_bookings_hotel_id      ON bookings(hotel_id);
CREATE INDEX idx_bookings_status        ON bookings(status);
CREATE INDEX idx_bookings_check_in_date ON bookings(check_in_date);
CREATE INDEX idx_bookings_reference     ON bookings(booking_reference);

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
--  Table: guest_documents
-- ─────────────────────────────────────────
CREATE TABLE guest_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID REFERENCES bookings(id) ON DELETE CASCADE,
  guest_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  document_type VARCHAR(50) NOT NULL,  -- 'registration_form', 'signed_agreement', 'id_copy'
  document_url  VARCHAR(500) NOT NULL,
  file_size     INT,                   -- bytes
  mime_type     VARCHAR(50),
  notes         TEXT,
  uploaded_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  verified_at   TIMESTAMP,
  verified_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_guest_documents_booking_id    ON guest_documents(booking_id);
CREATE INDEX idx_guest_documents_guest_user_id ON guest_documents(guest_user_id);

-- ─────────────────────────────────────────
--  Table: checkin_checkouts
-- ─────────────────────────────────────────
CREATE TABLE checkin_checkouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID REFERENCES bookings(id) ON DELETE RESTRICT UNIQUE,
  guest_user_id   UUID REFERENCES users(id) ON DELETE RESTRICT,
  hotel_id        UUID REFERENCES hotels(id) ON DELETE RESTRICT,
  check_in_time   TIMESTAMP,
  check_out_time  TIMESTAMP,
  checked_in_by   UUID REFERENCES users(id) ON DELETE SET NULL,  -- staff member
  checked_out_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  qr_code         VARCHAR(255) UNIQUE,
  pin_code        VARCHAR(10),
  qr_expires_at   TIMESTAMP,
  ip_address      VARCHAR(45),
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkin_booking_id  ON checkin_checkouts(booking_id);
CREATE INDEX idx_checkin_hotel_id    ON checkin_checkouts(hotel_id);
CREATE INDEX idx_checkin_qr_code     ON checkin_checkouts(qr_code);
CREATE INDEX idx_checkin_check_in_time ON checkin_checkouts(check_in_time);

-- ─────────────────────────────────────────
--  Table: compliance_reports
-- ─────────────────────────────────────────
CREATE TABLE compliance_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id         UUID REFERENCES hotels(id) ON DELETE CASCADE,
  report_date      DATE NOT NULL,
  report_period_start DATE,
  report_period_end   DATE,
  total_guests     INT NOT NULL DEFAULT 0,
  verified_guests  INT NOT NULL DEFAULT 0,
  unverified_guests INT NOT NULL DEFAULT 0,
  checked_in_count INT NOT NULL DEFAULT 0,
  checked_out_count INT NOT NULL DEFAULT 0,
  report_data      JSONB,          -- detailed guest data
  pdf_url          VARCHAR(500),   -- generated PDF path
  generated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_hotel_id    ON compliance_reports(hotel_id);
CREATE INDEX idx_compliance_report_date ON compliance_reports(report_date);

-- ─────────────────────────────────────────
--  Table: otp_log (audit trail)
-- ─────────────────────────────────────────
CREATE TABLE otp_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(15),
  email       VARCHAR(255),
  purpose     VARCHAR(50) NOT NULL,  -- 'login', 'kyc_verify', 'checkout'
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMP,
  expired_at  TIMESTAMP
);

CREATE INDEX idx_otp_log_phone ON otp_log(phone);
CREATE INDEX idx_otp_log_email ON otp_log(email);
