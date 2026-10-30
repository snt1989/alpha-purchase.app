const assert = require("assert");
process.env.APP_PASSWORD = "pw-for-test";
process.env.INBOUND_TOKEN = "inbound-token-0123456789";
process.env.ALLOWED_SENDERS = "*";
globalThis.__REDIS_MOCK__ = require("../dev/redis-mock")();
const AP = require("../parse.js");

function call(handler, { method = "POST", headers = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, headers, body, query: {} }, out = { status: 200, headers: {} };
    const res = {
      setHeader: (k, v) => (out.headers[k.toLowerCase()] = v),
      status: (n) => ((out.status = n), res),
      json: (o) => (out.json = o, resolve(out)),
      send: (s) => (out.text = s, resolve(out)), end: () => resolve(out),
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const auth = require("../api/auth.js"), db = require("../api/db.js"), ingest = require("../api/ingest.js"), inbound = require("../api/inbound.js");

(async () => {
  // ログイン
  let r = await call(auth, { body: { op: "login", password: "wrong" } });
  assert.strictEqual(r.status, 401);
  r = await call(auth, { body: { op: "login", password: "pw-for-test" } });
  assert.strictEqual(r.json.ok, true);
  const cookie = r.headers["set-cookie"].split(";")[0];
  const H = { cookie };
  assert.strictEqual((await call(auth, { headers: H, body: { op: "check" } })).json.ok, true);
  assert.strictEqual((await call(db, { body: { op: "list", col: "orders" } })).status, 401, "未ログインは弾く");

  // 貼り付け → 自動登録(AIなし=簡易解析)
  const text0 = AP.SAMPLES[1].text;
  r = await call(ingest, { headers: H, body: { text: text0 } });
  assert.strictEqual(r.json.state, "registered");
  const day = AP.todayJst().replace(/-/g, "").slice(2);
  assert.strictEqual(r.json.jobs[0].no, "AP-" + day + "-001");
  assert.strictEqual(r.json.jobs[0].customer, "株式会社青葉ビルサービス");
  assert.strictEqual(r.json.jobs[0].amount, 20 * 3200 + 200 * 80);
  assert.strictEqual(r.json.jobs[0].parsedBy, "rule");

  // 同じメールは重複扱い → force で再登録
  r = await call(ingest, { headers: H, body: { text: text0 } });
  assert.strictEqual(r.json.state, "duplicate");
  assert.strictEqual(r.json.jobs[0].no, "AP-" + day + "-001");
  r = await call(ingest, { headers: H, body: { text: text0, force: true } });
  assert.strictEqual(r.json.state, "registered");
  assert.strictEqual(r.json.jobs[0].no, "AP-" + day + "-002");

  // 受注ではないメールは登録しない / dryRun は保存しない
  r = await call(ingest, { headers: H, body: { text: AP.SAMPLES[3].text } });
  assert.strictEqual(r.json.state, "skipped");
  r = await call(ingest, { headers: H, body: { text: AP.SAMPLES[2].text, dryRun: true } });
  assert.strictEqual(r.json.state, "draft");
  assert.strictEqual(r.json.jobs[0].items.length, 3);
  let list = (await call(db, { headers: H, body: { op: "list", col: "orders" } })).json;
  assert.strictEqual(list.docs.length, 2, "dryRunとskippedは保存されない");

  // 自動取込の受信口
  const mailBody = { messageId: "<gm-1@mail.gmail.com>", from: "山田 太郎 <y@yamada.example.jp>", subject: "ご注文", date: "2026-10-30T01:00:00Z", body: "山田工業株式会社の山田です。\n品名: ナット M6\n数量: 500個\n納期: 11/20\n" };
  r = await call(inbound, { body: mailBody });
  assert.strictEqual(r.status, 401);
  const BH = { authorization: "Bearer inbound-token-0123456789" };
  r = await call(inbound, { headers: BH, body: mailBody });
  assert.strictEqual(r.json.state, "registered");
  assert.strictEqual(r.json.nos.length, 1);
  r = await call(inbound, { headers: BH, body: mailBody });
  assert.strictEqual(r.json.state, "duplicate");
  list = (await call(db, { headers: H, body: { op: "list", col: "orders" } })).json;
  const g = list.docs.map((d) => d.data).find((o) => o.source === "gmail");
  assert.strictEqual(g.customer, "山田工業株式会社");
  assert.strictEqual(g.deliveryDate, "2026-11-20");
  assert.strictEqual(g.items[0].qty, 500);

  // AI解析(Claude APIをモック)
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const realFetch = global.fetch; let sent = null;
  global.fetch = async (url, opt) => {
    assert.ok(String(url).includes("api.anthropic.com"));
    sent = JSON.parse(opt.body);
    const out = { isOrder: true, confidence: 0.95, orders: [{ customer: "テスト商事", contact: "鈴木", items: [{ name: "ネジ", qty: 10, unit: "個", price: 100 }], deliveryDate: "2026-12-01" }], uncertain: [] };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "```json\n" + JSON.stringify(out) + "\n```" }] }) };
  };
  r = await call(ingest, { headers: H, body: { text: "From: a <a@b.jp>\nSubject: AI test\n\nネジを10個ください" } });
  assert.strictEqual(r.json.jobs[0].parsedBy, "ai");
  assert.strictEqual(r.json.jobs[0].customer, "テスト商事");
  assert.strictEqual(r.json.jobs[0].needsReview, false);
  assert.ok(sent.messages[0].content.includes("ネジを10個ください"));
  assert.strictEqual(sent.model, "claude-sonnet-5-5");
  // AI失敗 → 簡易解析にフォールバック(取りこぼさない)
  global.fetch = async () => ({ ok: false, status: 529, json: async () => ({ error: { message: "overloaded" } }) });
  r = await call(ingest, { headers: H, body: { text: "From: c <c@d.jp>\nSubject: 失敗テスト\n\n品名: ボルト\n数量: 5個\n" } });
  assert.strictEqual(r.json.state, "registered");
  assert.strictEqual(r.json.jobs[0].parsedBy, "rule");
  assert.ok(r.json.jobs[0].issues.some((x) => x.includes("AI解析に失敗")));
  global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY;

  // 保存・削除・バックアップ復元
  const id = list.docs[0].id;
  assert.strictEqual((await call(db, { headers: H, body: { op: "del", col: "orders", id } })).json.ok, true);
  const after = (await call(db, { headers: H, body: { op: "list", col: "orders" } })).json;
  assert.strictEqual(after.docs.length, list.docs.length + 2 - 1);
  assert.strictEqual((await call(db, { headers: H, body: { op: "import", data: { orders: [{ id: "x1", data: { no: "X" } }], settings: { staff: ["A"] } } } })).json.imported, 2);
  assert.strictEqual((await call(db, { headers: H, body: { op: "set", col: "orders", id: "bad id!" } })).status, 400);
  console.log("api tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
