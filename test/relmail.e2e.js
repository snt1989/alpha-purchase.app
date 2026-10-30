const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const post = (id, subj, body) => p.evaluate(async ([id, subj, body]) => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" }, body: JSON.stringify({ messageId: id, from: "mente-report@alphapurchase.co.jp", subject: subj, body }) })).json(), [id, subj, body]);
  console.log((await post("aaaa1111bbbb2222", "【新規修繕依頼】ローソン関連テスト店 12345678", "新規修繕依頼\n品名: 修繕 数量: 1")).state);
  await post("cccc3333dddd4444", "【お知らせ】関連テスト店の追加連絡", "配信停止はこちら unsubscribe");
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="mail"]'); await p.waitForSelector('[data-a="maillink"]');
  const sel = p.locator("select.mlsel").first(); const opt = await sel.locator("option").nth(1).getAttribute("value");
  await sel.selectOption(opt); await p.click('[data-a="maillink"]');
  await p.waitForSelector("text=未処理のメールはありません");
  await p.click('[data-a="tab"][data-t="list"]'); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]');
  await p.waitForSelector("#relm"); const t = await p.innerText("#relm");
  if (!t.includes("関連テスト店の追加連絡")) throw new Error("not linked: " + t);
  await p.click('[data-a="mlunlink"]'); await p.waitForSelector("text=まだありません", { timeout: 8000 }).catch(() => {});
  console.log("relmail e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
