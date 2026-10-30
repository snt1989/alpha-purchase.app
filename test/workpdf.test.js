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
  // 1) リンク付きのメール(本文だけ)→ 案件ができ、PDF待ちの印とリンクが付く
  let r = await call(inbound, { headers: H, body: { messageId: "k1", from: "mente-report@alphapurchase.co.jp", subject: "【新規修繕依頼】スーパーホテル盛岡 104143", body: "新規修繕依頼\n品名: 修繕\n数量: 1\n「作業依頼書.pdf」をダウンロード\nhttps://mailer.kintoneapp.com/attachment/aaa/1/address/1/x/confirm\n" } });
  assert.strictEqual(r.json.state, "registered");
  const list = async () => (await call(db, { headers: C, body: { op: "list", col: "orders" } })).json.docs.map((d) => d.data);
  let o = (await list())[0]; assert.ok(o.pdfLink && o.needsReview); const id = o.id, no = o.no;
  // 2) PDF(ZIP)を読み込む → 新規ではなく、同じ案件に反映される
  r = await call(workpdf, { headers: C, body: { name: "依頼.zip", b64: fs.readFileSync(zipPath).toString("base64"), password: "himitsu123" } });
  assert.strictEqual(r.json.results[0].state, "merged", JSON.stringify(r.json));
  const all = await list(); assert.strictEqual(all.length, 1); o = all[0];
  assert.strictEqual(o.id, id); assert.strictEqual(o.no, no); assert.strictEqual(o.reqNo, "2610-01991-2829"); assert.ok(!o.pdfLink);
  assert.ok(o.files && o.files[0] && /api\/file\?id=/.test(o.files[0].url));
  // 3) 未ログインは使えない
  assert.strictEqual((await call(workpdf, { body: { name: "a.pdf", b64: "x".repeat(200) } })).status, 401);
  console.log("workpdf tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
