const { chromium } = require("playwright"); const fs = require("fs");
(async () => {
  const b64 = fs.readFileSync(__dirname + "/fixtures/report-sample.pdf").toString("base64");
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  const nm = __dirname + "/../node_modules/";
  await p.route(/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/, (r, q) => r.fulfill({ path: nm + "pdfjs-dist/build/" + q.url().split("/").pop(), contentType: "text/javascript" }));
  await p.route(/pdf-lib\.min\.js$/, (r) => r.fulfill({ path: nm + "pdf-lib/dist/pdf-lib.min.js", contentType: "text/javascript" }));
  await p.route(/zip-full\.min\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: "window.zip={configure(){}}" }));
  p.on("pageerror", (e) => { throw e; }); p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  await p.evaluate(async (b64) => {
    const J = (path, data) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json());
    const up = await J("/api/pdfedit", { jobId: "pf1", name: "報告書.pdf", b64 });
    await J("/api/db", { op: "set", col: "orders", id: "pf1", data: { id: "pf1", no: "AP-261119-093", kind: "work", status: 4, site: "北上流通", subject: "扉交換", staff: "佐藤", workDate: "2026-11-19", files: [{ name: "作業完了報告書.pdf", url: up.url, label: "作業完了報告書", kind: "report" }], photos: [], createdAt: "2026-11-19T01:00:00Z" } });
  }, b64);
  await p.reload(); await p.waitForSelector(".pghead");
  await p.locator('button[data-t="list"]:visible').first().click(); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]');
  await p.waitForSelector(".dlg"); await p.click('[data-a="dtab"][data-p="docs"]');
  await p.click('[data-a="pdfedit"]'); await p.waitForSelector("#pe .pel", { timeout: 20000 });
  const nb = await p.locator("#pe .peb").count(); if (nb !== 19) throw new Error("boxes " + nb);
  await p.locator("#pe .peb").nth(0).click(); await p.locator("#pe .peb").nth(8).click(); await p.locator("#pe .peb").nth(15).click();
  if (await p.locator("#pe .pek").count() !== 3) throw new Error("checks");
  await p.locator("#pe .peb").nth(8).click(); if (await p.locator("#pe .pek").count() !== 2) throw new Error("toggle off");
  await p.locator("#pe .peb").nth(8).click();
  // 自動入力
  await p.click("#pe summary"); await p.fill("#pq-s", "09:00"); await p.fill("#pq-e", "11:30"); await p.fill("#pq-n", "2");
  await p.click('[data-a="peqfill"]');
  const nt = await p.locator("#pe .pet").count(); if (nt !== 4) throw new Error("autofill texts " + nt);
  // 枠タップで文字入力(案件名の下の「詳細場所」枠)
  await p.click('[data-a="petool"][data-t="text"]');
  const bx = await p.locator("#pe .pel").first().boundingBox(), sc = bx.width / 595.44;
  await p.mouse.click(bx.x + 120 * sc, bx.y + 400 * sc - 0); await p.keyboard.type("FF什器裏");
  await p.screenshot({ path: "/tmp/rp/editor.png" });
  await p.click('[data-a="pesave"]'); await p.waitForFunction(() => !document.querySelector("#pe"), null, { timeout: 30000 });
  const o = await p.evaluate(async () => { const r = await (await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "list", col: "orders" }) })).json(); return r.docs.map((d) => d.data).find((x) => x.id === "pf1"); });
  const buf = await p.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), o.files[0].url);
  fs.writeFileSync("/tmp/rp/out.pdf", Buffer.from(buf));
  console.log("pdfform e2e OK", buf.length); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
