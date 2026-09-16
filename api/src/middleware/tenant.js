// Section 7: hotel_id comes from the authenticated JWT, never from the
// request body or query string. This middleware is the single place that
// decides req.hotelId; route handlers must use it instead of reading
// req.body.hotelId / req.query.hotelId, which are ignored even if present.
function tenantScope(req, res, next) {
  if (!req.user || !req.user.hotelId) {
    return res.status(403).json({ error: "no_hotel_scope" });
  }
  req.hotelId = req.user.hotelId;
  next();
}

module.exports = { tenantScope };
