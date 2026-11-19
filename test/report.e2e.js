const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  p.on("pageerror", (e) => { throw e; });
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  await p.evaluate(async () => { await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "orders", id: "rp1", data: { id: "rp1", no: "AP-261119-091", kind: "work", status: 4, site: "ローソン花巻不動店", subject: "照明修理", reqNo: "2610-09999-0001", caseNo: "09999999", staff: "佐藤", files: [], photos: [], createdAt: "2026-11-19T01:00:00Z" } }) }); });
  await p.reload(); await p.waitForSelector(".pghead");
  await p.locator('button[data-t="list"]:visible').first().click(); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]');
  await p.waitForSelector(".dlg"); await p.click('[data-a="dtab"][data-p="docs"]');
  await p.click('.docs [data-a="report"]'); await p.waitForSelector("#rpt .ed1");
  // 既定値
  const v0 = await p.innerText('#rpt .ed1[data-k="workers"]'); if (v0 !== "佐藤") throw new Error("default workers " + v0);
  await p.fill('#rpt .ed1[data-k="workTime"]', "9:00〜11:30"); // contenteditable fill
  await p.locator('#rpt .ed1[data-k="workers"]').fill("佐藤、鈴木");
  await p.locator('#rpt .ed1[data-k="result"]').fill("完了(部品交換のみ)");
  await p.locator("#rp-sum").fill("LED照明2台を交換しました。");
  await p.click('[data-a="rpsave"]'); await p.waitForTimeout(600);
  await p.click('[data-a="rpclose"]'); await p.waitForTimeout(300);
  // 保存確認(サーバー側)
  const saved = await p.evaluate(async () => { const r = await (await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "list", col: "orders" }) })).json(); return r.docs.map((d) => d.data).find((x) => x.id === "rp1"); });
  if (!saved.report || saved.report.workers !== "佐藤、鈴木" || saved.report.workTime !== "9:00〜11:30" || saved.reportText !== "LED照明2台を交換しました。" || !saved.reportEditedAt) throw new Error("not saved " + JSON.stringify(saved).slice(0, 400));
  // 再度開いても残っている
  await p.click('.docs [data-a="report"]'); await p.waitForSelector("#rpt .ed1");
  const w = await p.innerText('#rpt .ed1[data-k="workers"]'); if (w !== "佐藤、鈴木") throw new Error("reopen " + w);
  console.log("report e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
