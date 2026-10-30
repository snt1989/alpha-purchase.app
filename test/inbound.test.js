// Gmail 自動取込(添付ZIP・前後のメールのパスワード)の確認
// test/fixtures/locked.zip(作業依頼書PDF入り、パスワード himitsu123)が無いときは飛ばす
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.APP_PASSWORD = "pw-for-test";
process.env.INBOUND_TOKEN = "inbound-token-0123456789";
process.env.ALLOWED_SENDERS = "*";
globalThis.__REDIS_MOCK__ = require("../dev/redis-mock")();
const zipPath = path.join(__dirname, "fixtures/locked.zip");
if (!fs.existsSync(zipPath)) { console.log("inbound: skip(test/fixtures/locked.zip がありません)"); process.exit(0); }

function call(handler, { method = "POST", headers = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, headers, body, query }, out = { status: 200, headers: {} };
    const res = {
      statusCode: 200, setHeader: (k, v) => (out.headers[k.toLowerCase()] = v),
      status: (n) => ((out.status = n), res), json: (o) => ((out.json = o), resolve(out)),
      send: (s) => ((out.text = s), resolve(out)), end: (b) => { out.status = res.statusCode !== 200 ? res.statusCode : out.status; out.body = b; resolve(out); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const inbound = require("../api/inbound.js"), auth = require("../api/auth.js"), db = require("../api/db.js"), file = require("../api/file.js");
const H = { authorization: "Bearer inbound-token-0123456789" };
const b64 = fs.readFileSync(zipPath).toString("base64");

(async () => {
  const t0 = Date.now();
  // 1) 前後のメールにパスワードが無い → 422(次回やり直し)
  let r = await call(inbound, { headers: H, body: { messageId: "m1", from: "a <a@alpha.example>", subject: "作業依頼", body: "添付します", attachments: [{ name: "依頼.zip", b64 }], pwTexts: [{ subject: "別件", body: "案件番号 Zz99xx11" }] } });
  assert.strictEqual(r.status, 422); assert.strictEqual(r.json.results[0].code, "no_password");
  // 2) 直後のメールにパスワード → 登録
  r = await call(inbound, { headers: H, body: { messageId: "m1", from: "a <a@alpha.example>", subject: "作業依頼", body: "添付します", attachments: [{ name: "依頼.zip", b64 }],
    pwTexts: [{ subject: "別件", body: "案件番号 Zz99xx11" }, { subject: "【パスワード通知】作業依頼", body: "パスワード：himitsu123" }] } });
  console.log(JSON.stringify(r.json));
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.results[0].state, "registered");
  // 3) 同じ依頼をもう一度 → 重複
  r = await call(inbound, { headers: H, body: { messageId: "m2", from: "a", subject: "再送", attachments: [{ name: "依頼.zip", b64 }], pwTexts: [{ body: "PW: himitsu123" }] } });
  assert.strictEqual(r.json.results[0].state, "duplicate");
  // 4) 画面から見える(案件・取込ログ・PDF)
  const lg = await call(auth, { body: { op: "login", password: "pw-for-test" } });
  const C = { cookie: lg.headers["set-cookie"].split(";")[0] };
  const orders = (await call(db, { headers: C, body: { op: "list", col: "orders" } })).json.docs.map((d) => d.data);
  assert.strictEqual(orders.length, 1);
  const o = orders[0];
  assert.strictEqual(o.kind, "work"); assert.ok(o.reqNo && o.site && o.subject); assert.strictEqual(o.source, "gmail");
  assert.ok(o.history.some((h) => h.text.includes("パスワード通知")));
  assert.ok(o.files[0].url.startsWith("/api/file?id="));
  const fid = decodeURIComponent(o.files[0].url.split("id=")[1]);
  const f = await call(file, { method: "GET", headers: C, query: { id: fid } });
  assert.strictEqual(f.headers["content-type"], "application/pdf"); assert.ok(Buffer.from(f.body).slice(0, 4).toString() === "%PDF");
  assert.strictEqual((await call(file, { method: "GET", headers: {}, query: { id: fid } })).status, 401);
  const mails = (await call(db, { headers: C, body: { op: "list", col: "mails" } })).json.docs.map((d) => d.data);
  assert.ok(mails.some((m) => m.subject === "作業依頼" && m.state === "registered"));
  // 5) 添付なしのメールは本文から登録(従来どおり)
  r = await call(inbound, { headers: H, body: { messageId: "m3", from: "山田 <y@yamada.example.jp>", subject: "見積のお願い", body: "山田工業株式会社です。\n品名: ナット M6\n数量: 500個\n回答期限: 11/20\n" } });
  assert.strictEqual(r.json.state, "registered");
  // 6) アルファパーチェス以外の差出人は取り込まない
  process.env.ALLOWED_SENDERS = "alphapurchase.co.jp,gravity-inc001.com";
  r = await call(inbound, { headers: H, body: { messageId: "m4", from: "関係ない <x@other.example.com>", subject: "見積のお願い", body: "品名: ボルト\n数量: 10個\n" } });
  assert.strictEqual(r.json.state, "ignored");
  r = await call(inbound, { headers: H, body: { messageId: "m5", from: "mente-report@alphapurchase.co.jp", subject: "見積のお願い", body: "品名: ボルト\n数量: 10個\n回答期限: 11/20\n" } });
  assert.notStrictEqual(r.json.state, "ignored");
  console.log("inbound tests OK (" + (Date.now() - t0) + "ms)");
})().catch((e) => { console.error(e); process.exit(1); });
