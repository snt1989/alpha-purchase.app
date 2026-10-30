// 画面の通し確認(Playwright)。dev/server.js を起動してから実行
const { chromium } = require("playwright");
const out = process.argv[2] || ".";
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://localhost:3123/");
  await p.fill("#lpw", "test1234"); await p.click(".login button");
  await p.waitForSelector(".pghead");
  // メール取込 → サンプル1 → 登録
  await p.click('.nv[data-t="import"]');
  await p.click('[data-a="sample"][data-i="0"]');
  await p.click("#go");
  await p.waitForSelector(".rc.ok");
  console.log("REG1:", (await p.textContent(".rc.ok")).trim().slice(0, 120));
  // 同じメール → 重複
  await p.click('[data-a="sample"][data-i="0"]'); await p.click("#go");
  await p.waitForSelector(".rc.warn"); console.log("DUP:", (await p.textContent(".rc.warn b")).trim());
  // メルマガ → 対象外
  await p.click('[data-a="sample"][data-i="3"]'); await p.click("#go");
  await p.waitForFunction(() => document.querySelector(".rc.warn b") && document.querySelector(".rc.warn b").textContent.includes("見積依頼・注文のメールではない"));
  console.log("SKIP: ok");
  // サンプル2を確認してから登録
  await p.click('[data-a="sample"][data-i="2"]'); await p.check("#pv"); await p.click("#go");
  await p.waitForSelector(".dlg");
  console.log("DRAFT cust:", await p.inputValue("#f-cust"), "due:", await p.inputValue("#f-due"));
  await p.screenshot({ path: out + "/03-confirm.png", fullPage: true });
  await p.fill("#items tbody tr:nth-child(1) .p", "120");
  await p.click('[data-a="savejob"]');
  await p.waitForSelector(".toast");
  console.log("TOAST:", await p.textContent(".toast"));
  await p.screenshot({ path: out + "/02-import.png", fullPage: true });
  // Gmail自動取込(受信口)を直接叩いて、画面に反映されるか
  const r = await p.evaluate(async () => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" },
    body: JSON.stringify({ messageId: "gm-xyz", from: "高橋 <takahashi@kogyo.example.jp>", subject: "【至急】部品手配のお願い", date: new Date().toISOString(),
      body: "アルファパーチェス様\n\n高橋工業株式会社の高橋です。\n下記至急手配をお願いします。\n\n品名: 六角ボルト M8×30\n数量: 1,000本\n単価: 12円\n\n品名: 平座金 M8\n数量: 1,000個\n\n納期: 明後日\n納品先: 埼玉県川口市本町4-1-1 高橋工業 第2工場\n" }) })).json());
  console.log("INBOUND:", JSON.stringify(r));
  // 一覧
  await p.click('.nv[data-t="list"]'); await p.waitForSelector("#lst table");
  console.log("ROWS:", await p.$$eval("#lst tbody tr", (t) => t.length));
  await p.screenshot({ path: out + "/04-list.png", fullPage: true });
  // 案件を開いて状態変更
  await p.click("#lst tbody tr:first-child"); await p.waitForSelector(".dlg");
  await p.click('[data-a="advance"]'); await p.click('[data-a="savejob"]'); await p.waitForTimeout(300);
  await p.click('.nv[data-t="home"]'); await p.waitForSelector(".todo, .empty");
  await p.screenshot({ path: out + "/01-home.png", fullPage: true });
  await p.click('.nv[data-t="cust"]'); await p.screenshot({ path: out + "/05-cust.png", fullPage: true });
  // スマホ幅
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#bnav [data-t="list"]'); await p.waitForTimeout(200);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log("MOBILE scrollWidth:", sw);
  await p.screenshot({ path: out + "/06-mobile.png" });
  console.log("ERRORS:", errs.length ? errs : "none");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
