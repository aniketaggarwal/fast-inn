'use strict';
/**
 * ocr.js — Tesseract.js OCR service for Indian identity documents
 * Extracts name, DOB, ID number, and address from uploaded images
 */
const Tesseract = require('tesseract.js');
const logger    = require('../utils/logger');

/**
 * Patterns for Indian ID documents
 */
const PATTERNS = {
  aadhaar: {
    idNumber: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
    dob:      /(?:DOB|Date of Birth|D\.O\.B)[:\s]+(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})/i,
    name:     /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}$/m,
  },
  pan: {
    idNumber: /\b[A-Z]{5}\d{4}[A-Z]\b/,
    dob:      /(\d{2}[/-]\d{2}[/-]\d{4})/,
    name:     /^[A-Z][A-Z\s]+$/m,
  },
  passport: {
    idNumber: /\b[A-Z]\d{7}\b/,
    dob:      /(\d{2}\s\w{3}\s\d{4}|\d{2}[/-]\d{2}[/-]\d{4})/,
    name:     /(?:Surname|Given Name)[s]?[:\s]+(.+)/i,
  },
  driving_license: {
    idNumber: /\b[A-Z]{2}\d{2}\s?\d{4}\d{7}\b/,
    dob:      /(?:DOB|Date of Birth)[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})/i,
    name:     /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/m,
  },
};

/**
 * Parse OCR text to extract structured fields for the given ID type
 * @param {string} text - Raw OCR text
 * @param {string} idType - 'aadhaar' | 'pan' | 'passport' | 'driving_license'
 * @returns {Object} extracted fields
 */
function parseText(text, idType) {
  const patterns = PATTERNS[idType] || PATTERNS.aadhaar;
  const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ID number
  let idNumber = null;
  const idMatch = text.match(patterns.idNumber);
  if (idMatch) idNumber = idMatch[0].replace(/\s/g, '');

  // Date of Birth
  let dob = null;
  const dobMatch = text.match(patterns.dob);
  if (dobMatch) {
    const rawDate = dobMatch[1] || dobMatch[0];
    dob = normaliseDateString(rawDate);
  }

  // Name (heuristic: look for lines matching name pattern)
  let name = null;
  for (const line of lines) {
    if (line.length > 3 && line.length < 60 && patterns.name.test(line)) {
      name = line;
      break;
    }
  }

  // Address (lines after name/DOB for Aadhaar, simplified)
  let address = null;
  if (idType === 'aadhaar') {
    const addrStart = lines.findIndex(l => l.match(/\d{6}$/)); // ends with pincode
    if (addrStart > 0) {
      address = lines.slice(Math.max(0, addrStart - 3), addrStart + 1).join(', ');
    }
  }

  return { idNumber, dob, name, address };
}

/**
 * Normalise various date string formats to YYYY-MM-DD
 */
function normaliseDateString(raw) {
  if (!raw) return null;
  try {
    // Try DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = raw.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${m}-${d}`;
    }
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Calculate a simple confidence score based on what was extracted
 */
function calculateConfidence(extracted) {
  const fields  = ['idNumber', 'dob', 'name', 'address'];
  const present = fields.filter(f => extracted[f] !== null && extracted[f] !== undefined).length;
  return parseFloat((present / fields.length).toFixed(3));
}

/**
 * Run OCR on an image file and extract identity document fields
 * @param {string} imagePath - Absolute path to the uploaded image
 * @param {string} idType
 * @returns {Promise<Object>} { name, dob, address, idNumber, confidence, rawText }
 */
async function extractFromDocument(imagePath, idType = 'aadhaar') {
  logger.info('Starting OCR', { imagePath, idType });

  try {
    const { data } = await Tesseract.recognize(imagePath, 'eng+hin', {
      logger: m => {
        if (m.status === 'recognizing text') {
          logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const rawText  = data.text;
    const extracted = parseText(rawText, idType);
    const confidence = calculateConfidence(extracted);

    logger.info('OCR complete', { confidence, idType });

    return {
      ...extracted,
      confidence,
      rawText: rawText.slice(0, 2000), // truncate for storage
    };
  } catch (err) {
    logger.error('OCR failed', { error: err.message, imagePath });
    return {
      idNumber:   null,
      dob:        null,
      name:       null,
      address:    null,
      confidence: 0,
      rawText:    null,
      error:      err.message,
    };
  }
}

module.exports = { extractFromDocument };
