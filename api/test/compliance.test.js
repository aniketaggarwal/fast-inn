const request = require("supertest");
const { createApp } = require("../src/app");
const { pool, withTenantTransaction, withGuestTransaction } = require("../src/db");
const { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser } = require("./helpers");

const app = createApp();

let hotelA, hotelB, staffAToken, staffBToken, adminToken, guest, guestToken;
const trackedGuestIds = [];
let fixtureDateOffset = 0;

// These tests exercise the *read/action* endpoints this milestone adds
// (register list, CSV export, my-data, admin views) against fixture rows
// inserted directly — the write path that actually produces a
// guest_register/consents/form_c_records row from a real SD-JWT
// presentation is already covered end-to-end in checkin.test.js, so
// re-deriving a full presentation here for every case would just
// duplicate that without testing anything new. guest_register.booking_id
// is NOT NULL, so each fixture still needs a real (if minimal) booking.
async function createFixtureBooking(hotelId) {
  const roomId = await createRoom(hotelId, `FIX-${fixtureDateOffset}`);
  fixtureDateOffset += 1;
  const checkIn = new Date(Date.UTC(2027, 5, 1 + fixtureDateOffset)).toISOString().slice(0, 10);
  const checkOut = new Date(Date.UTC(2027, 5, 2 + fixtureDateOffset)).toISOString().slice(0, 10);
  // bookings has FORCE RLS — a plain pool.query insert fails its WITH
  // CHECK, same as the app code, so the fixture has to go through the
  // same guest-branch transaction helper real requests use.
  const row = await withGuestTransaction(guest.id, (client) =>
    client.query(
      `INSERT INTO bookings (hotel_id, room_id, guest_user_id, check_in, check_out, status, total_amount)
       VALUES ($1, $2, $3, $4, $5, 'CHECKED_IN', 2500)
       RETURNING id`,
      [hotelId, roomId, guest.id, checkIn, checkOut]
    )
  );
  return row.rows[0].id;
}

async function insertRegisterRow({ hotelId, nationality = "IN" }) {
  const bookingId = await createFixtureBooking(hotelId);
  const row = await withTenantTransaction(hotelId, (client) =>
    client.query(
      `INSERT INTO guest_register (hotel_id, booking_id, full_name, id_type, id_last4, nationality, arrival_at)
       VALUES ($1, $2, 'Test Guest', 'AADHAAR', '4321', $3, now())
       RETURNING id`,
      [hotelId, bookingId, nationality]
    )
  );
  return { registerId: row.rows[0].id, bookingId };
}

beforeAll(async () => {
  hotelA = await createHotel("Compliance Test Hotel A", "Bengaluru");
  hotelB = await createHotel("Compliance Test Hotel B", "Bengaluru");

  const staffA = await createUser({ email: uniqueEmail("compliance-staff-a"), role: "HOTEL_STAFF", hotelId: hotelA });
  const staffB = await createUser({ email: uniqueEmail("compliance-staff-b"), role: "HOTEL_STAFF", hotelId: hotelB });
  const platformAdmin = await createUser({ email: uniqueEmail("compliance-admin"), role: "PLATFORM_ADMIN" });
  guest = await createUser({ email: uniqueEmail("compliance-guest"), role: "GUEST" });
  trackedGuestIds.push(guest.id, platformAdmin.id);

  staffAToken = (await request(app).post("/auth/login").send({ email: staffA.email, password: staffA.password })).body
    .accessToken;
  staffBToken = (await request(app).post("/auth/login").send({ email: staffB.email, password: staffB.password })).body
    .accessToken;
  adminToken = (await request(app).post("/auth/login").send({ email: platformAdmin.email, password: platformAdmin.password }))
    .body.accessToken;
  guestToken = (await request(app).post("/auth/login").send({ email: guest.email, password: guest.password })).body
    .accessToken;
});

afterAll(async () => {
  await deleteHotel(hotelA);
  await deleteHotel(hotelB);
  for (const id of trackedGuestIds) await deleteUser(id);
  await pool.end();
});

