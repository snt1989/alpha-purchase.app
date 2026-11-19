// 画面で編集したPDF(文字の追加・白塗り済み)を保存する(ログインが必要)
// POST { jobId, name, b64 } → { ok, id, url }
const { authed, body, pipeline } = require("./_lib");

const MAX_B64 = 4200000; // Vercel の本文上限(約4.5MB)の内側
const ID_RE = /^[A-Za-z0-9_\-]{1,100}$/;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const b = body(req);
  try {
    const jobId = String(b.jobId || "");
    const b64 = String(b.b64 || "").replace(/^data:[^,]*,/, "");
    if (!ID_RE.test(jobId) || !b64) return res.status(400).json({ error: "bad request" });
    if (b64.length > MAX_B64) return res.status(413).json({ error: "編集後のPDFが大きすぎます(4MB以内)" });
    if (Buffer.from(b64.slice(0, 8), "base64").toString("latin1").slice(0, 4) !== "%PDF") return res.status(400).json({ error: "PDFではありません" });
    const id = jobId + "-e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const name = String(b.name || "編集済.pdf").slice(0, 120);
    await pipeline([
      ["SET", "ap:file:" + id, b64],
      ["HSET", "ap:fmeta", id, JSON.stringify({ id, name, mime: "application/pdf", job: jobId, edited: true, at: new Date().toISOString() })],
    ]);
    res.json({ ok: true, id, url: "/api/file?id=" + encodeURIComponent(id) });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
};
