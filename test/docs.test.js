// 作業依頼書と作業完了報告書(2種類)を、案件番号で同じ案件にまとめる
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.APP_PASSWORD = "pw-for-test"; process.env.INBOUND_TOKEN = "inbound-token-0123456789"; process.env.ALLOWED_SENDERS = "*"; process.env.SESSION_SECRET = "secret-value-xyz-123";
globalThis.__REDIS_MOCK__ = require("../dev/redis-mock")();
const fx = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n)).toString("base64");
function call(handler, { method = "POST", headers = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, headers, body, query }, out = { status: 200, headers: {} };
    const res = { statusCode: 200, setHeader: (k, v) => (out.headers[k.toLowerCase()] = v), status: (n) => ((out.status = n), res), json: (o) => ((out.json = o), resolve(out)), send: (s) => ((out.text = s), resolve(out)), end: (b) => { out.body = b; resolve(out); } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const auth = require("../api/auth.js"), db = require("../api/db.js"), workpdf = require("../api/workpdf.js"), file = require("../api/file.js");
(async () => {
  const lg = await call(auth, { body: { op: "login", password: "pw-for-test" } });
  const C = { cookie: lg.headers["set-cookie"].split(";")[0] };
  const list = async () => (await call(db, { headers: C, body: { op: "list", col: "orders" } })).json.docs.map((d) => d.data);
  const up = (name, b64) => call(workpdf, { headers: C, body: { name, b64 } });
  if (process.argv[2] === "B") {
    // B) 作業完了報告書が先に届く → 仮登録 → 作業依頼書が届くと内容が確定(件数は増えない)
    let r = await up("report.pdf", fx("report.pdf")); assert.strictEqual(r.json.results[0].state, "provisional", JSON.stringify(r.json));
    let all = await list(); assert.strictEqual(all.length, 1); assert.ok(all[0].provisional && all[0].needsReview); const id = all[0].id, no = all[0].no;
    r = await up("order.pdf", fx("order.pdf")); assert.strictEqual(r.json.results[0].state, "merged", JSON.stringify(r.json));
    all = await list(); assert.strictEqual(all.length, 1); const o = all[0];
    assert.strictEqual(o.id, id); assert.strictEqual(o.no, no); assert.ok(!o.provisional); assert.strictEqual(o.subject, "バックルームの照明のスイッチの紐が切れた");
    assert.deepStrictEqual(o.files.map((f) => f.kind).sort(), ["order", "report"]);
    console.log("docs tests OK (B)"); return;
  }
  // A) 作業依頼書 → 作業完了報告書: 1件の案件に2枚
  let r = await up("order.pdf", fx("order.pdf")); assert.strictEqual(r.json.results[0].state, "registered", JSON.stringify(r.json));
  r = await up("report.pdf", fx("report.pdf")); assert.strictEqual(r.json.results[0].state, "attached", JSON.stringify(r.json));
  let all = await list(); assert.strictEqual(all.length, 1);
  assert.deepStrictEqual(all[0].files.map((f) => f.kind).sort(), ["order", "report"]);
  assert.ok(all[0].files.every((f) => /api\/file\?id=/.test(f.url)));
  const f1 = await call(file, { method: "GET", headers: C, query: { id: decodeURIComponent(all[0].files[1].url.split("id=")[1]) } });
  assert.strictEqual(Buffer.from(f1.body).slice(0, 4).toString(), "%PDF");
  console.log("docs tests OK (A)");
})().catch((e) => { console.error(e); process.exit(1); });
