const argon2 = require("argon2");

function hashPassword(plain) {
  return argon2.hash(plain);
}

function verifyPassword(hash, plain) {
  return argon2.verify(hash, plain);
}

module.exports = { hashPassword, verifyPassword };
