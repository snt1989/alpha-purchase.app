const { chromium } = require("playwright"); const fs = require("fs");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login");
  await p.screenshot({ path: "/tmp/claude-0/shots/m_login.png" });
  await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const fx = __dirname + "/fixtures/";
  for (const n of ["order.pdf", "report.pdf"]) { const b64 = fs.readFileSync(fx + n).toString("base64"); await p.evaluate(async ([n, b64]) => (await fetch("/api/workpdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ create: true, name: n, b64 }) })).json(), [n, b64]); }
  await p.evaluate(async () => {
    const set = (id, d) => fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "orders", id, data: d }) });
    for (let k = 1; k <= 4; k++) await set("s" + k, { id: "s" + k, no: "AP-261119-00" + k, kind: k % 2 ? "work" : "quote", status: k, site: ["ローソン横浜町道の駅前店", "スーパーホテル盛岡", "ローソン花巻不動店", "ローソン北上駅前店"][k - 1], customer: "株式会社アルファパーチェス", reqNo: "2610-0200" + k + "-2851", caseNo: "0319319" + k, subject: "照明の修理のお願い", needsReview: k === 2, issues: k === 2 ? ["数量が不明な品目があります"] : [], urgent: k === 3, items: [{ name: "LED照明", qty: 2, unit: "台", price: 12000 }], files: [], createdAt: "2026-11-1" + k + "T01:00:00Z", quoteDue: "2026-11-2" + k, workDate: "2026-11-2" + k });
    await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "mails", id: "mk1", data: { key: "mk1", state: "skipped", subject: "RE: 《日程連絡・見積り送付のお願い》ローソン各店", from: "x@alphapurchase.co.jp", date: "2026-11-19", at: "2026-11-19T01:00:00Z" } }) });
  });
  await p.reload(); await p.waitForSelector(".pghead"); await p.waitForTimeout(800);
  for (const t of ["home", "list", "docs", "mail", "cust", "set"]) {
    await p.evaluate((t) => { const b = document.querySelector('#bnav [data-t="' + t + '"]') || document.querySelector('[data-t="' + t + '"]'); b && b.click(); }, t);
    await p.waitForTimeout(900);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(t, "scrollW", w, "bnavLabels", await p.evaluate(() => document.querySelector("#bnav") ? document.querySelector("#bnav").children.length : 0));
    await p.screenshot({ path: "/tmp/claude-0/shots/m_" + t + ".png", fullPage: true });
  }
  await p.evaluate(() => document.querySelector('[data-a="new"]') && document.querySelector('[data-a="new"]').click()); await p.waitForTimeout(500);
  await p.screenshot({ path: "/tmp/claude-0/shots/m_new.png" });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
