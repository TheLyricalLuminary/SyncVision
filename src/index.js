// Root health / status server — port 3000
// This process is NOT the API server.
// All /api/* traffic is handled by apps/backend (port 3001).
//
// JSON contract: every response from this process is application/json.
// Plain-text responses are forbidden so that proxy misconfiguration
// produces a clear JSON error rather than an unparseable string.

const http = require("http");

const ROUTES = {
  "/health": { status: "ok", service: "sync-vision" },
  "/":       { status: "ok", service: "sync-vision", note: "API is served from port 3001 — update your proxy target if you see this" },
};

const server = http.createServer((req, res) => {
  const body = ROUTES[req.url] ?? {
    error:   "not_found",
    service: "sync-vision",
    path:    req.url,
    note:    "API routes are served from port 3001, not port 3000",
  };

  const status = body.error ? 404 : 200;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
});

server.listen(3000, () => {
  console.log("Status server running on port 3000 (API backend is on port 3001)");
});
