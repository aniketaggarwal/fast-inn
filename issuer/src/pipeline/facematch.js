const path = require("path");
const { Canvas, Image, ImageData, loadImage } = require("canvas");

// @vladmandic/face-api's default Node entry (dist/face-api.node.js)
// hardcodes `require("@tensorflow/tfjs-node")` — the native TF binding.
// That binding's published 4.22.0 build calls a tfjs-core util function
// (`isNullOrUndefined`) that was removed from tfjs-core 4.22.0 itself; the
// fix (tensorflow/tfjs#8425) merged upstream but was never published to
// npm (see the still-open tensorflow/tfjs#8746, filed independently by
// someone hitting the exact same stack trace against Node 26.x). Rather
// than depend on a broken native addon, this loads face-api's WASM Node
// build instead — pure JS + WebAssembly, no native compile step, and it
// sidesteps the bug entirely because it never touches tfjs-node.
const faceapi = require("@vladmandic/face-api/dist/face-api.node-wasm.js");

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODEL_PATH = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "model");

// Tuned against a measured FAR/FRR sweep (0.30-0.80 step 0.05) over 31
// usable genuine + 31 usable impostor pairs from the LFW verification-pairs
// benchmark (see scripts/face-far-frr-sweep.js and
// docs/face-match-far-frr.md for the full table, methodology, and
// caveats). At 0.6, measured FAR is 0.0% and FRR is 3.2% — the most
// permissive threshold tested that still keeps FAR at 0%, per Section
// 9.2's own guidance to bias toward rejecting impostors (who fall through
// to human review, not a hard rejection) rather than accepting them, since
// this threshold decides whether a KYC submission auto-issues a
// credential with no human ever looking at it.
const FACE_MATCH_THRESHOLD = 0.6;

let modelsReadyPromise = null;

function ensureModelsLoaded() {
  if (!modelsReadyPromise) {
    modelsReadyPromise = (async () => {
      await faceapi.tf.setBackend("wasm");
      await faceapi.tf.ready();
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
    })();
  }
  return modelsReadyPromise;
}

// Runs full detection (not just the fast single-face shortcut) so a
// multi-face photo can be told apart from a no-face one, instead of both
// collapsing into the same "detectSingleFace found nothing" result.
async function detectFaces(buffer) {
  await ensureModelsLoaded();
  const image = await loadImage(buffer);
  return faceapi.detectAllFaces(image).withFaceLandmarks().withFaceDescriptors();
}

// Classifies why a photo can't yield a usable descriptor (Section 9.4):
// no face found, more than one face found, or success. A caller needing
// just the descriptor for the FAR/FRR sweep can still read it off the
// returned detections array itself.
async function faceDescriptorFor(buffer) {
  const detections = await detectFaces(buffer);
  if (detections.length === 0) return { status: "no_face", descriptor: null };
  if (detections.length > 1) return { status: "multiple_faces", descriptor: null };
  return { status: "ok", descriptor: detections[0].descriptor };
}

function euclideanDistance(a, b) {
  return faceapi.euclideanDistance(a, b);
}

// Compares the ID document photo against the selfie. Reports which side
// failed detection (Section 9.4's explicit no-face/multi-face handling)
// rather than a generic failure, since the KYC review UI and the guest
// error message need to say which image to retake.
async function matchFaces(idPhotoBuffer, selfieBuffer) {
  const [idResult, selfieResult] = await Promise.all([
    faceDescriptorFor(idPhotoBuffer),
    faceDescriptorFor(selfieBuffer),
  ]);

  if (idResult.status !== "ok" || selfieResult.status !== "ok") {
    return {
      status: idResult.status !== "ok" ? `id_photo_${idResult.status}` : `selfie_${selfieResult.status}`,
      distance: null,
      score: null,
      matched: false,
    };
  }

  const distance = euclideanDistance(idResult.descriptor, selfieResult.descriptor);
  // Distance is unbounded above but 0 at identical; a 0-1 "score" for
  // human/UI display only clamps it — matching decisions use the raw
  // distance against FACE_MATCH_THRESHOLD, not this derived score.
  const score = Math.max(0, 1 - distance);

  return {
    status: "ok",
    distance,
    score,
    matched: distance <= FACE_MATCH_THRESHOLD,
  };
}

module.exports = {
  matchFaces,
  faceDescriptorFor,
  euclideanDistance,
  ensureModelsLoaded,
  FACE_MATCH_THRESHOLD,
  MODEL_PATH,
};
