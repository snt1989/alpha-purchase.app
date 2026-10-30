// 作業依頼書(ZIP/PDF)取込の通し確認。CDNのライブラリは手元の node_modules で代用する
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const SP = process.argv[2], LIBS = process.argv[3];
const page = fs.readFileSync(path.join(__dirname, "../dist-artifact.html"), "utf8");
const MOCK = `
<script>
(function(){
 var store={},subs=[];
 function notify(col){subs.filter(function(s){return s.col===col}).forEach(function(s){s.cb(snap(col))})}
 function snap(col){var docs=Object.keys(store).filter(function(k){return k.split("/")[0]===col}).map(function(k){var d=store[k];return {id:k.split("/")[1],exists:true,data:function(){return JSON.parse(JSON.stringify(d))}}});return {docs:docs,size:docs.length,empty:!docs.length}}
 var db={collection:function(col){return {onSnapshot:function(cb){var s={col:col,cb:cb};subs.push(s);setTimeout(function(){cb(snap(col))},20);return function(){}}}},
  doc:function(p){return {set:async function(d){store[p]=JSON.parse(JSON.stringify(d));notify(p.split("/")[0])},delete:async function(){delete store[p];notify(p.split("/")[0])}}}};
 window.__store=store;
 var sample=async function(){return {text:""}};
 sample.json=async function(prompt){window.__prompts=(window.__prompts||0)+1;
   if(prompt.indexOf("配信停止")>=0)return {isOrder:false,orders:[],uncertain:[]};
   return {isOrder:true,confidence:0.92,orders:[{customer:"株式会社テスト工業",contact:"試験 太郎",items:[{name:"六角ボルト M8",spec:"SUS",qty:1000,unit:"本",price:12}],deliveryDate:"2026-11-20",deliveryTo:"本社工場",urgent:false}],uncertain:[]}};
 var mcp={callTool:async function(server,tool,input){
   if(tool==="search_threads")return {payload:{threads:[{id:"t1",messages:[{id:"gm001",sender:"buyer@example.jp",subject:"【発注】ボルト手配",snippet:"下記の通り発注します"}]},{id:"t2",messages:[{id:"gm002",sender:"news@example.com",subject:"【メルマガ】お知らせ"}]}]}};
   if(tool==="get_message")return {payload:{id:input.messageId,sender:input.messageId==="gm001"?"試験 太郎 <buyer@example.jp>":"news@example.com",subject:input.messageId==="gm001"?"【発注】ボルト手配":"【メルマガ】お知らせ",date:"2026-10-30T01:00:00Z",plaintextBody:input.messageId==="gm001"?"品名: 六角ボルト M8\\n数量: 1000本":"メルマガ 配信停止"}};
 }};
 var dl={save:async function(o){window.__saved=o.filename}};var assets={upload:async function(b){window.__up=(window.__up||0)+1;return {id:"0123456789abcdef0123456789abcdef",url:"/_blob/x",sizeBytes:b.size,contentType:b.type}}};
 window.claude={use:async function(n){return n==="db"?db:n==="sample"?sample:n==="mcp"?mcp:n==="downloads"?dl:n==="assets"?assets:null}};
})();
</script>`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/, (r, q) => r.fulfill({ path: path.join(LIBS, "node_modules/pdfjs-dist/build", q.url().split("/").pop()), contentType: "text/javascript" }));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@zip\.js\/zip\.js@2\.7\.62\/dist\/zip-full\.min\.js$/, (r) => r.fulfill({ path: path.join(LIBS, "node_modules/@zip.js/zip.js/dist/zip-full.min.js"), contentType: "text/javascript" }));
  await ctx.route("https://app.test/", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><html><head><meta charset=utf-8></head><body>" + MOCK + page + "</body></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("https://app.test/");
  await p.waitForFunction(() => document.querySelector(".sidefoot") && document.querySelector(".sidefoot").textContent.includes("クラウド"));
  await p.click('.nv[data-t="import"]');
  // 1) パスワード付きZIPをパスワードなしで → エラー
  await p.setInputFiles("#fzi", path.join(SP, "zips/locked.zip"));
  await p.waitForFunction(() => /パスワード/.test(document.querySelector("#fres").textContent) && !/読み込み中|読み取り中/.test(document.querySelector("#fres").textContent), null, { timeout: 60000 });
  console.log("locked:", (await p.textContent("#fres")).slice(0, 80));
  // 2) パスワードを入れて → 登録
  await p.fill("#zpw", "himitsu123");
  await p.setInputFiles("#fzi", path.join(SP, "zips/locked.zip"));
  await p.waitForSelector("#fres .rc.ok", { timeout: 60000 });
  console.log("registered:", (await p.textContent("#fres .rc.ok")).replace(/\s+/g, " ").slice(0, 200));
  await p.screenshot({ path: SP + "/shots/w-import.png", fullPage: true });
  // 3) 同じ依頼を普通のZIPで → 重複
  await p.setInputFiles("#fzi", path.join(SP, "zips/plain.zip"));
  await p.waitForFunction(() => /登録済みの作業依頼/.test(document.querySelector("#fres").textContent), null, { timeout: 60000 });
  console.log("dup: ok");
  // 4) 案件を開く
  await p.click('.nv[data-t="list"]'); await p.waitForSelector("#lst table");
  console.log("row:", (await p.textContent("#lst tbody tr")).replace(/\s+/g, " "));
  await p.click("#lst tbody tr:first-child"); await p.waitForSelector(".dlg");
  console.log("dlg:", await p.inputValue("#f-site"), "|", await p.inputValue("#f-reqno"), "|", await p.inputValue("#f-caseno"), "|", await p.inputValue("#f-scode"), "|", (await p.inputValue("#f-detail")).slice(0, 20));
  console.log("pdf link:", await p.getAttribute(".dlg a.btn", "href"));
  await p.screenshot({ path: SP + "/shots/w-dialog.png", fullPage: true });
  console.log("uploads:", await p.evaluate(() => window.__up), "ERRORS:", errs.length ? errs : "none");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
