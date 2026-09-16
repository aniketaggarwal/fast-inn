// Dev/demo seed script — never run against a production database. It wipes
// and repopulates the app_db tables it touches so `npm run seed` is safe to
// re-run at any point (e.g. right before a demo).
require("dotenv").config({ path: "api/.env" });
const { Pool } = require("pg");
const argon2 = require("argon2");

const DEMO_PASSWORD = "Password123!";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://hotelverify:hotelverify@localhost:5432/hotelverify_app",
});

async function resetTables(client) {
  // FK-safe order. Nothing downstream of hotels/users exists yet in
  // Milestone 1, but this stays correct as later milestones add tables.
  await client.query("TRUNCATE TABLE consents, form_c_records, guest_register, checkin_sessions, room_availability, bookings, rooms, users, hotels RESTART IDENTITY CASCADE");
}

async function createUser(client, { email, role, hotelId = null }) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const result = await client.query(
    "INSERT INTO users (email, password_hash, role, hotel_id) VALUES ($1, $2, $3, $4) RETURNING id, email, role",
    [email, passwordHash, role, hotelId]
  );
  return result.rows[0];
}

async function createHotel(client, name, city) {
  const result = await client.query(
    "INSERT INTO hotels (name, city, address, gstin) VALUES ($1, $2, $3, $4) RETURNING id, name",
    [name, city, `${name}, ${city}`, "29AAAAA0000A1Z5"]
  );
  return result.rows[0];
}

async function createRoom(client, hotelId, roomNumber, roomType, basePrice) {
  await client.query(
    "INSERT INTO rooms (hotel_id, room_number, room_type, base_price) VALUES ($1, $2, $3, $4)",
    [hotelId, roomNumber, roomType, basePrice]
  );
}

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("refusing to run scripts/seed.js with NODE_ENV=production — this truncates tables");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await resetTables(client);

    const hotelA = await createHotel(client, "Ramaiah Grand", "Bengaluru");
    const hotelB = await createHotel(client, "MG Road Suites", "Bengaluru");

    await createRoom(client, hotelA.id, "101", "STANDARD", 2500);
    await createRoom(client, hotelA.id, "102", "STANDARD", 2500);
    await createRoom(client, hotelA.id, "201", "DELUXE", 4000);
    await createRoom(client, hotelB.id, "101", "STANDARD", 2800);
    await createRoom(client, hotelB.id, "102", "DELUXE", 4200);
    await createRoom(client, hotelB.id, "103", "SUITE", 6500);

    const users = [];
    users.push(await createUser(client, { email: "admin@hotelverify.test", role: "PLATFORM_ADMIN" }));
    users.push(await createUser(client, { email: "staff.ramaiah@hotelverify.test", role: "HOTEL_STAFF", hotelId: hotelA.id }));
    users.push(await createUser(client, { email: "staff.mgroad@hotelverify.test", role: "HOTEL_STAFF", hotelId: hotelB.id }));
    users.push(await createUser(client, { email: "guest1@hotelverify.test", role: "GUEST" }));
    users.push(await createUser(client, { email: "guest2@hotelverify.test", role: "GUEST" }));
    users.push(await createUser(client, { email: "guest3@hotelverify.test", role: "GUEST" }));

    await client.query("COMMIT");

    console.log("Seeded 2 hotels, 6 rooms, and 6 users:");
    for (const user of users) {
      console.log(`  ${user.role.padEnd(14)} ${user.email}`);
    }
    console.log(`\nAll seeded accounts use the password: ${DEMO_PASSWORD}`);
    console.log("(Demo credentials only — this script refuses to run with NODE_ENV=production.)");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
