// Demo-scale simplification: issuer identity is phone-based (guests table,
// decoupled from api's email/JWT accounts — see Section 4), and there's no
// wallet sync across devices yet. The browser's own localStorage is the
// wallet for now; a real guest-app PWA (Milestone 4+ repo layout) would
// need its own persistent, synced storage. Good enough to demonstrate the
// credential existing and being presentable, not production-grade.
const KEY = "hotelverify-wallet-credential";
const PENDING_KEY = "hotelverify-pending-kyc-submission";

export function saveCredential(credential) {
  localStorage.setItem(KEY, JSON.stringify(credential));
}

export function loadCredential() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearCredential() {
  localStorage.removeItem(KEY);
}

// A NEEDS_REVIEW submission has no credential yet — the guest's browser is
// never told when a reviewer later decides it (no push/poll connection to
// the review queue). Remembering the submission id lets the wallet page
// re-check status on demand ("Check back shortly") instead of the
// credential just silently never showing up.
export function savePendingSubmission(submissionId) {
  localStorage.setItem(PENDING_KEY, submissionId);
}

export function loadPendingSubmission() {
  return localStorage.getItem(PENDING_KEY);
}

export function clearPendingSubmission() {
  localStorage.removeItem(PENDING_KEY);
}
