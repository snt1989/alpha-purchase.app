// 公開ページ版の確認: window.claude(db / sample / mcp / downloads)を模して動かす
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const out = process.argv[2] || ".";
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
 var dl={save:async function(o){window.__saved=o.filename}};
 window.claude={use:async function(n){return n==="db"?db:n==="sample"?sample:n==="mcp"?mcp:n==="downloads"?dl:null}};
})();
</script>`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.setContent("<!doctype html><html><head><meta charset=utf-8></head><body>" + MOCK + page + "</body></html>");
  await p.waitForFunction(() => document.querySelector(".sidefoot") && document.querySelector(".sidefoot").textContent.includes("クラウド"));
  console.log("chip:", await p.textContent("#modechip"));
  await p.click('.nv[data-t="import"]');
  await p.click('[data-a="sample"][data-i="0"]'); await p.click("#go");
await p.waitForSelector(".rc.ok"); console.log("paste:", (await p.textContent(".rc.ok b")));
  await p.click('[data-a="gmsearch"]'); await p.waitForSelector(".gml");
  await p.click('[data-a="gmimport"]');
  await p.waitForFunction(() => /登録 \d/.test(document.querySelector("#gmbox").textContent));
  console.log("gmail:", (await p.textContent("#gmbox .sub:last-of-type")));
  console.log("gm done pills:", await p.$$eval("#gmbox .pill", (x) => x.map((y) => y.textContent).join(",")));
  await p.screenshot({ path: out + "/a-import.png", fullPage: true });
  await p.click('.nv[data-t="list"]'); await p.waitForSelector("#lst table");
  console.log("rows:", await p.$$eval("#lst tbody tr", (t) => t.length));
  await p.click("#lst tbody tr:first-child"); await p.waitForSelector(".dlg");
  await p.click('[data-a="deljob"]'); console.log("arm:", await p.textContent('[data-a="deljob"]'));
  await p.click('[data-a="deljob"]'); await p.waitForTimeout(200);
  console.log("rows after delete:", await p.$$eval("#lst tbody tr", (t) => t.length));
  await p.click('[data-a="csv"]'); await p.waitForTimeout(100); console.log("csv saved:", await p.evaluate(() => window.__saved));
  console.log("docs:", await p.evaluate(() => Object.keys(window.__store).join(" ")));
  await p.emulateMedia({ colorScheme: "dark" }); await p.click('.nv[data-t="home"]');
  await p.screenshot({ path: out + "/a-home-dark.png" });
  console.log("ERRORS:", errs.length ? errs : "none");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
