const assert = require("assert");
const AP = require("../parse.js");

function run(sample, date) {
  const h = AP.sniffHeaders(sample.text);
  const mail = { from: h.from, subject: h.subject, date: date || "2026-10-30T04:00:00.000Z", body: h.body };
  const ex = AP.normalizeExtract(AP.heuristic(mail), mail);
  return { mail, ex };
}

// 1) ラベル形式
{
  const { mail, ex } = run(AP.SAMPLES[1]);
  assert.strictEqual(mail.subject, "【発注】コピー用紙・ボールペンのご手配");
  assert.strictEqual(ex.isOrder, true);
  const o = ex.orders[0];
  console.log(JSON.stringify(o, null, 1));
  assert.strictEqual(o.customer, "株式会社青葉ビルサービス");
  assert.strictEqual(o.contact, "佐藤 健一");
  assert.strictEqual(o.tel, "03-1234-5678");
  assert.strictEqual(o.deliveryDate, "2026-11-12");
  assert.ok(o.deliveryTo.includes("港区芝"));
  assert.strictEqual(o.items.length, 2);
  assert.deepStrictEqual([o.items[0].qty, o.items[0].unit, o.items[0].price], [20, "箱", 3200]);
  assert.deepStrictEqual([o.items[1].qty, o.items[1].unit, o.items[1].price], [200, "本", 80]);
  assert.strictEqual(o.urgent, true);
  const jobs = AP.makeJobs(ex, mail, { nextNo: () => AP.orderNo("2026-10-30", 1), source: "mail" });
  assert.strictEqual(jobs[0].no, "AP-261030-001");
  assert.strictEqual(jobs[0].amount, 20 * 3200 + 200 * 80);
}

// 2) 箇条書き + 相対日付(来週金曜: 2026-10-30は金曜 → 来週金曜=11/6)
{
  const { ex } = run(AP.SAMPLES[2]);
  const o = ex.orders[0];
  console.log(JSON.stringify(o, null, 1));
  assert.strictEqual(o.customer, "山田商事株式会社");
  assert.strictEqual(o.deliveryDate, "2026-11-06");
  assert.strictEqual(o.items.length, 3);
  assert.ok(o.deliveryTo.includes("大阪営業所"));
  assert.strictEqual(o.items[1].price, 450);
  assert.deepStrictEqual(o.items.map((x) => x.name), ["ホッチキス針 No.10", "ファイルボックス A4", "マジックインキ 黒"]);
}

// 3) 受注ではない
{
  const { ex } = run(AP.SAMPLES[3]);
  assert.strictEqual(ex.isOrder, false);
}

// 3b) 見積依頼
{
  const { mail, ex } = run(AP.SAMPLES[0]);
  const o = ex.orders[0];
  console.log(JSON.stringify(o));
  assert.strictEqual(o.kind, "quote");
  assert.strictEqual(o.customer, "北野精機株式会社");
  assert.strictEqual(o.quoteDue, "2026-11-06");
  assert.strictEqual(o.deliveryDate, "2026-12-10");
  assert.deepStrictEqual(o.items.map((x) => [x.name, x.qty, x.unit]), [["深溝玉軸受 6204ZZ", 200, "個"], ["Oリング P-22 NBR", 1000, "個"], ["六角穴付ボルト M6×20 SUS304", 500, "本"]]);
  const j = AP.makeJobs(ex, mail, { nextNo: () => "X", source: "mail" })[0];
  assert.strictEqual(j.status, 0); assert.strictEqual(j.kind, "quote"); assert.strictEqual(j.amount, null);
}
// 注文メールは「受注確定」から始まる
{
  const { mail, ex } = run(AP.SAMPLES[1]);
  assert.strictEqual(ex.orders[0].kind, "order");
  assert.strictEqual(AP.makeJobs(ex, mail, { nextNo: () => "X" })[0].status, 3);
}
assert.strictEqual(AP.kindOf("ご相談", "下記について見積をお願いします"), "quote");
assert.strictEqual(AP.kindOf("RE: お見積の件", "ご提示の見積で発注します"), "quote"); // 件名優先(要確認で拾う)
assert.strictEqual(AP.kindOf("注文書送付", "添付の通り発注いたします"), "order");
// 回答期限が本文の文章で書かれている場合
{
  const m = { from: "a <a@b.jp>", subject: "見積のお願い", date: "2026-10-30T00:00:00Z", body: "株式会社テストの山本です。\n・ケーブルタイ 100mm 1000本\n11/5までにご回答いただけますと幸いです。\n" };
  const o = AP.normalizeExtract(AP.heuristic(m), m).orders[0];
  assert.strictEqual(o.quoteDue, "2026-11-05"); assert.strictEqual(o.deliveryDate, ""); assert.strictEqual(o.kind, "quote");
}
// 4) 日付
assert.strictEqual(AP.parseDate("明日", "2026-10-30"), "2026-10-31");
assert.strictEqual(AP.parseDate("1/15", "2026-12-20"), "2027-01-15");
assert.strictEqual(AP.parseDate("月末", "2026-11-05"), "2026-11-30");
assert.strictEqual(AP.parseDate("令和9年1月5日", "2026-11-05"), "2027-01-05");
assert.strictEqual(AP.parseDate("今週金曜", "2026-10-28"), "2026-10-30");

