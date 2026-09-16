const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const ISSUER_BASE = import.meta.env.VITE_ISSUER_BASE || "http://localhost:4001";

function getToken() {
  return localStorage.getItem("accessToken");
}

async function baseRequest(base, path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `request_failed_${res.status}`);
    error.status = res.status;
    error.body = data;
    throw error;
  }
  return data;
}

const request = (path, opts) => baseRequest(API_BASE, path, opts);
// The guest app talks to the issuer directly for KYC — no api-issued JWT
// is involved on this path at all (Section 4 architecture diagram).
const issuerRequest = (path, opts) => baseRequest(ISSUER_BASE, path, { ...opts, auth: false });

export const api = {
  register: (email, password) => request("/auth/register", { method: "POST", body: { email, password }, auth: false }),
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password }, auth: false }),

  listHotels: (city) => request(`/hotels${city ? `?city=${encodeURIComponent(city)}` : ""}`, { auth: false }),
  availability: (hotelId, from, to) =>
    request(`/hotels/${hotelId}/availability?from=${from}&to=${to}`, { auth: false }),

  createBooking: (hotelId, roomId, checkIn, checkOut) =>
    request("/bookings", { method: "POST", body: { hotelId, roomId, checkIn, checkOut } }),
  myBookings: () => request("/bookings/mine"),
  cancelBooking: (bookingId) => request(`/bookings/${bookingId}/cancel`, { method: "POST" }),

  hotelRooms: () => request("/hotel/rooms"),
  hotelBookings: () => request("/hotel/bookings"),

  startCheckin: (bookingId) => request("/checkin/sessions", { method: "POST", body: { bookingId } }),
  getCheckinSession: (sessionId) => request(`/checkin/sessions/${sessionId}`),
  completeCheckin: (sessionId) => request(`/checkin/sessions/${sessionId}/complete`, { method: "POST" }),
  // Public — the guest's browser isn't logged into api for this at all
  // (Section 4); security comes from the signed presentation itself.
  presentCheckin: (sessionId, payload) =>
    request(`/checkin/sessions/${sessionId}/present`, { method: "POST", body: payload, auth: false }),

  // PLATFORM_ADMIN only — proxied through api, which attaches the
  // issuer's shared service secret itself (api/src/routes/issuerReview.js).
  issuerReviewQueue: () => request("/issuer/review"),
  issuerDecide: (submissionId, payload) =>
    request(`/issuer/review/${submissionId}/decide`, { method: "POST", body: payload }),
  issuerRevoke: (credentialId, reason) =>
    request(`/issuer/admin/revoke/${credentialId}`, { method: "POST", body: { reason } }),

  // Guest-facing KYC — direct to the issuer, no api auth token.
  kycPresign: (docType) => issuerRequest("/kyc/uploads/presign", { method: "POST", body: { docType } }),
  kycSubmit: (payload) => issuerRequest("/kyc/submit", { method: "POST", body: payload }),
  kycStatus: (submissionId) => issuerRequest(`/kyc/${submissionId}/status`),

  async uploadToPresignedUrl(url, blob) {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type || "image/png" }, body: blob });
    if (!res.ok) {
      throw new Error(`upload_failed_${res.status}`);
    }
  },
};
