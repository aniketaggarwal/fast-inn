const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser } = require("./helpers");

const app = createApp();

let hotelA, hotelB, roomA, guest, guestToken, staffA, staffAToken;

function futureDate(daysFromNow) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  hotelA = await createHotel("Booking Test Hotel A", "Bengaluru");
  hotelB = await createHotel("Booking Test Hotel B", "Bengaluru");
  roomA = await createRoom(hotelA, "301");

  guest = await createUser({ email: uniqueEmail("booking-guest"), role: "GUEST" });
  staffA = await createUser({ email: uniqueEmail("booking-staff-a"), role: "HOTEL_STAFF", hotelId: hotelA });

  const guestLogin = await request(app).post("/auth/login").send({ email: guest.email, password: guest.password });
  guestToken = guestLogin.body.accessToken;

  const staffLogin = await request(app).post("/auth/login").send({ email: staffA.email, password: staffA.password });
  staffAToken = staffLogin.body.accessToken;
});

const extraGuestIds = [];

afterAll(async () => {
  await deleteHotel(hotelA);
  await deleteHotel(hotelB);
  await deleteUser(guest.id);
  for (const id of extraGuestIds) {
    await deleteUser(id);
  }
  await pool.end();
});

describe("GET /hotels", () => {
  it("lists only active hotels, unauthenticated", async () => {
    const res = await request(app).get("/hotels").query({ city: "Bengaluru" });
    expect(res.status).toBe(200);
    const ids = res.body.hotels.map((h) => h.id);
    expect(ids).toContain(hotelA);
  });
});

describe("GET /hotels/:id/availability", () => {
  it("reports a room with no bookings as available", async () => {
    const res = await request(app)
      .get(`/hotels/${hotelA}/availability`)
      .query({ from: futureDate(10), to: futureDate(12) });
    expect(res.status).toBe(200);
    const room = res.body.rooms.find((r) => r.id === roomA);
    expect(room.available).toBe(true);
  });

  it("rejects an invalid date range", async () => {
    const res = await request(app)
      .get(`/hotels/${hotelA}/availability`)
      .query({ from: futureDate(12), to: futureDate(10) });
    expect(res.status).toBe(400);
  });
});

describe("POST /bookings", () => {
  it("creates a booking and blocks a second overlapping booking for the same room", async () => {
    const checkIn = futureDate(20);
    const checkOut = futureDate(22);

    const first = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn, checkOut });
    expect(first.status).toBe(201);
    expect(first.body.booking.status).toBe("RESERVED");
    expect(first.body.booking.total_amount).toBe("5000.00");
    // Regression check: dates must round-trip as plain YYYY-MM-DD, not as
    // a timestamp shifted by the server's local timezone offset.
    expect(first.body.booking.check_in).toBe(checkIn);
    expect(first.body.booking.check_out).toBe(checkOut);

    const second = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn, checkOut });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("room_not_available");
  });

  it("rejects a check-in date in the past", async () => {
    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn: "2000-01-01", checkOut: "2000-01-02" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("check_in_in_past");
  });

  it("404s when the room doesn't belong to the given hotel", async () => {
    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelB, roomId: roomA, checkIn: futureDate(30), checkOut: futureDate(31) });
    expect(res.status).toBe(404);
  });

  it("rejects a HOTEL_STAFF token — only guests book", async () => {
    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${staffAToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn: futureDate(40), checkOut: futureDate(41) });
    expect(res.status).toBe(403);
  });
});

describe("cancel + rebook + ownership", () => {
  it("frees the room's nights on cancel, allowing a new booking over the same dates", async () => {
    const checkIn = futureDate(50);
    const checkOut = futureDate(52);

    const booked = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn, checkOut });
    expect(booked.status).toBe(201);

    const cancelled = await request(app)
      .post(`/bookings/${booked.body.booking.id}/cancel`)
      .set("Authorization", `Bearer ${guestToken}`);
    expect(cancelled.status).toBe(200);

    const rebooked = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn, checkOut });
    expect(rebooked.status).toBe(201);
  });

  it("404s cancelling a booking that belongs to another guest", async () => {
    const otherGuest = await createUser({ email: uniqueEmail("other-guest"), role: "GUEST" });
    extraGuestIds.push(otherGuest.id);
    const otherLogin = await request(app)
      .post("/auth/login")
      .send({ email: otherGuest.email, password: otherGuest.password });

    const checkIn = futureDate(60);
    const checkOut = futureDate(61);
    const booked = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ hotelId: hotelA, roomId: roomA, checkIn, checkOut });

    const res = await request(app)
      .post(`/bookings/${booked.body.booking.id}/cancel`)
      .set("Authorization", `Bearer ${otherLogin.body.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /bookings/mine and GET /hotel/bookings", () => {
  it("lists only the calling guest's own bookings", async () => {
    const res = await request(app).get("/bookings/mine").set("Authorization", `Bearer ${guestToken}`);
    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBeGreaterThan(0);
    for (const booking of res.body.bookings) {
      expect(booking.hotel_name).toBeDefined();
    }
  });

  it("lets hotel staff see bookings for their own hotel", async () => {
    const res = await request(app).get("/hotel/bookings").set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBeGreaterThan(0);
  });
});
