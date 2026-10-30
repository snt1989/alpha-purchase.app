// メール本文にある「作業依頼書のダウンロードリンク」(kintone メール配信など)から PDF を取得する。
// リンクが直接PDFのときだけ取得する。確認ページやログインが要るリンクは自動では開かず、理由(diag)だけ返す。
const MAX = 15 * 1048576;
const UA = "Mozilla/5.0 (compatible; AlphaOrderNavi/1.0)";
const isPdf = (u8) => u8 && u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;

async function get(url, opt) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, Object.assign({ redirect: "follow", signal: ac.signal, headers: Object.assign({ "User-Agent": UA, Accept: "application/pdf,text/html,*/*" }, (opt && opt.headers) || {}) }, opt || {}));
    const buf = new Uint8Array(await r.arrayBuffer());
    const sc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") : "";
    return { cookie: sc, status: r.status, ct: String(r.headers.get("content-type") || ""), url: r.url || url, data: buf.length > MAX ? null : buf, big: buf.length > MAX, cd: String(r.headers.get("content-disposition") || "") };
  } finally { clearTimeout(t); }
}
async function fetchLinkedPdfs(body) {
  const urls = []; const seen = {};
  (String(body || "").match(/https:\/\/mailer\.kintoneapp\.com\/[^\s"'<>)）」]+/g) || []).forEach((u) => { if (!seen[u]) { seen[u] = 1; urls.push(u) } });
  const names = []; String(body || "").replace(/「([^」\n]+\.pdf)」/gi, (_, n) => { names.push(n) });
  const files = [], diag = [];
  for (let k = 0; k < urls.length && k < 3; k++) {
    const u = urls[k], d = { url: u.slice(0, 120) + (u.length > 120 ? "…" : ""), steps: [] };
    diag.push(d);
    try {
      const tryUrl = async (url, opt, label) => {
        const r = await get(url, opt);
        d.steps.push({ label, status: r.status, ct: r.ct.slice(0, 40), pdf: isPdf(r.data), big: r.big });
        return r;
      };
      let r = await tryUrl(u, null, "open"), got = null;
      if (isPdf(r.data)) got = r;
      else if (r.data && /html|text/i.test(r.ct)) d.head = new TextDecoder("utf-8").decode(r.data).replace(/\s+/g, " ").slice(0, 200); // ログインや確認が要るページは自動では開かない
      if (got) { files.push({ name: names[k] || names[0] || "作業依頼書.pdf", data: got.data }); d.ok = true }
    } catch (e) { d.error = String(e.message || e).slice(0, 120) }
  }
  return { files, diag, tried: urls.length };
}
module.exports = { fetchLinkedPdfs };
