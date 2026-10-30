// 保存した作業依頼書PDFを開く(ログインが必要)
const { authed, pipeline } = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!authed(req)) { res.statusCode = 401; return res.end("ログインが必要です"); }
  const id = String((req.query && req.query.id) || "");
  if (!/^[A-Za-z0-9_\-]{1,100}$/.test(id)) { res.statusCode = 400; return res.end("bad id"); }
  try {
    const r = await pipeline([["GET", "ap:file:" + id], ["HGET", "ap:fmeta", id]]);
    if (!r[0]) { res.statusCode = 404; return res.end("見つかりません"); }
    let meta = {}; try { meta = JSON.parse(r[1] || "{}"); } catch (e) {}
    const buf = Buffer.from(r[0], "base64");
    res.setHeader("Content-Type", meta.mime || "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(meta.name || "file.pdf"));
    res.statusCode = 200; res.end(buf);
  } catch (e) { res.statusCode = 500; res.end(String(e.message || e).slice(0, 200)); }
};
