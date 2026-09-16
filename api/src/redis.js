const { createClient } = require("redis");

const client = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
client.on("error", (err) => console.error("Redis error:", err));

let connected = false;
async function ensureConnected() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return client;
}

module.exports = { client, ensureConnected };
