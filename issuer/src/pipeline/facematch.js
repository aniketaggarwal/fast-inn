// Stub per Section 0: "OCR and face matching can be stubbed behind an
// interface during early milestones." Real face matching (face-api.js
// embeddings + a threshold tuned against measured FAR/FRR) is Milestone 6.
// This returns a marked-stub result rather than a fabricated score, so
// nothing downstream can mistake it for a real match decision — the KYC
// pipeline in this milestone does not gate on face_score at all.
async function stubFaceMatch() {
  return { score: null, stub: true };
}

module.exports = { stubFaceMatch };
