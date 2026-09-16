// Express 4 doesn't forward rejected promises from async handlers to the
// error middleware on its own — wrap each one so a thrown/rejected error
// reaches app.js's centralized error handler instead of becoming an
// unhandled rejection.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
