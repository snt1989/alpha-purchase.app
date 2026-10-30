const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  await p.evaluate(async () => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" }, body: JSON.stringify({ messageId: "w1", from: "m@alphapurchase.co.jp", subject: "【新規修繕依頼】スーパーホテル盛岡 104143", body: "新規修繕依頼\n品名: 修繕\n数量: 1\nhttps://mailer.kintoneapp.com/attachment/aaa/1/address/1/x/confirm\n" }) })).json());
  await p.reload(); await p.waitForSelector(".pghead");
  if (!(await p.locator("#wpf").count())) throw new Error("no upload button");
  p.on("dialog", (d) => d.accept("himitsu123"));
  await p.setInputFiles("#wpf", path.join(__dirname, "fixtures/locked.zip"));
  await p.waitForSelector("text=の内容を更新しました", { timeout: 20000 });
  await p.click('[data-a="tab"][data-t="list"]'); await p.waitForTimeout(400);
  const t = await p.innerText("body"); if (!t.includes("2610-01991-2829") && !t.includes("スーパーホテル")) throw new Error("not merged in list");
  await p.screenshot({ path: process.argv[2] || "/tmp/wp.png" });
  console.log("workpdf e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
