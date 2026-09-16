const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser } = require("./helpers");

const app = createApp();

let hotelA, hotelB, roomA, roomB, staffAToken, staffBToken;

beforeAll(async () => {
  hotelA = await createHotel("Ramaiah Grand", "Bengaluru");
  hotelB = await createHotel("MG Road Suites", "Bengaluru");
  roomA = await createRoom(hotelA, "101");
  roomB = await createRoom(hotelB, "201");

  const staffA = await createUser({ email: uniqueEmail("staff-a"), role: "HOTEL_STAFF", hotelId: hotelA });
  const staffB = await createUser({ email: uniqueEmail("staff-b"), role: "HOTEL_STAFF", hotelId: hotelB });

  const loginA = await request(app).post("/auth/login").send({ email: staffA.email, password: staffA.password });
  const loginB = await request(app).post("/auth/login").send({ email: staffB.email, password: staffB.password });
  staffAToken = loginA.body.accessToken;
  staffBToken = loginB.body.accessToken;
});

const extraGuestIds = [];

afterAll(async () => {
  await deleteHotel(hotelA);
  await deleteHotel(hotelB);
  for (const id of extraGuestIds) {
    await deleteUser(id);
  }
  await pool.end();
});

describe("tenant isolation on /hotel/rooms", () => {
  it("lets staff list only their own hotel's rooms", async () => {
    const res = await request(app).get("/hotel/rooms").set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(1);
    expect(res.body.rooms[0].id).toBe(roomA);
  });

  it("lets staff read a room that belongs to their own hotel", async () => {
    const res = await request(app).get(`/hotel/rooms/${roomA}`).set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.room.id).toBe(roomA);
  });

  it("returns 404, not 403, when staff of hotel A requests a room belonging to hotel B", async () => {
    const res = await request(app).get(`/hotel/rooms/${roomB}`).set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(404);
  });

  it("ignores a hotelId sent in the query string and still scopes to the JWT's hotel", async () => {
    const res = await request(app)
      .get(`/hotel/rooms?hotelId=${hotelB}`)
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(1);
    expect(res.body.rooms[0].id).toBe(roomA);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/hotel/rooms");
    expect(res.status).toBe(401);
  });

  it("rejects a GUEST-role token", async () => {
    const guestEmail = uniqueEmail("guest-for-tenant-test");
    const registered = await request(app)
      .post("/auth/register")
      .send({ email: guestEmail, password: "Password123!" });
    extraGuestIds.push(registered.body.user.id);

    const res = await request(app)
      .get("/hotel/rooms")
      .set("Authorization", `Bearer ${registered.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("staff B can read their own room while staff A cannot", async () => {
    const res = await request(app).get(`/hotel/rooms/${roomB}`).set("Authorization", `Bearer ${staffBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.room.id).toBe(roomB);
  });
});
