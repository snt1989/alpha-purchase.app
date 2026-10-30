// claude.ai版: 「書類の確認」からPDFを追加 → ブラウザ内で読み取り、既存の案件に書類として付く(案件は増えない)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const nm = path.join(__dirname, "../node_modules/");
const page = fs.readFileSync(path.join(__dirname, "../dist-artifact.html"), "utf8");
const MOCK = `<script>(function(){
 var store={"orders/x1":{id:"x1",no:"AP-261031-001",kind:"work",status:1,reqNo:"2610-01991-2829",caseNo:"03193190",site:"ローソン横浜町道の駅前店",subject:"照明",customer:"株式会社アルファパーチェス",files:[],history:[],createdAt:"2026-10-30T00:00:00Z"}},subs=[];
 function snap(col){var docs=Object.keys(store).filter(function(k){return k.split("/")[0]===col}).map(function(k){var d=store[k];return {id:k.split("/")[1],exists:true,data:function(){return JSON.parse(JSON.stringify(d))}}});return {docs:docs}}
 function notify(col){subs.filter(function(s){return s.col===col}).forEach(function(s){s.cb(snap(col))})}
 var db={collection:function(col){return {onSnapshot:function(cb){subs.push({col:col,cb:cb});setTimeout(function(){cb(snap(col))},20);return function(){}}}},doc:function(p){return {set:async function(d){store[p]=JSON.parse(JSON.stringify(d));notify(p.split("/")[0])},delete:async function(){delete store[p];notify(p.split("/")[0])}}}};
 window.__store=store;
 var assets={upload:async function(b){return {id:"0123456789abcdef0123456789abcdef",url:"/_blob/x",sizeBytes:b.size,contentType:b.type}}};
 window.claude={use:async function(n){return n==="db"?db:n==="assets"?assets:null}};
})();</script>`;
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }), errs = [];
  await ctx.route(/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/, (r, q) => r.fulfill({ path: nm + "pdfjs-dist/build/" + q.url().split("/").pop(), contentType: "text/javascript" }));
  await ctx.route(/zip-full\.min\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: "window.zip={configure(){}}" }));
  await ctx.route(/pdf-lib\.min\.js$/, (r) => r.fulfill({ path: nm + "pdf-lib/dist/pdf-lib.min.js", contentType: "text/javascript" }));
  await ctx.route("https://app.test/", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><html><head><meta charset=utf-8></head><body>" + MOCK + page + "</body></html>" }));
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); 
  await p.goto("https://app.test/"); await p.waitForSelector(".sidefoot");
  await p.click('[data-a="tab"][data-t="docs"]'); await p.waitForSelector("#wpf", { state: "attached" });
  // 作業依頼書+作業完了報告書が合体したPDF
  const { PDFDocument } = require("pdf-lib");
  const o = await PDFDocument.load(fs.readFileSync(path.join(__dirname, "fixtures/order.pdf"))), r = await PDFDocument.load(fs.readFileSync(path.join(__dirname, "fixtures/report.pdf")));
  const m = await PDFDocument.create(); for (const s of [o, r]) (await m.copyPages(s, s.getPageIndices())).forEach((x) => m.addPage(x));
  const f = path.join(require("os").tmpdir(), "combined.pdf"); fs.writeFileSync(f, Buffer.from(await m.save()));
  await p.evaluate(() => { window.__t = []; new MutationObserver(() => { var d = document.getElementById("toast"); if (d) window.__t.push(d.textContent); }).observe(document.body, { childList: true, subtree: true, characterData: true }); });
  await p.waitForTimeout(4000); await p.setInputFiles("#wpf", f);
  await p.waitForFunction(() => (window.__store["orders/x1"].files || []).length >= 1, null, { timeout: 30000 });
  const files = await p.evaluate(() => window.__store["orders/x1"].files), n = await p.evaluate(() => Object.keys(window.__store).filter((k) => k.indexOf("orders/") === 0).length);
  if (n !== 1) throw new Error("orders=" + n);
  if (!files.some((x) => x.kind === "order" && x.asset)) throw new Error("no order doc " + JSON.stringify(files));
  if (errs.length) throw new Error(errs.join("|"));
  console.log("art docs e2e OK files=" + files.map((x) => x.kind).join(",")); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
