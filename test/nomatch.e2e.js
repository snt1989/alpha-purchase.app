const { chromium } = require("playwright"); const fs = require("fs");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const b64 = fs.readFileSync(__dirname + "/fixtures/report.pdf").toString("base64");
  const r = await p.evaluate(async (b64) => (await fetch("/api/workpdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x-report.pdf", b64 }) })).json(), b64);
  console.log(JSON.stringify(r).slice(0, 200));
  await p.click('[data-a="tab"][data-t="docs"]'); await p.waitForSelector('h3:has-text("未紐づけの書類")'); await p.waitForTimeout(1200);
  const t = await p.innerText("main"); if (!/x-report\.pdf/.test(t)) throw new Error("not shown: " + t.slice(0, 500));
  console.log("nomatch e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
