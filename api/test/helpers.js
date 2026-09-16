const crypto = require("crypto");
const { pool } = require("../src/db");
const { hashPassword } = require("../src/utils/password");

function uniqueEmail(prefix) {
  return `${prefix}-${crypto.randomUUID()}@hotelverify.test`;
}

async function createHotel(name, city) {
  const result = await pool.query(
    "INSERT INTO hotels (name, city) VALUES ($1, $2) RETURNING id",
    [name, city]
  );
  return result.rows[0].id;
}

async function createRoom(hotelId, roomNumber) {
  const result = await pool.query(
    "INSERT INTO rooms (hotel_id, room_number, room_type, base_price) VALUES ($1, $2, 'STANDARD', 2500) RETURNING id",
    [hotelId, roomNumber]
  );
  return result.rows[0].id;
}

async function createUser({ email, password = "Password123!", role, hotelId = null }) {
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    "INSERT INTO users (email, password_hash, role, hotel_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [email, passwordHash, role, hotelId]
  );
  return { id: result.rows[0].id, email, password, role, hotelId };
}

async function deleteHotel(hotelId) {
  // ON DELETE CASCADE on rooms.hotel_id and users.hotel_id cleans up
  // anything created for the test under this hotel.
  await pool.query("DELETE FROM hotels WHERE id = $1", [hotelId]);
}

async function deleteUser(userId) {
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
}

module.exports = { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser };
