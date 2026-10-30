const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const post = (id, subj) => p.evaluate(async ([id, subj]) => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" }, body: JSON.stringify({ messageId: id, from: "mente-report@alphapurchase.co.jp", subject: subj, body: "配信停止はこちら unsubscribe" }) })).json(), [id, subj]);
  const r1 = await post("abcdef0123456789", "【お知らせ】メンテナンスのご連絡"); console.log("state", r1.state);
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="mail"]'); await p.waitForSelector('[data-a="maildone"]');
  const t = await p.innerText("#main, main, body"); if (!t.includes("メンテナンスのご連絡")) throw new Error("not listed");
  if (!(await p.locator('a:has-text("Gmailで開く")').count())) throw new Error("no gmail link");
  await p.click('[data-a="mailnew"]'); await p.waitForSelector("#f-site"); await p.keyboard.press("Escape");
  await p.click('[data-a="tab"][data-t="mail"]'); await p.click('[data-a="maildone"]');
  await p.waitForSelector("text=未処理のメールはありません");
  console.log("mail e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
