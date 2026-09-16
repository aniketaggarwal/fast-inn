const { pool, withGuestTransaction, withTenantTransaction } = require("../src/db");
const { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser } = require("./helpers");

// Every other test that touches bookings does so through routes whose own
// WHERE clause already scopes by guest_user_id or hotel_id — so passing
// proves the route is correct, but doesn't prove RLS itself is doing
// anything (the app-level filter alone would be enough). This test skips
// the app layer and runs a query with no ownership filter at all, to show
// the database — not just the route — refuses to return another guest's
// row.
describe("RLS on bookings is enforced by the database, not just by route WHERE clauses", () => {
  let hotelId, roomId, guestA, guestB, bookingId;

  beforeAll(async () => {
    hotelId = await createHotel("RLS Test Hotel", "Bengaluru");
    roomId = await createRoom(hotelId, "501");
    guestA = await createUser({ email: uniqueEmail("rls-guest-a"), role: "GUEST" });
    guestB = await createUser({ email: uniqueEmail("rls-guest-b"), role: "GUEST" });

    bookingId = await withGuestTransaction(guestA.id, async (client) => {
      const checkIn = new Date();
      checkIn.setUTCDate(checkIn.getUTCDate() + 200);
      const checkOut = new Date(checkIn);
      checkOut.setUTCDate(checkOut.getUTCDate() + 1);
      const result = await client.query(
        `INSERT INTO bookings (hotel_id, room_id, guest_user_id, check_in, check_out, total_amount)
         VALUES ($1, $2, $3, $4, $5, 1000)
         RETURNING id`,
        [hotelId, roomId, guestA.id, checkIn.toISOString().slice(0, 10), checkOut.toISOString().slice(0, 10)]
      );
      return result.rows[0].id;
    });
  });

  afterAll(async () => {
    await deleteHotel(hotelId);
    await deleteUser(guestA.id);
    await deleteUser(guestB.id);
    await pool.end();
  });

  it("a query with NO ownership filter still returns nothing for the wrong guest", async () => {
    const rows = await withGuestTransaction(guestB.id, async (client) => {
      const result = await client.query("SELECT id FROM bookings WHERE room_id = $1", [roomId]);
      return result.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("the same unfiltered query returns the row for its actual owner", async () => {
    const rows = await withGuestTransaction(guestA.id, async (client) => {
      const result = await client.query("SELECT id FROM bookings WHERE room_id = $1", [roomId]);
      return result.rows;
    });
    expect(rows.map((r) => r.id)).toContain(bookingId);
  });

  it("staff of a different hotel get nothing either, with the same unfiltered query", async () => {
    const otherHotelId = await createHotel("RLS Test Hotel B", "Bengaluru");
    const rows = await withTenantTransaction(otherHotelId, async (client) => {
      const result = await client.query("SELECT id FROM bookings WHERE room_id = $1", [roomId]);
      return result.rows;
    });
    expect(rows).toHaveLength(0);
    await deleteHotel(otherHotelId);
  });

  it("a plain query with no app.guest_id / app.hotel_id set at all sees nothing", async () => {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT id FROM bookings WHERE room_id = $1", [roomId]);
      expect(result.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
