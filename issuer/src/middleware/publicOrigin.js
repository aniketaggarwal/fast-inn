// The origin a caller actually reached this service on (scheme + host),
// as forwarded by scripts/demo-gateway.js. Used only to sign presigned
// storage URLs against the right public address — see storage/s3.js.
// Direct hits (dev, tests) carry no x-forwarded-* headers and fall back to
// the plain Host header, which s3.js ignores unless S3_PUBLIC_ENDPOINT=auto.
function publicOrigin(req, res, next) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "http";
  req.publicOrigin = host ? `${proto}://${host}` : null;
  next();
}

module.exports = { publicOrigin };
