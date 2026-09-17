const sharp = require("sharp");
const { faceDescriptorFor } = require("./facematch");

const MIN_FRAMES = 3;
const MAX_FRAMES = 10;
const DIFF_SIZE = 100;

// Average per-pixel greyscale difference (0-255 scale) below which two
// frames are treated as "the same static image" rather than a live
// person's natural micro-movement. Uncalibrated against real webcam
// captures (this environment has no camera) — a starting default in the
// same honest spirit as quality.js's BRIGHTNESS_MIN/MAX, not a measured
// constant. See PROGRESS.md.
const MOTION_DIFF_MIN = 2.5;

// Section 9.3: shown to the guest by the frontend before capture, to
// elicit natural movement from a live person — a printed photo held up
// to the camera stays motionless no matter what it's asked to do. Never
// sent back here or checked against; see checkLiveness's own note on why.
const PROMPTS = ["Blink twice", "Turn your head left, then right", "Smile", "Nod your head"];

function randomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

async function greyscalePixels(buffer) {
  return sharp(buffer).resize(DIFF_SIZE, DIFF_SIZE, { fit: "fill" }).greyscale().raw().toBuffer();
}

function meanAbsDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// Checks exactly the two things Section 9.3 asks for — a face present in
// every frame, and frames that actually differ from each other — not
// whether the specific gesture the prompt asked for happened; face-api
// has no reliable "did this person blink" signal without much heavier
// landmark-sequence analysis this project doesn't attempt. That's an
// honest scope limit, not an oversight: this defeats a *casual* photo
// attack (a flat, motionless printed photo or a phone screen held up to
// the camera) and nothing stronger — it is not resistant to a video
// replay of a real person, nor to a 3D mask. See PROGRESS.md.
async function checkLiveness(frameBuffers) {
  if (!Array.isArray(frameBuffers) || frameBuffers.length < MIN_FRAMES) {
    return { passed: false, reason: "insufficient_frames" };
  }
  if (frameBuffers.length > MAX_FRAMES) {
    return { passed: false, reason: "too_many_frames" };
  }

  for (const frame of frameBuffers) {
    const result = await faceDescriptorFor(frame);
    if (result.status !== "ok") {
      return { passed: false, reason: result.status === "multiple_faces" ? "multiple_faces" : "face_not_detected" };
    }
  }

  const greyFrames = await Promise.all(frameBuffers.map(greyscalePixels));
  let totalDiff = 0;
  for (let i = 1; i < greyFrames.length; i++) {
    totalDiff += meanAbsDiff(greyFrames[i - 1], greyFrames[i]);
  }
  const avgDiff = totalDiff / (greyFrames.length - 1);

  if (avgDiff < MOTION_DIFF_MIN) {
    return { passed: false, reason: "no_motion_detected" };
  }

  return { passed: true, reason: null };
}

module.exports = { checkLiveness, randomPrompt, PROMPTS, MIN_FRAMES, MAX_FRAMES, MOTION_DIFF_MIN };
