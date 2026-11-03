const http = require("http");
const post = (b) => new Promise((res, rej) => { const d = JSON.stringify(b); const r = http.request({ host: "localhost", port: 3123, path: "/api/inbound", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-inbound-token-1234", "Content-Length": Buffer.byteLength(d) } }, (s) => { let t = ""; s.on("data", (c) => t += c); s.on("end", () => res(JSON.parse(t))); }); r.on("error", rej); r.end(d); });
(async () => {
  const body = "見積依頼です。\n作業依頼番号 / 顧客案件番号 2610-02011-2851 / 03193190\n店舗名 ローソン横浜町道の駅前店\n照明の修理をお願いします。ご連絡ください。数量1 納期11/10";
  const a = await post({ messageId: "aa11bb22cc33", from: "x@alphapurchase.co.jp", subject: "ローソン横浜町道の駅前店 03193190 照明修理のお願い", body });
  const b = await post({ messageId: "dd44ee55ff66", from: "x@alphapurchase.co.jp", subject: "RE: ローソン横浜町道の駅前店 03193190 照明修理のお願い", body });
  console.log(a.state, b.state);
  if (a.state !== "registered") throw new Error("first not registered " + JSON.stringify(a));
  if (b.state !== "linked") throw new Error("second not linked " + JSON.stringify(b));
  console.log("dupin e2e OK");
})().catch((e) => { console.error(e); process.exit(1); });