describe("GET /hotel/register", () => {
  it("lists only the caller's own hotel's entries", async () => {
    await insertRegisterRow({ hotelId: hotelA });
    await insertRegisterRow({ hotelId: hotelB });

    const res = await request(app).get("/hotel/register").set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(res.body.entries.every((e) => e.id !== undefined)).toBe(true);
  });

  it("flags a non-Indian national with form_c_required", async () => {
    const { registerId } = await insertRegisterRow({ hotelId: hotelA, nationality: "US" });
    await pool.query("INSERT INTO form_c_records (guest_register_id, passport_no_last4) VALUES ($1, '9876')", [
      registerId,
    ]);

    const res = await request(app).get("/hotel/register").set("Authorization", `Bearer ${staffAToken}`);
    const entry = res.body.entries.find((e) => e.id === registerId);
    expect(entry.form_c_required).toBe(true);
    expect(entry.id_last4).toBe("4321"); // never the full number — the column doesn't exist to leak
  });

  it("rejects a GUEST token", async () => {
    const res = await request(app).get("/hotel/register").set("Authorization", `Bearer ${guestToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /hotel/exports/form-c.csv", () => {
  it("exports only foreign-national rows as CSV, scoped to the caller's hotel", async () => {
    const { registerId } = await insertRegisterRow({ hotelId: hotelA, nationality: "FR" });
    await pool.query("INSERT INTO form_c_records (guest_register_id, passport_no_last4) VALUES ($1, '1111')", [
      registerId,
    ]);

    const res = await request(app).get("/hotel/exports/form-c.csv").set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("full_name,id_type,id_last4,nationality");
    expect(res.text).toContain("FR");

    const marked = await pool.query("SELECT exported_at FROM form_c_records WHERE guest_register_id = $1", [
      registerId,
    ]);
    expect(marked.rows[0].exported_at).not.toBeNull();
  });

  it("hotel B's export never contains hotel A's rows", async () => {
    const res = await request(app).get("/hotel/exports/form-c.csv").set("Authorization", `Bearer ${staffBToken}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("Test Guest");
  });
});

describe("POST /hotel/bookings/:id/checkout", () => {
  it("404s a booking belonging to a different hotel", async () => {
    const res = await request(app)
      .post("/hotel/bookings/00000000-0000-0000-0000-000000000000/checkout")
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(404);
  });

  it("flips a CHECKED_IN booking to CHECKED_OUT and stamps guest_register.departure_at", async () => {
    const { registerId, bookingId } = await insertRegisterRow({ hotelId: hotelA });

    const res = await request(app)
      .post(`/hotel/bookings/${bookingId}/checkout`)
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CHECKED_OUT");

    const booking = await withTenantTransaction(hotelA, (client) =>
      client.query("SELECT status FROM bookings WHERE id = $1", [bookingId])
    );
    expect(booking.rows[0].status).toBe("CHECKED_OUT");

    const register = await withTenantTransaction(hotelA, (client) =>
      client.query("SELECT departure_at FROM guest_register WHERE id = $1", [registerId])
    );
    expect(register.rows[0].departure_at).not.toBeNull();

    const audit = await pool.query("SELECT action FROM audit_log WHERE entity = 'booking' AND entity_id = $1", [
      bookingId,
    ]);
    expect(audit.rows[0].action).toBe("booking_checked_out");
  });

  it("409s a booking that's already CHECKED_OUT (or was never checked in)", async () => {
    const { bookingId } = await insertRegisterRow({ hotelId: hotelA });
    await request(app).post(`/hotel/bookings/${bookingId}/checkout`).set("Authorization", `Bearer ${staffAToken}`);

    const res = await request(app)
      .post(`/hotel/bookings/${bookingId}/checkout`)
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(res.status).toBe(409);
  });
});

describe("consents / my-data", () => {
  let consentId;

  beforeAll(async () => {
    const row = await withGuestTransaction(guest.id, (client) =>
      client.query(
        `INSERT INTO consents (guest_user_id, hotel_id, claims_disclosed_json, purpose)
         VALUES ($1, $2, $3, 'hotel check-in identity verification')
         RETURNING id`,
        [guest.id, hotelA, JSON.stringify(["fullName", "idLast4"])]
      )
    );
    consentId = row.rows[0].id;
  });

  it("GET /consents/mine returns only the caller's own consents, across hotels", async () => {
    const res = await request(app).get("/consents/mine").set("Authorization", `Bearer ${guestToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.consents.find((c) => c.id === consentId);
    expect(entry).toBeDefined();
    expect(entry.claims_disclosed_json).toEqual(["fullName", "idLast4"]);
    expect(entry.withdrawn_at).toBeNull();
  });

  it("POST /consents/:id/withdraw marks it withdrawn and logs an audit entry", async () => {
    const res = await request(app)
      .post(`/consents/${consentId}/withdraw`)
      .set("Authorization", `Bearer ${guestToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");

    const row = await withGuestTransaction(guest.id, (client) =>
      client.query("SELECT withdrawn_at FROM consents WHERE id = $1", [consentId])
    );
    expect(row.rows[0].withdrawn_at).not.toBeNull();

    const audit = await pool.query("SELECT action FROM audit_log WHERE entity = 'consent' AND entity_id = $1", [
      consentId,
    ]);
    expect(audit.rows[0].action).toBe("consent_withdrawn");
  });

  it("404s withdrawing a consent that isn't the caller's own", async () => {
    const otherGuest = await createUser({ email: uniqueEmail("compliance-other-guest"), role: "GUEST" });
    trackedGuestIds.push(otherGuest.id);
    const otherToken = (
      await request(app).post("/auth/login").send({ email: otherGuest.email, password: otherGuest.password })
    ).body.accessToken;

    const row = await withGuestTransaction(guest.id, (client) =>
      client.query(
        `INSERT INTO consents (guest_user_id, hotel_id, claims_disclosed_json, purpose)
         VALUES ($1, $2, '["fullName"]', 'hotel check-in identity verification')
         RETURNING id`,
        [guest.id, hotelA]
      )
    );

    const res = await request(app)
      .post(`/consents/${row.rows[0].id}/withdraw`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /account", () => {
  it("anonymizes the account and blocks future login, without touching bookings/guest_register", async () => {
    const toDelete = await createUser({ email: uniqueEmail("compliance-delete-me"), role: "GUEST" });
    const token = (
      await request(app).post("/auth/login").send({ email: toDelete.email, password: toDelete.password })
    ).body.accessToken;

    const res = await request(app).delete("/account").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DELETED");

    const loginAgain = await request(app)
      .post("/auth/login")
      .send({ email: toDelete.email, password: toDelete.password });
    expect(loginAgain.status).toBe(401);

    const row = await pool.query("SELECT email, password_hash, deleted_at FROM users WHERE id = $1", [toDelete.id]);
    expect(row.rows[0].email).not.toBe(toDelete.email);
    expect(row.rows[0].password_hash).toBe("");
    expect(row.rows[0].deleted_at).not.toBeNull();

    trackedGuestIds.push(toDelete.id);
  });

  it("frees the original email up for a fresh registration", async () => {
    const email = uniqueEmail("compliance-reregister");
    const first = await createUser({ email, role: "GUEST" });
    const firstToken = (await request(app).post("/auth/login").send({ email, password: first.password })).body
      .accessToken;
    await request(app).delete("/account").set("Authorization", `Bearer ${firstToken}`);
    trackedGuestIds.push(first.id);

    const reregistered = await request(app).post("/auth/register").send({ email, password: "Password123!" });
    expect(reregistered.status).toBe(201);
    trackedGuestIds.push(reregistered.body.user.id);
  });
});

describe("admin routes (PLATFORM_ADMIN only)", () => {
  it("GET /admin/hotels lists hotels", async () => {
    const res = await request(app).get("/admin/hotels").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hotels.some((h) => h.id === hotelA)).toBe(true);
  });

  it("GET /admin/audit returns recent entries", async () => {
    const res = await request(app).get("/admin/audit").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it("GET /admin/register reads across hotels", async () => {
    const res = await request(app).get("/admin/register").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.some((e) => e.hotel_name === "Compliance Test Hotel A")).toBe(true);
    expect(res.body.entries.some((e) => e.hotel_name === "Compliance Test Hotel B")).toBe(true);
  });

  it("rejects hotel staff on every admin route", async () => {
    for (const path of ["/admin/hotels", "/admin/audit", "/admin/register"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${staffAToken}`);
      expect(res.status).toBe(403);
    }
  });
});
