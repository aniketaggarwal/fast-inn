const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function getToken() {
  return localStorage.getItem("accessToken");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
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
};
