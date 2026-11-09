const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  p.on("pageerror", (e) => { throw e; });
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  await p.evaluate(async () => { await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "orders", id: "rv1", data: { id: "rv1", no: "AP-261109-001", kind: "work", status: 0, site: "ローソン花巻不動店", needsReview: true, issues: ["数量が不明な品目があります"], files: [], createdAt: "2026-11-09T01:00:00Z" } }) }); });
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="list"]'); await p.waitForSelector(".rvr");
  const t = await p.innerText(".rvr"); if (!/数量が不明/.test(t)) throw new Error("no reason in list: " + t);
  await p.click('[data-a="open"]'); await p.waitForSelector(".issues");
  const d = await p.innerText(".issues"); if (!/要確認の理由/.test(d) || !/数量が不明/.test(d)) throw new Error("dlg: " + d);
  console.log("review e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
