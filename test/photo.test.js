// 写真の保存・削除・配信のAPI確認
const assert = require("assert");
process.env.APP_PASSWORD = "pw-for-test";
delete process.env.ANTHROPIC_API_KEY;
globalThis.__REDIS_MOCK__ = require("../dev/redis-mock")();
function call(handler, { method = "POST", headers = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const out = { status: 200, headers: {} };
    const res = { statusCode: 200, setHeader: (k, v) => (out.headers[k.toLowerCase()] = v), status: (n) => ((out.status = n), res),
      json: (o) => ((out.json = o), resolve(out)), send: (s) => resolve(out), end: (b) => { out.status = res.statusCode !== 200 ? res.statusCode : out.status; out.body = b; resolve(out); } };
    Promise.resolve(handler({ method, headers, body, query }, res)).catch(reject);
  });
}
const photo = require("../api/photo.js"), file = require("../api/file.js"), report = require("../api/report.js"), auth = require("../api/auth.js");
(async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]).toString("base64");
  assert.strictEqual((await call(photo, { body: { op: "put", jobId: "j1", b64: jpeg } })).status, 401);
  const C = { cookie: (await call(auth, { body: { op: "login", password: "pw-for-test" } })).headers["set-cookie"].split(";")[0] };
  assert.strictEqual((await call(photo, { headers: C, body: { op: "put", jobId: "j1", b64: Buffer.from("not a jpeg at all").toString("base64") } })).status, 400);
  assert.strictEqual((await call(photo, { headers: C, body: { op: "put", jobId: "j1", b64: "A".repeat(950000) } })).status, 413);
  const r = await call(photo, { headers: C, body: { op: "put", jobId: "j1", name: "a.jpg", b64: "data:image/jpeg;base64," + jpeg } });
  assert.ok(r.json.ok && r.json.url.startsWith("/api/file?id="));
  const f = await call(file, { method: "GET", headers: C, query: { id: r.json.id } });
  assert.strictEqual(f.headers["content-type"], "image/jpeg"); assert.strictEqual(Buffer.from(f.body).length, 104);
  assert.strictEqual((await call(report, { headers: C, body: { photos: [{ id: r.json.id }] } })).status, 503); // AIキー無し
  assert.ok((await call(photo, { headers: C, body: { op: "del", id: r.json.id } })).json.ok);
  assert.strictEqual((await call(file, { method: "GET", headers: C, query: { id: r.json.id } })).status, 404);
  console.log("photo api tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
