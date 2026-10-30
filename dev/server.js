// ローカル確認用サーバー: node dev/server.js  →  http://localhost:3000
// Redis の代わりにメモリ(再起動で消える)。APP_PASSWORD の既定は "test1234"
const http = require("http"), fs = require("fs"), path = require("path");
process.env.APP_PASSWORD = process.env.APP_PASSWORD || "test1234";
process.env.INBOUND_TOKEN = process.env.INBOUND_TOKEN || "local-inbound-token-1234";
process.env.ALLOWED_SENDERS = process.env.ALLOWED_SENDERS || "*";
if (!process.env.KV_REST_API_URL) globalThis.__REDIS_MOCK__ = require("./redis-mock")();
const root = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const name = u.pathname.slice(5).replace(/[^a-z_]/gi, "");
    let raw = ""; for await (const c of req) raw += c;
    req.query = Object.fromEntries(u.searchParams); req.body = raw ? raw : undefined;
    res.status = (n) => { res.statusCode = n; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    res.send = (s) => res.end(s);
    try { await require("../api/" + name + ".js")(req, res); }
    catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end(String(e.message || e)); } }
    return;
  }
  let p = path.join(root, u.pathname === "/" ? "index.html" : u.pathname);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
  fs.createReadStream(p).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
