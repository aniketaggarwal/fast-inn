# 🏨 HotelVerify

> **DigiYatra-style digital guest verification & check-in platform for Indian hotels**

HotelVerify replaces paper Form C with instant KYC verification, QR code check-in, and automated FRRO compliance reports — all in one B2B SaaS platform.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **OCR-powered KYC** | Tesseract.js extracts Aadhaar, PAN, Passport, Driving License fields automatically |
| **QR Code Check-in** | Guests receive a unique QR + 6-digit PIN; staff scan at reception |
| **Role-based Access** | Guest / Hotel Staff / Admin dashboards with JWT auth |
| **Compliance Reports** | Auto-generate FRRO Form C-compatible JSON reports with CSV export |
| **Email Notifications** | Booking confirmation, KYC approved/rejected emails |
| **Real-time Queue** | Hotel staff see live KYC verification queue |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **API** | Node.js + Express.js |
| **Database** | PostgreSQL 16 |
| **Cache / OTP** | Redis 7 |
| **Auth** | JWT (jsonwebtoken) |
| **OCR** | tesseract.js |
| **Frontend** | React 18 + Vite 5 + Tailwind CSS 3 |
| **Storage** | Local disk (MVP) → AWS S3 (prod) |
| **DevOps** | Docker + Docker Compose + GitHub Actions |

---

## 🚀 Quick Start (Docker Compose)

```bash
# 1. Clone & setup env
git clone <repo-url> && cd Fast-in
cp backend/.env.example backend/.env

# 2. Start everything
docker compose up

# Services:
#   API:      http://localhost:5000
#   Frontend: http://localhost:5173
#   Health:   http://localhost:5000/health
```

---

## 🔧 Local Development (without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- Redis 7

```bash
# Backend
cd backend
cp .env.example .env       # edit with your DB/Redis creds
npm install
psql $DATABASE_URL -f migrations/001_initial_schema.sql
npm run dev                # http://localhost:5000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

---

## 📡 API Reference

### Auth
```
POST /api/auth/register    { full_name, email, phone, password, role }
POST /api/auth/login       { email, password }
GET  /api/auth/me          (requires JWT)
POST /api/auth/otp/send    { phone|email, purpose }
POST /api/auth/otp/verify  { phone|email, otp, purpose }
```

### Guests / KYC
```
POST  /api/guests/kyc/upload        (multipart: id_document, face_photo)
GET   /api/guests/kyc/status        Guest: own KYC status
GET   /api/guests/kyc               Admin/Staff: list pending KYC
GET   /api/guests/kyc/:id           Single KYC record
PATCH /api/guests/kyc/:id/verify    Admin: approve
PATCH /api/guests/kyc/:id/reject    Admin: reject with reason
```

### Hotels
```
POST  /api/hotels                   Register hotel
GET   /api/hotels                   List verified hotels
GET   /api/hotels/:id               Single hotel
PATCH /api/hotels/:id               Update hotel
PATCH /api/hotels/:id/verify        Admin: verify
PATCH /api/hotels/:id/reject        Admin: reject
GET   /api/hotels/my/dashboard      Staff: own hotel stats
```

### Bookings
```
POST  /api/bookings                 Create booking (returns QR token + PIN)
GET   /api/bookings                 List (role-filtered)
GET   /api/bookings/:id             Single booking with QR info
PATCH /api/bookings/:id/status      Update status
```

### Check-in
```
POST /api/checkin              { booking_id, pin_code }
POST /api/checkin/checkout     { booking_id, notes? }
GET  /api/checkin/scan/:qrCode QR scan lookup
GET  /api/checkin/today        Today's arrivals
```

### Compliance
```
POST /api/compliance/generate         { hotel_id, report_period_start, report_period_end }
GET  /api/compliance/reports          List reports
GET  /api/compliance/reports/:id      Full report with guest data
```

---

## 🔐 Environment Variables

See [`backend/.env.example`](./backend/.env.example) for all variables.

Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Min 64-char secret key |
| `STORAGE_TYPE` | `local` (MVP) or `s3` (prod) |
| `FRONTEND_URL` | CORS origin |

---

## 🗃 Database Schema

7 tables: `users`, `hotels`, `guest_kyc`, `bookings`, `guest_documents`, `checkin_checkouts`, `compliance_reports`, `otp_log`

See [`backend/migrations/001_initial_schema.sql`](./backend/migrations/001_initial_schema.sql)

---

## 👤 User Roles

| Role | Access |
|------|--------|
| `guest` | Upload KYC, create bookings, view own data |
| `hotel_staff` | View guest queue, process check-in/out, generate reports |
| `admin` | Full platform access, verify hotels and KYC |

---

## 🏗 Folder Structure

```
Fast-in/
├── backend/                 # Express API
│   ├── migrations/          # SQL schema files
│   ├── src/
│   │   ├── config/          # db.js, redis.js, env.js
│   │   ├── middleware/       # auth, roleCheck, errorHandler
│   │   ├── routes/          # auth, guests, hotels, bookings, checkin, compliance
│   │   ├── services/        # ocr, otp, s3, email, complianceGenerator
│   │   └── utils/           # jwt, qrCode, validators, logger
│   └── server.js
├── frontend/                # React + Vite
│   └── src/
│       ├── components/      # KYC, HotelDashboard, ComplianceReports, Common
│       ├── pages/           # LandingPage, LoginPage, GuestDashboard, ...
│       ├── services/        # api.js (Axios)
│       └── store/           # authContext.jsx
├── .github/workflows/       # CI/CD
└── docker-compose.yml
```

---

## 📋 Roadmap

- [ ] DigiLocker / UIDAI API integration (real Aadhaar verification)
- [ ] Razorpay payment integration
- [ ] Mobile app (React Native)
- [ ] SMS OTP via Twilio
- [ ] PDF export for compliance reports
- [ ] Multi-language support (Hindi, Tamil, Telugu)
- [ ] Webhook notifications for PMS integration

---

## 📄 License

MIT © HotelVerify 2026
