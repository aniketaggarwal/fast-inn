
---

## IMPLEMENTATION ORDER (PHASES)

### PHASE 1: CORE BACKEND SETUP (Days 1-2)

1. **Initialize project**
```bash
   mkdir hotel-verify && cd hotel-verify
   mkdir backend frontend
   cd backend && npm init -y
```

2. **Install dependencies**
```bash
   npm install express dotenv pg redis bcrypt jsonwebtoken cors helmet morgan
   npm install --save-dev nodemon
```

3. **Create database & tables**
   - Set up PostgreSQL locally (use Docker: `docker run -e POSTGRES_PASSWORD=password postgres`)
   - Run the SQL schema above

4. **Setup Express server**
   - Create `src/app.js` with basic middleware (cors, helmet, morgan)
   - Create `server.js` entry point
   - Setup `.env` with DATABASE_URL, JWT_SECRET, REDIS_URL

5. **Create auth service**
   - User registration endpoint (`POST /api/auth/register`)
   - User login endpoint (`POST /api/auth/login`)
   - JWT token generation
   - Hash passwords with bcrypt

**Difficult Part Here:** Password hashing & JWT - ensure you're salting 
properly and tokens include role info for authorization checks later.

---

### PHASE 2: GUEST KYC & OCR (Days 3-4)

**This is the complex part. Pay attention.**

1. **Install Tesseract**
```bash
   npm install tesseract.js
```

2. **Create OCR Service** (`src/services/ocr.js`)
   
   **What it needs to do:**
   - Accept an image (base64 or file path)
   - Extract text using Tesseract
   - Parse extracted text to find ID number, name, DOB, address
   - Return structured data
   - Return confidence score

   **The Tricky Part:** Tesseract doesn't perfectly extract ID info.
   You need to:
   - Use regex patterns to find Aadhaar (12 digits), Passport (letter+numbers)
   - Extract DOB format (DD/MM/YYYY or similar)
   - Handle poor image quality (rotation, low contrast)
   - Store confidence score - if < 70%, mark as "manual review needed"

   **Pseudo-code:**
```javascript
   async function extractIDData(imagePath) {
     const { data: { text } } = await Tesseract.recognize(imagePath);
     
     const idNumber = extractIDNumber(text);      // Regex parsing
     const dob = extractDOB(text);                // Regex parsing
     const name = extractName(text);              // First 1-2 lines usually
     const confidence = calculateConfidence(text); // 0-1 score
     
     return { idNumber, dob, name, address, confidence };
   }
```

3. **Document Validator Service** (`src/services/documentValidator.js`)
   
   **What it does:**
   - Validates Aadhaar format (12 digits, passes Luhn check)
   - Validates Passport format
   - Validates Driving License format
   - Checks for duplicate IDs in database (flag duplicate guests)
   - Checks expiry dates
   - Detects fake/tampered documents (basic check: image metadata, size)

   **Tricky Parts:**
   - Aadhaar checksum validation (Verhoeff algorithm)
   - Detecting if same person is registering twice (duplication logic)
   - Handling borderline confidence scores (60-75%) - should require human review

4. **Create KYC endpoints**