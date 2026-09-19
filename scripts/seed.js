// Dev/demo seed script — never run against a production database. It wipes
// and repopulates the app_db tables it touches so `npm run seed` is safe to
// re-run at any point (e.g. right before a demo).
require("dotenv").config({ path: "api/.env" });
const { Pool } = require("pg");
const argon2 = require("argon2");

// Overridable so a hosted demo can rotate it (DEMO_PASSWORD); the login page
// shows whatever this is in demo mode, so it is a shared throwaway either way.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Password123!";

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

async function createHotel(client, { name, city, description, starRating, amenities }) {
  const result = await client.query(
    `INSERT INTO hotels (name, city, address, gstin, description, star_rating, amenities)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name`,
    [name, city, `${name}, ${city}`, "29AAAAA0000A1Z5", description, starRating, amenities]
  );
  return result.rows[0];
}

async function createRoom(client, hotelId, roomNumber, roomType, basePrice) {
  await client.query(
    "INSERT INTO rooms (hotel_id, room_number, room_type, base_price) VALUES ($1, $2, $3, $4)",
    [hotelId, roomNumber, roomType, basePrice]
  );
}

// Real chain-hotel names/photos are someone else's brand and would be
// misleading in a demo; these are original, fictional properties — same
// spirit as the "SYNTHETIC DOCUMENT" watermark on the fake ID cards
// (Section 0). Enough variety across price/city/amenities for the guest
// browse flow to feel like a real listings site, not a database dump.
const HOTELS = [
  {
    name: "Ramaiah Grand",
    city: "Bengaluru",
    description: "A business-district favourite close to MG Road, with a rooftop restaurant and full-day check-in desk.",
    starRating: 4,
    amenities: ["Free WiFi", "Breakfast Included", "24/7 Front Desk", "Restaurant", "Air Conditioning"],
    staffEmail: "staff.ramaiah@hotelverify.test",
    rooms: [
      ["101", "STANDARD", 2500],
      ["102", "STANDARD", 2500],
      ["201", "DELUXE", 4000],
    ],
  },
  {
    name: "MG Road Suites",
    city: "Bengaluru",
    description: "Serviced suites a short walk from the metro, popular with longer business stays.",
    starRating: 4,
    amenities: ["Free WiFi", "Free Parking", "Gym", "Room Service", "Air Conditioning"],
    staffEmail: "staff.mgroad@hotelverify.test",
    rooms: [
      ["101", "STANDARD", 2800],
      ["102", "DELUXE", 4200],
      ["103", "SUITE", 6500],
    ],
  },
  {
    name: "Marine Bay Residency",
    city: "Mumbai",
    description: "Sea-facing rooms in Colaba, minutes from the Gateway of India, with an airport shuttle on request.",
    starRating: 5,
    amenities: ["Free WiFi", "Swimming Pool", "Spa", "Airport Shuttle", "Restaurant", "24/7 Front Desk"],
    rooms: [
      ["201", "DELUXE", 6800],
      ["202", "DELUXE", 6800],
      ["301", "SUITE", 11500],
    ],
  },
  {
    name: "Qutub Heritage Inn",
    city: "Delhi",
    description: "A restored haveli-style property near the Qutub Minar, blending heritage architecture with modern rooms.",
    starRating: 4,
    amenities: ["Free WiFi", "Breakfast Included", "Restaurant", "Pet Friendly", "Air Conditioning"],
    rooms: [
      ["G1", "STANDARD", 3200],
      ["G2", "STANDARD", 3200],
      ["F1", "DELUXE", 5100],
    ],
  },
  {
    name: "Baga Beach Resort",
    city: "Goa",
    description: "Two minutes' walk from Baga Beach, with a pool bar and live music on weekends.",
    starRating: 4,
    amenities: ["Free WiFi", "Swimming Pool", "Free Parking", "Restaurant", "Room Service"],
    rooms: [
      ["101", "STANDARD", 3800],
      ["102", "STANDARD", 3800],
      ["201", "DELUXE", 5600],
      ["301", "SUITE", 9200],
    ],
  },
  {
    name: "Pink City Palace",
    city: "Jaipur",
    description: "A converted royal residence overlooking the old city walls, with courtyard dining and a rooftop pool.",
    starRating: 5,
    amenities: ["Free WiFi", "Swimming Pool", "Spa", "Breakfast Included", "Restaurant", "24/7 Front Desk"],
    rooms: [
      ["101", "DELUXE", 5400],
      ["102", "DELUXE", 5400],
      ["201", "SUITE", 9800],
    ],
  },
  {
    name: "Marina Shore Hotel",
    city: "Chennai",
    description: "A short drive from Marina Beach and the IT corridor, geared toward business travellers.",
    starRating: 3,
    amenities: ["Free WiFi", "Free Parking", "Gym", "Air Conditioning"],
    rooms: [
      ["101", "STANDARD", 2200],
      ["102", "STANDARD", 2200],
      ["201", "DELUXE", 3400],
    ],
  },
  {
    name: "Backwater Bliss Resort",
    city: "Kochi",
    description: "Houseboat-style rooms on the backwaters, with an in-house Ayurvedic spa and sunset cruises.",
    starRating: 5,
    amenities: ["Free WiFi", "Spa", "Breakfast Included", "Restaurant", "Airport Shuttle"],
    rooms: [
      ["W1", "DELUXE", 6200],
      ["W2", "DELUXE", 6200],
      ["W3", "SUITE", 10400],
    ],
  },
];

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("refusing to run scripts/seed.js with NODE_ENV=production — this truncates tables");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await resetTables(client);

    const users = [];
    users.push(await createUser(client, { email: "admin@hotelverify.test", role: "PLATFORM_ADMIN" }));

    let roomCount = 0;
    for (const spec of HOTELS) {
      const hotel = await createHotel(client, spec);
      for (const [roomNumber, roomType, basePrice] of spec.rooms) {
        await createRoom(client, hotel.id, roomNumber, roomType, basePrice);
        roomCount += 1;
      }
      if (spec.staffEmail) {
        users.push(await createUser(client, { email: spec.staffEmail, role: "HOTEL_STAFF", hotelId: hotel.id }));
      }
    }

    users.push(await createUser(client, { email: "guest1@hotelverify.test", role: "GUEST" }));
    users.push(await createUser(client, { email: "guest2@hotelverify.test", role: "GUEST" }));
    users.push(await createUser(client, { email: "guest3@hotelverify.test", role: "GUEST" }));

    await client.query("COMMIT");

    console.log(`Seeded ${HOTELS.length} hotels, ${roomCount} rooms, and ${users.length} users:`);
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
