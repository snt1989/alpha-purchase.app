const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 1100, height: 900 }, { width: 390, height: 800 }]) {
    const p = await b.newPage({ viewport: vp }); p.on("pageerror", (e) => { throw e; });
    await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
    await p.evaluate(async () => { await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "orders", id: "nt1", data: { id: "nt1", no: "AP-261119-777", kind: "work", status: 3, site: "ローソン花巻不動店", subject: "照明修理", urgent: true, workDate: "2020-01-01", files: [], photos: [], createdAt: new Date().toISOString() } }) }); });
    await p.reload(); await p.waitForSelector(".pghead");
    const n0 = await p.innerText("#bellN"); if (!+n0) throw new Error("no badge " + n0);
    if (!(await p.evaluate(() => window.__upd))) throw new Error("no update watcher");
    await p.click("#bell"); await p.waitForSelector("#nt .nti");
    if (!(await p.locator("#nt .nti").allInnerTexts()).join().includes("ローソン花巻不動店")) throw new Error("no case notice");
    const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (w > 0) throw new Error("overflow " + w);
    if ((await p.locator("#nt .nti").allInnerTexts()).join().includes("アプリ更新")) throw new Error("changelog in news tab");
    await p.click('[data-a="nttab"][data-t="app"]'); if (!(await p.locator("#nt .nti").allInnerTexts()).join().includes("アプリ更新")) throw new Error("no changelog");
    if (await p.locator("#nt .ntf").count()) throw new Error("form in app tab");
    await p.click('[data-a="nttab"][data-t="news"]');
    await p.click("#bell");
    await p.route(/localhost:3123\/$/, async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/var APP_VER="[^"]+"/, 'var APP_VER="9999"') }); });
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(800);
    await p.click("#bell"); await p.click('[data-a="nttab"][data-t="app"]'); if (!(await p.locator("#nt .nti", { hasText: "新しいバージョン" }).count())) throw new Error("no update notice");
    await p.unroute(/localhost:3123\/$/);
    await p.click('[data-a="nttab"][data-t="news"]');
    for (const g of ["対応が必要", "未処理", "連絡事項", "新着案件"]) { await p.click('#nt .nts2 button:has-text("' + g + '")'); await p.waitForTimeout(50); }
    await p.click('#nt .nts2 button:has-text("新着案件")'); if (!(await p.locator("#nt .nti").allInnerTexts()).join().includes("新しい案件")) throw new Error("new tab");
    await p.click('#nt .nts2 button:has-text("対応が必要")'); if ((await p.locator("#nt .nti").allInnerTexts()).join().includes("新しい案件")) throw new Error("not split");
    await p.fill("#nt-t", "明日は棚卸です"); await p.click('[data-a="ntadd"]'); await p.waitForSelector('#nt:has-text("明日は棚卸です")');
    await p.click('[data-a="ntall"]'); if ((await p.innerText("#bellN")).trim() !== "") throw new Error("badge not cleared");
    await p.click('#nt .nts2 button:has-text("対応が必要")'); await p.locator('#nt .nti[data-o]').first().click(); await p.waitForSelector(".dlg"); if (await p.locator("#nt").count()) throw new Error("panel stays");
    await p.close();
  }
  console.log("notice e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
