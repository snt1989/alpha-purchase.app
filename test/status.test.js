// サーバー情報API: ログイン必須・秘密の値を返さない
const assert = require("assert");
process.env.APP_PASSWORD = "pw-for-test"; process.env.INBOUND_TOKEN = "inbound-token-0123456789"; process.env.SESSION_SECRET = "secret-value-xyz-123";
globalThis.__REDIS_MOCK__ = require("../dev/redis-mock")();
function call(h, { method = "POST", headers = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => { const out = { status: 200, headers: {} };
    const res = { statusCode: 200, setHeader: (k, v) => (out.headers[k.toLowerCase()] = v), status: (n) => ((out.status = n), res), json: (o) => ((out.json = o), resolve(out)), end: () => resolve(out) };
    Promise.resolve(h({ method, headers, body, query: {} }, res)).catch(reject); });
}
const status = require("../api/status.js"), auth = require("../api/auth.js"), inbound = require("../api/inbound.js");
(async () => {
  assert.strictEqual((await call(status)).status, 401);
  const C = { cookie: (await call(auth, { body: { op: "login", password: "pw-for-test" } })).headers["set-cookie"].split(";")[0], host: "example.test" };
  const r = (await call(status, { headers: C })).json;
  assert.ok(r.db.ok && r.db.orders === 0 && r.config.password && r.config.inboundToken && r.config.sessionSecret && !r.config.ai);
  assert.ok(r.storage && r.storage.appBytes === 0 && r.storage.usedBytes === 123456 && r.storage.limitBytes === 268435456);
  assert.strictEqual(r.inbound.endpoint, "https://example.test/api/inbound");
  assert.strictEqual(r.heartbeat, null);
  // Apps Script の生存確認(メール0件でも・エラーでも届く)
  assert.strictEqual((await call(inbound, { body: { heartbeat: true, ok: true } })).status, 401);
  const H = { authorization: "Bearer inbound-token-0123456789" };
  assert.ok((await call(inbound, { headers: H, body: { heartbeat: true, ok: false, error: "Service invoked too many times for one day: premium gmail.", scanned: 0, sent: 0, pending: 0 } })).json.ok);
  const l = (await call(status, { headers: C, body: { light: true } })).json;
  assert.strictEqual(l.heartbeat.ok, false); assert.ok(/too many times/.test(l.heartbeat.error)); assert.ok(Date.now() - new Date(l.heartbeat.at) < 5000); assert.strictEqual(l.db, undefined);
  const txt = JSON.stringify(r);
  ["pw-for-test", "inbound-token-0123456789", "secret-value-xyz-123"].forEach((s) => assert.ok(!txt.includes(s), "秘密の値が含まれています"));
  console.log("status api tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
