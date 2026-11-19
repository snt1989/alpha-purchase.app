const { chromium } = require("playwright"); const { PDFDocument } = require("pdf-lib");
(async () => {
  const pd = await PDFDocument.create(); pd.addPage([595, 842]).drawText("ORIGINAL", { x: 50, y: 700, size: 20 });
  const b64 = Buffer.from(await pd.save()).toString("base64");
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const nm = __dirname + "/../node_modules/";
  await p.route(/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/, (r, q) => r.fulfill({ path: nm + "pdfjs-dist/build/" + q.url().split("/").pop(), contentType: "text/javascript" }));
  await p.route(/pdf-lib\.min\.js$/, (r) => r.fulfill({ path: nm + "pdf-lib/dist/pdf-lib.min.js", contentType: "text/javascript" }));
  await p.route(/zip-full\.min\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: "window.zip={configure(){}}" }));
  p.on("pageerror", (e) => { throw e; }); p.on("dialog", (d) => d.accept());
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  await p.evaluate(async (b64) => {
    const J = (path, data) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json());
    const up = await J("/api/pdfedit", { jobId: "pe1", name: "報告書.pdf", b64 });
    await J("/api/db", { op: "set", col: "orders", id: "pe1", data: { id: "pe1", no: "AP-261119-092", kind: "work", status: 4, site: "ローソン花巻不動店", subject: "照明修理", reqNo: "2610-09999-0002", caseNo: "09999998", files: [{ name: "作業完了報告書.pdf", url: up.url, label: "作業完了報告書", kind: "report" }], photos: [], createdAt: "2026-11-19T01:00:00Z" } });
  }, b64);
  await p.reload(); await p.waitForSelector(".pghead");
  await p.locator('button[data-t="list"]:visible').first().click(); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]');
  await p.waitForSelector(".dlg"); await p.click('[data-a="dtab"][data-p="docs"]');
  await p.click('[data-a="pdfedit"]'); await p.waitForSelector("#pe .pel", { timeout: 20000 });
  // 文字を書き込む
  const box = await p.locator("#pe .pel").first().boundingBox();
  await p.mouse.click(box.x + 100, box.y + 250); await p.keyboard.type("追記テスト");
  // 白塗り
  await p.click('[data-a="petool"][data-t="mask"]'); const b2 = await p.locator("#pe .pel").first().boundingBox();
  await p.mouse.move(b2.x + 60, b2.y + 100); await p.mouse.down(); await p.mouse.move(b2.x + 200, b2.y + 140, { steps: 5 }); await p.mouse.up();
  if (await p.locator("#pe .pem").count() !== 1) throw new Error("mask not created");
  if (await p.locator("#pe .pet").count() !== 1) throw new Error("text not kept");
  await p.click('[data-a="pesave"]'); await p.waitForFunction(() => !document.querySelector("#pe"), null, { timeout: 20000 });
  const o = await p.evaluate(async () => { const r = await (await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "list", col: "orders" }) })).json(); return r.docs.map((d) => d.data).find((x) => x.id === "pe1"); });
  const f = o.files[0]; if (!f.edited || !f.orig || f.url === f.orig.url) throw new Error("not replaced " + JSON.stringify(f));
  const len = await p.evaluate(async (u) => (await (await fetch(u)).arrayBuffer()).byteLength, f.url);
  if (len < 1000) throw new Error("small pdf " + len);
  await p.click('[data-a="dtab"][data-p="docs"]').catch(() => {});
  await p.click('[data-a="pdfrestore"]'); await p.waitForTimeout(800);
  const o2 = await p.evaluate(async () => { const r = await (await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "list", col: "orders" }) })).json(); return r.docs.map((d) => d.data).find((x) => x.id === "pe1"); });
  if (o2.files[0].edited || o2.files[0].orig || o2.files[0].url !== f.orig.url) throw new Error("restore " + JSON.stringify(o2.files[0]));
  console.log("pdfedit e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
