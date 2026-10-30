// メール本文のダウンロードリンク(kintone)から PDF を取る処理の確認(通信は偽物に差し替え)
const assert = require("assert");
const { fetchLinkedPdfs } = require("../api/_link");
const pdf = new TextEncoder().encode("%PDF-1.4\n%fake\n");
const resp = (body, ct, url) => ({ status: 200, url, headers: { get: (k) => (k.toLowerCase() === "content-type" ? ct : "") }, arrayBuffer: async () => (typeof body === "string" ? new TextEncoder().encode(body) : body).buffer.slice(0) });
const body = "下記よりダウンロード\n「作業依頼書2610-02161-3067.pdf」をダウンロード\nhttps://mailer.kintoneapp.com/attachment/aaa/1/address/1/x/confirm\n";
(async () => {
  // 1) 確認ページ(HTML)→ ダウンロードのリンク → PDF
  let calls = [];
  globalThis.fetch = async (u) => { calls.push(u); return /download/.test(u) ? resp(pdf, "application/pdf", u) : resp('<html><a href="/attachment/aaa/1/address/1/x/download?t=1">ダウンロード</a></html>', "text/html", u) };
  let r = await fetchLinkedPdfs(body);
  assert.strictEqual(r.files.length, 1); assert.strictEqual(r.files[0].name, "作業依頼書2610-02161-3067.pdf");
  // 2) 確認ページ → フォーム送信(POST) → PDF
  globalThis.fetch = async (u, o) => (o && o.method === "POST" ? resp(pdf, "application/pdf", u) : resp('<form action="/go" method="post"><input type="hidden" name="k" value="v"></form>', "text/html", u));
  r = await fetchLinkedPdfs(body); assert.strictEqual(r.files.length, 1);
  // 2b) 確認ページ → /auth/<メール> → /download/<メール> → PDF(メールアドレスで本人確認)
  calls = [];
  globalThis.fetch = async (u) => { calls.push(u); return /\/download\/info%40sanoh-ltd\.jp$/.test(u) ? resp(pdf, "application/pdf", u) : resp("<html>確認</html>", "text/html", u) };
  r = await fetchLinkedPdfs(body, false, ["info@sanoh-ltd.jp"]);
  assert.strictEqual(r.files.length, 1); assert.ok(calls.some((c) => /\/auth\/info%40sanoh-ltd\.jp$/.test(c)));
  // 3) リンクがそのままPDF
  globalThis.fetch = async (u) => resp(pdf, "application/pdf", u);
  r = await fetchLinkedPdfs(body); assert.strictEqual(r.files.length, 1);
  // 4) 取れないときは空+理由
  globalThis.fetch = async (u) => resp("<html>ログインしてください</html>", "text/html", u);
  r = await fetchLinkedPdfs(body); assert.strictEqual(r.files.length, 0); assert.ok(r.diag[0].steps.length >= 1 && r.diag[0].head);
  // 5) リンクが無いメールでは通信しない
  globalThis.fetch = async () => { throw new Error("呼ばれないはず") };
  r = await fetchLinkedPdfs("普通のメール"); assert.strictEqual(r.tried, 0);
  console.log("link tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
