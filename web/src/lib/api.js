const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const ISSUER_BASE = import.meta.env.VITE_ISSUER_BASE || "http://localhost:4001";

function getToken() {
  return localStorage.getItem("accessToken");
}

function clearSession() {
  localStorage.removeItem("user");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  // AuthContext holds `user` in React state, not read fresh from
  // localStorage on every render — a plain module like this one can't
  // reach into that state directly, so it announces the logout instead.
  // AuthContext listens for this to clear itself and the UI to actually
  // reflect it, instead of localStorage silently going stale under a
  // still-"logged in" screen.
  window.dispatchEvent(new Event("auth:logout"));
}

// Access tokens last 15 minutes (api/src/utils/jwt.js); refresh tokens 7
// days. Without this, every request made after the access token expires
// would just 401 until the user manually logged out and back in — a real
// reliability gap for anyone actually using the app for more than 15
// minutes at a stretch. `inFlightRefresh` collapses concurrent 401s (e.g.
// several requests firing at once) into a single refresh call rather than
// racing multiple refreshes against the same refresh token.
let inFlightRefresh = null;

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  if (!inFlightRefresh) {
    inFlightRefresh = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        return data?.accessToken || null;
      })
      .catch(() => null)
      .finally(() => {
        inFlightRefresh = null;
      });
  }

  const accessToken = await inFlightRefresh;
  if (accessToken) {
    localStorage.setItem("accessToken", accessToken);
  }
  return accessToken;
}

async function doFetch(base, path, method, headers, body) {
  return fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function baseRequest(base, path, { method = "GET", body, auth = true, _retried = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await doFetch(base, path, method, headers, body);

  // Retried once, and only for requests that actually carried a token —
  // an anonymous 401 (e.g. a genuinely wrong password) means there's
  // nothing to refresh.
  if (res.status === 401 && auth && headers.Authorization && !_retried) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return baseRequest(base, path, { method, body, auth, _retried: true });
    }
    clearSession();
  }

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
  getHotel: (hotelId) => request(`/hotels/${hotelId}`, { auth: false }),
  availability: (hotelId, from, to) =>
    request(`/hotels/${hotelId}/availability?from=${from}&to=${to}`, { auth: false }),

  createBooking: (hotelId, roomId, checkIn, checkOut) =>
    request("/bookings", { method: "POST", body: { hotelId, roomId, checkIn, checkOut } }),
  myBookings: () => request("/bookings/mine"),
  cancelBooking: (bookingId) => request(`/bookings/${bookingId}/cancel`, { method: "POST" }),

  hotelRooms: () => request("/hotel/rooms"),
  hotelBookings: () => request("/hotel/bookings"),
  hotelCheckout: (bookingId) => request(`/hotel/bookings/${bookingId}/checkout`, { method: "POST" }),

  hotelRegister: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request(`/hotel/register${qs ? `?${qs}` : ""}`);
  },
  // A plain <a href> can't carry the Authorization header, so this fetches
  // the CSV itself and hands back a Blob for the caller to save — same
  // auth path as every other request (including the refresh-on-401 retry),
  // not a signed/token-in-URL workaround.
  async downloadFormCCsv() {
    let token = getToken();
    let res = await fetch(`${API_BASE}/hotel/exports/form-c.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401 && token) {
      token = await refreshAccessToken();
      if (token) {
        res = await fetch(`${API_BASE}/hotel/exports/form-c.csv`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        clearSession();
      }
    }
    if (!res.ok) throw new Error(`export_failed_${res.status}`);
    return res.blob();
  },

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

  adminHotels: () => request("/admin/hotels"),
  adminAudit: (limit = 100) => request(`/admin/audit?limit=${limit}`),
  adminRegister: (limit = 100) => request(`/admin/register?limit=${limit}`),

  // Guest-facing DPDP "my data" screen.
  myConsents: () => request("/consents/mine"),
  withdrawConsent: (consentId) => request(`/consents/${consentId}/withdraw`, { method: "POST" }),
  deleteAccount: () => request("/account", { method: "DELETE" }),

  // Guest-facing KYC — direct to the issuer, no api auth token.
  kycPresign: (docType) => issuerRequest("/kyc/uploads/presign", { method: "POST", body: { docType } }),
  kycSubmit: (payload) => issuerRequest("/kyc/submit", { method: "POST", body: payload }),
  kycStatus: (submissionId) => issuerRequest(`/kyc/${submissionId}/status`),
  kycLivenessCheck: (frames) => issuerRequest("/kyc/liveness/check", { method: "POST", body: { frames } }),

  async uploadToPresignedUrl(url, blob) {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type || "image/png" }, body: blob });
    if (!res.ok) {
      throw new Error(`upload_failed_${res.status}`);
    }
  },
};
