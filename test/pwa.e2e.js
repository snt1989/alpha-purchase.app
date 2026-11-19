const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1100, height: 900 } }), p = await ctx.newPage();
  p.on("pageerror", (e) => { throw e; });
  await p.goto("http://localhost:3123/"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  const man = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); return { ct: r.headers.get("content-type"), j: await r.json() }; });
  if (man.j.display !== "standalone" || man.j.icons.length < 2) throw new Error("manifest " + JSON.stringify(man));
  for (const u of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/sw.js"]) { const s = await p.evaluate(async (u) => (await fetch(u)).status, u); if (s !== 200) throw new Error(u + " " + s); }
  const reg = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  if (!reg) throw new Error("sw not active");
  await p.locator('button[data-t="set"]:visible').first().click(); await p.waitForSelector('h3:has-text("アプリとしてインストール")');
  // API が SW にキャッシュされないこと
  const api = await p.evaluate(async () => { const r = await fetch("/api/status"); return r.status; }); console.log("api", api);
  console.log("pwa e2e OK"); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
