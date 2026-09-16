const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateStr(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

// One entry per night of the stay: check-in inclusive, check-out exclusive,
// matching one row per night in room_availability (Section 9.5).
function nightsBetween(checkIn, checkOut) {
  const nights = [];
  const current = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (current < end) {
    nights.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return nights;
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { isValidDateStr, nightsBetween, todayUTC };
