// 写真の追加・報告書の作成(Playwright)。dev/server.js を起動してから: node test/photo.e2e.js <写真1> <写真2>
const { chromium } = require("playwright");
const assert = require("assert");
const [img1, img2, out = "."] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET/.test(m.text())) errs.push(m.text()); });
  await p.goto("http://localhost:3123/");
  await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  // 案件を1件つくる(受信口に架空メール)
  await p.evaluate(async () => fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" },
    body: JSON.stringify({ messageId: "ph1", from: "テスト <t@example.invalid>", subject: "見積のお願い(架空)", body: "架空テスト株式会社です。\n品名: テスト部品\n数量: 3個\n回答期限: 12/31\n" }) }));
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('.nv[data-t="list"]'); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]');
  await p.waitForSelector("#ph");
  await p.setInputFiles("#phi", [img1, img2]);
  await p.waitForFunction(() => document.querySelectorAll("#ph .phc").length === 2, null, { timeout: 15000 });
  // 保存済み写真が配信され、縮小されている
  const info = await p.evaluate(async () => { const im = document.querySelector("#ph img"); await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight, src: im.getAttribute("src") }; });
  console.log("PHOTO:", JSON.stringify(info)); assert.ok(info.w <= 1280 && info.w > 400); assert.ok(info.src.startsWith("/api/file?id="));
  await p.selectOption('#ph .pht[data-i="0"]', "作業前"); await p.fill('#ph .phcap[data-i="0"]', "施工前の状態"); await p.fill('#ph .phcap[data-i="1"]', "施工後の状態");
  // 報告書
  await p.click('[data-a="report"]'); await p.waitForSelector("#rpt .pg");
  assert.ok((await p.textContent("#rpt .pg")).includes("作業完了報告書"));
  assert.strictEqual(await p.locator("#rp-ph figure").count(), 2);
  assert.ok((await p.textContent("#rp-ph")).includes("施工前の状態"));
  await p.fill("#rp-note", "特になし"); await p.evaluate(() => { document.getElementById("rp-sum").textContent = "洗面台の水漏れを修理しました。"; });
  await p.click('[data-a="rpsave"]'); await p.waitForSelector(".toast");
  await p.screenshot({ path: out + "/report.png", fullPage: true });
  await p.pdf({ path: out + "/report.pdf", format: "A4", printBackground: true });
  await p.click('[data-a="rpclose"]');
  // 保存・再読み込みしても残る
  await p.click('[data-a="closedlg"]'); await p.reload(); await p.waitForSelector(".pghead");
  await p.click('.nv[data-t="list"]'); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]'); await p.waitForSelector("#ph .phc");
  assert.strictEqual(await p.locator("#ph .phc").count(), 2);
  assert.strictEqual(await p.inputValue('#ph .phcap[data-i="0"]'), "施工前の状態");
  await p.click('[data-a="report"]'); await p.waitForSelector("#rp-sum");
  assert.ok((await p.textContent("#rp-sum")).includes("水漏れ")); await p.click('[data-a="rpclose"]');
  // 削除
  await p.click('[data-a="phdel"][data-i="1"]'); await p.waitForFunction(() => document.querySelectorAll("#ph .phc").length === 1);
  console.log("ERRS:", JSON.stringify(errs)); assert.strictEqual(errs.length, 0);
  await b.close(); console.log("photo e2e OK");
})().catch((e) => { console.error(e); process.exit(1); });
