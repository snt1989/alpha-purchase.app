const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const nm = path.join(__dirname, "../node_modules/pdfjs-dist/build/");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  await p.route(/cdnjs\.cloudflare\.com.*pdf\.min\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(nm + "pdf.min.js") }));
  await p.route(/cdnjs\.cloudflare\.com.*pdf\.worker\.min\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(nm + "pdf.worker.min.js") }));
  await p.route(/jsdelivr.*zip-full/, (r) => r.fulfill({ contentType: "text/javascript", body: "window.zip={configure(){}}" }));
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  for (const n of ["order.pdf", "report.pdf"]) {
    const b64 = fs.readFileSync(path.join(__dirname, "fixtures", n)).toString("base64");
    const j = await p.evaluate(async ([n, b64]) => (await fetch("/api/workpdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ create: true, name: n, b64 }) })).json(), [n, b64]);
    console.log(n, j.results[0].state);
  }
  await p.reload(); await p.waitForSelector(".pghead");
  await p.click('[data-a="tab"][data-t="list"]'); await p.waitForSelector('[data-a="open"]');
  await p.click('[data-a="open"]');
  await p.click('[data-a="dtab"][data-p="docs"]'); await p.waitForSelector("#docs");
  await p.waitForFunction(() => document.querySelectorAll("#docs .dbody img").length >= 2, null, { timeout: 30000 });
  const n = await p.locator("#docs .dbody img").count(); if (n < 2) throw new Error("images " + n);
  await p.locator("#docs").scrollIntoViewIfNeeded();
  await p.screenshot({ path: process.argv[2] || "/tmp/docs.png" });
  await p.click("#docs .dbody img >> nth=0"); await p.waitForSelector("#pvw");
  console.log("docs e2e OK images=" + n); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
