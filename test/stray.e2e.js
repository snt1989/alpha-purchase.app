const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const post = (from, id) => p.evaluate(async ([from, id]) => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" }, body: JSON.stringify({ messageId: id, from, subject: "見積のお願い " + id, body: "品名: テスト部品\n数量: 3個\n回答期限: 11/20\n" }) })).json(), [from, id]);
  console.log(JSON.stringify(await post("関係ない <x@other.example.com>", "s1")), JSON.stringify(await post("担当 <mente-report@alphapurchase.co.jp>", "s2")));
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="set"]'); await p.waitForSelector("text=アルファパーチェス以外のメールから登録された案件");
  const n = await p.locator(".stc").count(); if (n !== 1) throw new Error("stray count " + n);
  await p.click('[data-a="straydel"]'); await p.click('[data-a="straydel"]'); await p.waitForSelector("text=該当する案件はありません");
  await p.click('[data-a="tab"][data-t="list"]'); await p.waitForTimeout(500);
  const t = await p.innerText("body"); if (t.includes("s1")) throw new Error("not deleted"); if (!t.includes("s2")) throw new Error("legit gone");
  console.log("stray e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
