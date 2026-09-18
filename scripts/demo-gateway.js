// Single-origin front door for the demo: serves the built web app and
// reverse-proxies the three backends behind one host/port, so ONE tunnel
// (or one LAN address) is enough to reach everything — and the browser
// never makes a cross-origin request, so there's no CORS to configure.
//
//   /api/*        -> api      (prefix stripped)
//   /issuer/*     -> issuer   (prefix stripped)
//   /<bucket>/*   -> MinIO    (untouched — see below)
//   everything else -> web/dist, with SPA fallback to index.html
//
// MinIO is the subtle one. The guest's browser PUTs KYC images straight to
// a presigned URL (Section 9.6), and a SigV4 signature covers the request
// path *and* the Host header. So the path is forwarded exactly as signed
// (path-style `/<bucket>/<key>`, hence routing by bucket name instead of a
// prefix we'd have to strip) and Host is left as the browser sent it —
// which is the public host the issuer signed against, because
// S3_PUBLIC_ENDPOINT=auto makes it sign for whatever origin called it.
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function clientIp(req) {
  const fromTunnel = req.headers["cf-connecting-ip"];
  if (fromTunnel) return fromTunnel;
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket.remoteAddress;
}

function proxy(req, res, { host, port, stripPrefix, keepHost }) {
  const headers = { ...req.headers };
  const publicHost = req.headers.host;
  headers["x-forwarded-host"] = publicHost;
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "http";
  // Overwritten, not appended: the backends trust exactly one hop (this
  // gateway), so this must be the real client, not a chain.
  headers["x-forwarded-for"] = clientIp(req);
  if (!keepHost) headers.host = `${host}:${port}`;

  const upstream = http.request(
    { host, port, method: req.method, path: stripPrefix ? req.url.slice(stripPrefix.length) || "/" : req.url, headers },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "upstream_unavailable", detail: err.code }));
  });
  req.pipe(upstream);
}

function serveStatic(webDir, req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(webDir, path.normalize(urlPath));
  if (!file.startsWith(webDir)) {
    res.writeHead(403).end();
    return;
  }
  const isAsset = fs.existsSync(file) && fs.statSync(file).isFile();
  if (!isAsset) file = path.join(webDir, "index.html"); // client-side routes
  const ext = path.extname(file);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  fs.createReadStream(file).pipe(res);
}

function startGateway({ port, apiPort, issuerPort, minioPort, bucket, webDir, host = "0.0.0.0" }) {
  const server = http.createServer((req, res) => {
    if (req.url === "/api" || req.url.startsWith("/api/")) {
      return proxy(req, res, { host: "127.0.0.1", port: apiPort, stripPrefix: "/api" });
    }
    if (req.url === "/issuer" || req.url.startsWith("/issuer/")) {
      return proxy(req, res, { host: "127.0.0.1", port: issuerPort, stripPrefix: "/issuer" });
    }
    if (req.url.startsWith(`/${bucket}/`)) {
      return proxy(req, res, { host: "127.0.0.1", port: minioPort, keepHost: true });
    }
    return serveStatic(webDir, req, res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

module.exports = { startGateway };
