const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const b64 = fs.readFileSync(path.join(__dirname, "fixtures/order.pdf")).toString("base64");
  await p.evaluate(async (b64) => (await fetch("/api/workpdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ create: true, name: "orphan-test.pdf", b64 }) })).json(), b64);
  // 旧バージョンの解除(書類だけ案件から消える)を再現
  await p.evaluate(async () => { const l = await (await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "list", col: "orders" }) })).json();
    for (const d of l.docs) { if ((d.data.files || []).some((f) => f.name === "orphan-test.pdf")) { d.data.files = []; await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "orders", id: d.id, data: d.data }) }); } } });
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="docs"]');
  await p.waitForSelector("b >> text=orphan-test.pdf", { timeout: 8000 });
  const row = p.locator('div.row2:has(b:text-is("orphan-test.pdf"))');
  const opt = await row.locator("select.ldsel option").nth(1).getAttribute("value");
  await row.locator("select.ldsel").selectOption(opt); await row.locator('[data-a="ldlink"]').click();
  await p.waitForTimeout(1500); 
  if (await p.locator("div.row2:has(b:text-is(\"orphan-test.pdf\"))").count()) throw new Error("orphan remains");
  console.log("orphan e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
