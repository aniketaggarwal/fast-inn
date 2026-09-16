const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser } = require("./helpers");

const app = createApp();

function futureDate(daysFromNow) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

let hotelId, guest;

afterEach(async () => {
  // In afterEach (not at the end of the happy path) so a failed assertion
  // still cleans up — an earlier version of this test left an orphaned
  // hotel behind when the assertions above it threw first.
  if (guest) await deleteUser(guest.id);
  if (hotelId) await deleteHotel(hotelId);
  guest = undefined;
  hotelId = undefined;
});

afterAll(async () => {
  await pool.end();
});

// Section 9.5: two guests booking the last room at the same instant is the
// classic exam question. The composite primary key on
// room_availability(room_id, stay_date) is what makes this safe — not
// application-level locking, not a SELECT-then-INSERT check racing itself.
describe("20 concurrent bookings for the same room and dates", () => {
  it("lets exactly one booking win; the rest get 409", async () => {
    hotelId = await createHotel("Concurrency Test Hotel", "Bengaluru");
    const roomId = await createRoom(hotelId, "901");
    guest = await createUser({ email: uniqueEmail("concurrency-guest"), role: "GUEST" });
    const login = await request(app).post("/auth/login").send({ email: guest.email, password: guest.password });
    const token = login.body.accessToken;

    const checkIn = futureDate(100);
    const checkOut = futureDate(102);

    const attempts = Array.from({ length: 20 }, () =>
      request(app)
        .post("/bookings")
        .set("Authorization", `Bearer ${token}`)
        .send({ hotelId, roomId, checkIn, checkOut })
    );
    const results = await Promise.all(attempts);

    const succeeded = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(19);

    const roomAvailabilityCount = await pool.query(
      "SELECT COUNT(*) FROM room_availability WHERE room_id = $1",
      [roomId]
    );
    expect(Number(roomAvailabilityCount.rows[0].count)).toBe(2);
  }, 20000);
});
