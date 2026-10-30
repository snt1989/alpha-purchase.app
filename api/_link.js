// メール本文にある「作業依頼書のダウンロードリンク」(kintone メール配信など)から PDF を取得する。
// ページの作りが変わっても動くよう、PDFならそのまま、HTMLなら中のリンク・フォームをたどる。取得できなかった理由(diag)も返す。
const MAX = 15 * 1048576;
const UA = "Mozilla/5.0 (compatible; AlphaOrderNavi/1.0)";
const isPdf = (u8) => u8 && u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;

async function get(url, opt) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, Object.assign({ redirect: "follow", signal: ac.signal, headers: Object.assign({ "User-Agent": UA, Accept: "application/pdf,text/html,*/*" }, (opt && opt.headers) || {}) }, opt || {}));
    const buf = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, ct: String(r.headers.get("content-type") || ""), url: r.url || url, data: buf.length > MAX ? null : buf, big: buf.length > MAX, cd: String(r.headers.get("content-disposition") || "") };
  } finally { clearTimeout(t); }
}
const abs = (h, base) => { try { return new URL(h.replace(/&amp;/g, "&"), base).href } catch (e) { return "" } };

function candidates(html, base) {
  const out = [];
  const add = (u) => { if (u && /^https?:/.test(u) && out.indexOf(u) < 0 && u !== base) out.push(u) };
  let m; const re = /href\s*=\s*["']([^"']+)["']/gi;
  const links = []; while ((m = re.exec(html))) links.push(abs(m[1], base));
  links.filter((u) => /download|\.pdf(\?|$)|attachment|file/i.test(u)).forEach(add);
  add(base.replace(/\/confirm\/?(\?.*)?$/, "/download"));
  add(base.replace(/\/confirm\/?(\?.*)?$/, ""));
  return out.slice(0, 6);
}
function forms(html, base) {
  const out = []; let m; const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  while ((m = re.exec(html)) && out.length < 3) {
    const a = m[1], inner = m[2];
    const act = (a.match(/action\s*=\s*["']([^"']*)["']/i) || [])[1];
    const method = ((a.match(/method\s*=\s*["']([^"']*)["']/i) || [])[1] || "get").toLowerCase();
    const p = new URLSearchParams(); let i; const ri = /<input\b([^>]*)>/gi;
    while ((i = ri.exec(inner))) { const n = (i[1].match(/name\s*=\s*["']([^"']*)["']/i) || [])[1]; const v = (i[1].match(/value\s*=\s*["']([^"']*)["']/i) || [])[1]; if (n) p.append(n, (v || "").replace(/&amp;/g, "&")) }
    out.push({ url: abs(act || base, base), method, params: p });
  }
  return out;
}

async function fetchLinkedPdfs(body, debug) {
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
      else if (r.data && /html|text/i.test(r.ct)) {
        const html = new TextDecoder("utf-8").decode(r.data);
        d.head = html.replace(/\s+/g, " ").slice(0, 300);
        if (debug) d.html = html.slice(0, 60000);
        for (const c of candidates(html, r.url)) { const x = await tryUrl(c, null, "link"); if (isPdf(x.data)) { got = x; break } }
        if (!got) for (const f of forms(html, r.url)) {
          const x = f.method === "post" ? await tryUrl(f.url, { method: "POST", body: f.params, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, "form") : await tryUrl(f.url + (f.params.toString() ? (f.url.indexOf("?") < 0 ? "?" : "&") + f.params : ""), null, "form");
          if (isPdf(x.data)) { got = x; break }
        }
      }
      if (got) { files.push({ name: names[k] || names[0] || "作業依頼書.pdf", data: got.data }); d.ok = true }
    } catch (e) { d.error = String(e.message || e).slice(0, 120) }
  }
  return { files, diag, tried: urls.length };
}
module.exports = { fetchLinkedPdfs };
