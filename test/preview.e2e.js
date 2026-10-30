// 添付・写真のプレビュー(Playwright)。dev/server.js 起動後: node test/preview.e2e.js <ZIP(パスワード付き作業依頼書)> <パスワード> <写真>
const { chromium } = require("playwright");
const assert = require("assert"), fs = require("fs");
const [zip, pw, img] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 860 } }), errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const b64 = fs.readFileSync(zip).toString("base64");
  const r = await p.evaluate(async ([b64, pw]) => (await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234" },
    body: JSON.stringify({ messageId: "pv1", from: "a <a@example.invalid>", subject: "作業依頼(確認用)", body: "添付", attachments: [{ name: "x.zip", b64 }], pwTexts: [{ subject: "pw", body: "パスワード：" + pw }] }) })).json(), [b64, pw]);
  assert.strictEqual(r.results[0].state, "registered");
  await p.reload(); await p.waitForSelector(".pghead"); await p.click('.nv[data-t="list"]'); await p.waitForSelector('[data-a="open"]'); await p.click('[data-a="open"]');
  await p.waitForSelector('[data-a="pvopen"][data-k="f"]');
  await p.setInputFiles("#phi", [img]); await p.waitForSelector("#ph .phc");
  await p.click('[data-a="pvopen"][data-k="f"]'); await p.waitForSelector("#pvw iframe");
  const src = await p.getAttribute("#pvw iframe", "src");
  const head = await p.evaluate(async (u) => { const x = await fetch(u); return [x.status, x.headers.get("content-type")]; }, src);
  console.log("PDF preview:", src.slice(0, 30), JSON.stringify(head)); assert.deepStrictEqual(head, [200, "application/pdf"]);
  assert.ok((await p.textContent("#pvw .pb")).includes("1 / 2"));
  await p.click('[data-a="pvnext"]'); await p.waitForSelector("#pvw img"); assert.ok((await p.textContent("#pvw .pb")).includes("2 / 2"));
  await p.screenshot({ path: "preview.png" });
  await p.keyboard.press("Escape"); assert.strictEqual(await p.locator("#pvw").count(), 0); assert.strictEqual(await p.locator(".dlg").count(), 1);
  await p.click('#ph img[data-a="phview"]'); await p.waitForSelector("#pvw img"); await p.click('[data-a="pvclose"]');
  assert.deepStrictEqual(errs, []); await b.close(); console.log("preview e2e OK");
})().catch((e) => { console.error(e); process.exit(1); });
