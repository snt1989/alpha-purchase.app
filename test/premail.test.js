// メール本文だけで先に登録された案件(kMailerのリンク付き)に、あとから作業依頼書PDFを読み込んで内容を反映する
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.APP_PASSWORD = "pw-for-test"; process.env.INBOUND_TOKEN = "inbound-token-0123456789"; process.env.ALLOWED_SENDERS = "*"; process.env.SESSION_SECRET = "secret-value-xyz-123";
globalThis.__REDIS_MOCK__ = require("../dev/redis-mock")();
const zipPath = path.join(__dirname, "fixtures/locked.zip");
if (!fs.existsSync(zipPath)) { console.log("workpdf: skip"); process.exit(0); }
function call(handler, { method = "POST", headers = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, headers, body, query }, out = { status: 200, headers: {} };
    const res = { statusCode: 200, setHeader: (k, v) => (out.headers[k.toLowerCase()] = v), status: (n) => ((out.status = n), res), json: (o) => ((out.json = o), resolve(out)), send: (s) => ((out.text = s), resolve(out)), end: (b) => { out.body = b; resolve(out); } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const inbound = require("../api/inbound.js"), auth = require("../api/auth.js"), db = require("../api/db.js"), workpdf = require("../api/workpdf.js");
(async () => {
  const H = { authorization: "Bearer inbound-token-0123456789" };
  const lg = await call(auth, { body: { op: "login", password: "pw-for-test" } });
  const C = { cookie: lg.headers["set-cookie"].split(";")[0] };
  // メール本文だけで登録済み(リンクなし・書類なし)の案件にも、PDFを読み込めば結びつく
  let r = await call(inbound, { headers: H, body: { messageId: "p1", from: "mente-report@alphapurchase.co.jp", subject: "【新規修繕依頼】ローソン横浜町道の駅前店", body: "新規修繕依頼\n品名: 修繕 数量: 1" } });
  assert.strictEqual(r.json.state, "registered", JSON.stringify(r.json));
  const list = async () => (await call(db, { headers: C, body: { op: "list", col: "orders" } })).json.docs.map((d) => d.data);
  const before = (await list())[0], id = before.id;
  // 「書類の確認」から追加 → 案件は増えず、内容も書き換えず、書類だけ付く
  r = await call(workpdf, { headers: C, body: { name: "order.pdf", b64: fs.readFileSync(path.join(__dirname, "fixtures/order.pdf")).toString("base64") } });
  assert.strictEqual(r.json.results[0].state, "docs_added", JSON.stringify(r.json));
  let all = await list(); assert.strictEqual(all.length, 1); assert.strictEqual(all[0].id, id);
  assert.strictEqual(all[0].subject, before.subject); assert.strictEqual(all[0].status, before.status);
  assert.ok(all[0].files.some((f) => f.kind === "order" && f.url));
  r = await call(workpdf, { headers: C, body: { name: "report.pdf", b64: fs.readFileSync(path.join(__dirname, "fixtures/report.pdf")).toString("base64") } });
  assert.strictEqual(r.json.results[0].state, "no_match", JSON.stringify(r.json)); // 別の案件の報告書は付けない
  all = await list(); assert.strictEqual(all.length, 1); assert.strictEqual(all[0].files.length, 1);
  // 紐づく案件がない場合は新規登録しない
  const db2 = await call(db, { headers: C, body: { op: "list", col: "orders" } });
  for (const d of db2.json.docs) await call(db, { headers: C, body: { op: "del", col: "orders", id: d.id } });
  r = await call(workpdf, { headers: C, body: { name: "order.pdf", b64: fs.readFileSync(path.join(__dirname, "fixtures/order.pdf")).toString("base64") } });
  assert.strictEqual(r.json.results[0].state, "no_match", JSON.stringify(r.json));
  assert.strictEqual((await list()).length, 0);
  console.log("premail link tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
