// メール本文のダウンロードリンクから PDF を取る処理の確認(通信は偽物に差し替え)
const assert = require("assert");
const { fetchLinkedPdfs } = require("../api/_link");
const pdf = new TextEncoder().encode("%PDF-1.4\n%fake\n");
const resp = (body, ct, url) => ({ status: 200, url, headers: { get: (k) => (k.toLowerCase() === "content-type" ? ct : "") }, arrayBuffer: async () => (typeof body === "string" ? new TextEncoder().encode(body) : body).buffer.slice(0) });
const body = "「作業依頼書2610-02161-3067.pdf」\nhttps://mailer.kintoneapp.com/attachment/aaa/1/address/1/x/confirm\n";
(async () => {
  globalThis.fetch = async (u) => resp(pdf, "application/pdf", u);
  let r = await fetchLinkedPdfs(body); assert.strictEqual(r.files.length, 1); assert.strictEqual(r.files[0].name, "作業依頼書2610-02161-3067.pdf");
  let n = 0; globalThis.fetch = async (u) => { n++; return resp("<html>確認ページ</html>", "text/html", u) };
  r = await fetchLinkedPdfs(body); assert.strictEqual(r.files.length, 0); assert.strictEqual(n, 1); assert.ok(r.diag[0].head);
  globalThis.fetch = async () => { throw new Error("呼ばれないはず") };
  r = await fetchLinkedPdfs("普通のメール"); assert.strictEqual(r.tried, 0);
  console.log("link tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
