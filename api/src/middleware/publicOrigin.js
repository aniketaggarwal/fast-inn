// The origin a caller actually reached this service on (scheme + host), as
// forwarded by scripts/demo-gateway.js. Used to build the check-in QR's URL
// when WEB_BASE_URL=auto — behind a tunnel the public hostname is random
// and only known per request. A fixed WEB_BASE_URL (dev, tests) is unchanged.
function publicOrigin(req, res, next) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "http";
  req.publicOrigin = host ? `${proto}://${host}` : null;
  next();
}

module.exports = { publicOrigin };