// 5) .eml(ISO-2022-JP / base64 の件名・本文)
{
  const subj = "=?UTF-8?B?" + Buffer.from("【発注】テスト").toString("base64") + "?=";
  const body = Buffer.from("品名: ボルト\n数量: 100個\n").toString("base64");
  const raw = ["From: =?UTF-8?B?" + Buffer.from("鈴木 一郎").toString("base64") + "?= <suzuki@example.com>",
    "Subject: " + subj, "Date: Fri, 30 Oct 2026 10:00:00 +0900", "Message-ID: <abc123@example.com>",
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body].join("\r\n");
  const m = AP.parseEml(raw);
  assert.strictEqual(m.subject, "【発注】テスト");
  assert.strictEqual(m.from.startsWith("鈴木 一郎"), true);
  assert.strictEqual(m.messageId, "abc123@example.com");
  assert.ok(m.body.includes("ボルト"));
  assert.strictEqual(AP.dateOnly(m.date), "2026-10-30");
}

// 6) 重複キー・AIの返答の整形
assert.strictEqual(AP.mailKey({ messageId: "<x@y>" }), "mx@y");
{
  const raw = AP.pickJson('```json\n{"isOrder":true,"confidence":0.9,"orders":[{"customer":"A社","deliveryDate":"11/20","items":[{"name":"X","qty":"1,000","unit":"個","price":"50"}]}],"uncertain":[]}\n```');
  const ex = AP.normalizeExtract(raw, { date: "2026-10-30T00:00:00Z", from: "a <a@a.jp>" });
  assert.strictEqual(ex.orders[0].deliveryDate, "2026-11-20");
  assert.strictEqual(ex.orders[0].items[0].qty, 1000);
  assert.strictEqual(AP.amountOf(ex.orders[0].items, null), 50000);
}
console.log("parse tests OK");

// 6) 作業依頼書(PDFから取り出した文字)
{
  const fx = require("path").join(__dirname, "fixtures/workorder.txt");
  if (!require("fs").existsSync(fx)) { console.log("workorder: skip(test/fixtures/workorder.txt に作業依頼書PDFの文字を置くと実行)"); } else {
  const t = require("fs").readFileSync(fx, "utf8");
  assert.ok(AP.isWorkOrder(t));
  const w = AP.parseWorkOrder(t);
  assert.ok(/^\d{4}-\d{5}-\d{4}$/.test(w.reqNo)); assert.ok(/^\d+$/.test(w.caseNo));
  assert.ok(w.site); assert.ok(w.category);
  assert.ok(w.subject && !/【/.test(w.subject));
  assert.ok(w.detail); assert.ok(/^[A-Z]+-?\d+$/.test(w.storeCode));
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(w.requestedAt));
  const j = AP.makeWorkJob(w, { nextNo: () => "N", files: [{ name: "a.pdf" }] });
  assert.strictEqual(j.status, 0); assert.strictEqual(j.needsReview, false); assert.strictEqual(j.customer, "株式会社アルファパーチェス");
  assert.strictEqual(AP.workKey(w), "w" + w.reqNo);
  console.log("workorder OK");
  }
}

// 7) パスワード通知メール
{
  const X = (t) => AP.extractPasswords(t);
  assert.strictEqual(X("先ほどお送りしたファイルのパスワードをお知らせします。\nパスワード：Kp7x#2Qa\nよろしくお願いします。")[0], "Kp7x#2Qa");
  assert.strictEqual(X("【パスワード】\n  aZ93kd01  \n")[0], "aZ93kd01");
  assert.strictEqual(X("解凍パスワードは「hR4mT8」です。")[0], "hR4mT8");
  assert.strictEqual(X("PW: 20261027abc")[0], "20261027abc");
  assert.strictEqual(X("Password : P@ss-2026")[0], "P@ss-2026");
  // ラベルがなくても、それらしい文字列は候補に入る(電話番号・メールアドレスは除く)
  const c = X("株式会社アルファパーチェス\n添付ファイルの件\n\nX9w2Lm4q\n\nTEL 03-6830-9858\nmente-report@alphapurchase.co.jp");
  assert.ok(c.includes("X9w2Lm4q")); assert.ok(!c.some((v) => v.includes("6830") || v.includes("@")));
  console.log("password OK");
}
{ const AP2 = require("../parse.js"); const w = AP2.parseWorkOrder("作業依頼書\n店舗名\t365575 ローソン 花巻不動\t岩手南支店\n作業依頼番号/顧客案件番号\t2610-02161-3067\t/\t03194235\n工事・作業名称\t【修繕】\tテスト\n");
  require("assert").strictEqual(w.site, "365575 ローソン 花巻不動"); require("assert").strictEqual(w.jurisdiction, "岩手南支店");
  require("assert").strictEqual(AP2.splitJurisdiction("ローソン 花巻不動 岩手南支店").site, "ローソン 花巻不動"); console.log("jurisdiction OK"); }
