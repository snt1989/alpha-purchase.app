const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto("http://localhost:3123/"); await p.waitForSelector(".login"); await p.fill("#lpw", "test1234"); await p.click(".login button"); await p.waitForSelector(".pghead");
  await p.evaluate(async () => {
    const set = (id, data) => fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set", col: "orders", id, data }) });
    await set("m1", { id: "m1", no: "AP-261103-001", kind: "work", status: 1, caseNo: "03193190", reqNo: "", subject: "メール由来", site: "", files: [], createdAt: "2026-11-03T01:00:00Z" });
    await set("m2", { id: "m2", no: "AP-261103-002", kind: "work", status: 1, caseNo: "03193190", reqNo: "2610-02011-2851", site: "ローソン横浜町道の駅前店", files: [{ name: "a.pdf", url: "/api/file?id=m2-1", label: "作業依頼書", kind: "order" }], createdAt: "2026-11-03T02:00:00Z" });
    await set("m3", { id: "m3", no: "AP-261103-003", kind: "work", status: 0, caseNo: "", reqNo: "", subject: "RE: ローソン横浜町道の駅前店 03193190 照明", files: [], createdAt: "2026-11-03T03:00:00Z" });
    await set("m4", { id: "m4", no: "AP-261103-004", kind: "work", status: 0, caseNo: "0319 3190", reqNo: "", subject: "別メール", files: [], createdAt: "2026-11-03T04:00:00Z" });
  });
  await p.reload(); await p.waitForSelector(".pghead"); await p.waitForTimeout(1500);
  const o = await p.evaluate(async () => { const r = await (await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "list", col: "orders" }) })).json(); return (r.docs || []).map((d) => d.data).filter((x) => ["m1","m2","m3","m4"].indexOf(x.id) >= 0); });
  if (o.length !== 1) throw new Error("not merged: " + JSON.stringify(o.map((x) => x.no)));
  if (!o[0].files.length || o[0].subject !== "メール由来" || o[0].reqNo !== "2610-02011-2851") throw new Error("merge content " + JSON.stringify(o[0]));
  console.log("merge e2e OK", o[0].no); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
