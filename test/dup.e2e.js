const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const post = (id) => p.evaluate(async (id) => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" }, body: JSON.stringify({ messageId: id, from: "mente-report@alphapurchase.co.jp", subject: "【新規修繕依頼】スーパーホテル重複テスト店", body: "新規修繕依頼\n品名: 修繕 数量: 1" }) })).json(), id);
  await post("dupA" + Date.now()); await post("dupB" + Date.now());
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="docs"]'); await p.click('[data-a="dupchk"]');
  await p.waitForSelector(".dpc");
  const n = await p.locator(".dpc").count(), c = await p.locator(".dpc:checked").count();
  if (n < 2 || c !== n - 1) throw new Error("dup n=" + n + " checked=" + c);
  await p.click('[data-a="dupdel"]'); await p.click('[data-a="dupdel"]');
  await p.waitForTimeout(800);
  console.log("dup e2e OK n=" + n); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
