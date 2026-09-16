const sharp = require("sharp");

// BLUR_VARIANCE_MIN is calibrated empirically against this project's own
// synthetic card corpus (see the sweep in issuer/test/quality.test.js):
// an unblurred render measures ~6300, a heavily blurred/illegible one
// ~3600-3800. It is NOT a universal photographic constant — Section 9.1's
// "variance of Laplacian" metric is scene-dependent, and a real
// photographed ID (with texture, glare, noise) would need its own
// calibration pass against real samples, exactly like Milestone 6's
// face-match threshold gets tuned against measured FAR/FRR rather than
// guessed. BRIGHTNESS_*/CONTENT_AREA_FRACTION_MIN remain uncalibrated
// starting defaults, called out honestly rather than dressed up as
// measured.
const BLUR_VARIANCE_MIN = 4500;
const BRIGHTNESS_MIN = 40;
const BRIGHTNESS_MAX = 220;
const CONTENT_AREA_FRACTION_MIN = 0.5;

// Laplacian kernel: the standard 3x3 edge-detection operator. A sharp
// image has strong edges everywhere -> high-variance Laplacian response.
// A blurry image has smoothed-out edges -> low variance. This is the
// well-known "variance of Laplacian" blur metric (Section 9.1).
const LAPLACIAN_KERNEL = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
};

async function measureBlurVariance(buffer) {
  const { channels } = await sharp(buffer).greyscale().convolve(LAPLACIAN_KERNEL).stats();
  return channels[0].stdev ** 2;
}

async function measureBrightness(buffer) {
  const { channels } = await sharp(buffer).greyscale().stats();
  return channels[0].mean;
}

// Uses sharp's trim() (strips uniform-colored borders) as a cheap proxy
// for "how much of the frame the document actually occupies". A photo
// where the ID is small and centered in a lot of background gets trimmed
// down a lot; a full-bleed card image (like our synthetic fixtures, or a
// well-cropped real upload) barely changes size.
async function measureContentAreaFraction(buffer) {
  const original = sharp(buffer);
  const { width, height } = await original.metadata();
  const trimmed = await sharp(buffer).trim({ threshold: 20 }).metadata();
  const originalArea = width * height;
  const trimmedArea = (trimmed.width || width) * (trimmed.height || height);
  return Math.min(1, trimmedArea / originalArea);
}

// Rejects an upload before it ever reaches OCR — cheap to compute, and
// gives the guest an actionable reason instead of a mysteriously failed
// extraction three steps later (Section 9.1).
async function runQualityGate(buffer) {
  const [blurVariance, brightness, contentAreaFraction] = await Promise.all([
    measureBlurVariance(buffer),
    measureBrightness(buffer),
    measureContentAreaFraction(buffer),
  ]);

  const reasons = [];
  if (blurVariance < BLUR_VARIANCE_MIN) reasons.push("too_blurry");
  if (brightness < BRIGHTNESS_MIN) reasons.push("too_dark");
  if (brightness > BRIGHTNESS_MAX) reasons.push("too_bright");
  if (contentAreaFraction < CONTENT_AREA_FRACTION_MIN) reasons.push("document_too_small_in_frame");

  return {
    passed: reasons.length === 0,
    reasons,
    metrics: { blurVariance, brightness, contentAreaFraction },
  };
}

module.exports = {
  runQualityGate,
  measureBlurVariance,
  measureBrightness,
  measureContentAreaFraction,
  BLUR_VARIANCE_MIN,
  BRIGHTNESS_MIN,
  BRIGHTNESS_MAX,
  CONTENT_AREA_FRACTION_MIN,
};
