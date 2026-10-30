// 案件の写真の保存・削除(ログインが必要)。写真は画面側で縮小したJPEGを base64 で受け取り Redis に保存する。
// POST { op:"put", jobId, name, b64 } → { ok, id, url }   /   POST { op:"del", id } → { ok }
const { authed, body, pipeline } = require("./_lib");

const MAX_B64 = 900000; // 1枚あたりの上限(base64で約650KB)
const ID_RE = /^[A-Za-z0-9_\-]{1,100}$/;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const b = body(req);
  try {
    if (b.op === "put") {
      const jobId = String(b.jobId || "");
      const b64 = String(b.b64 || "").replace(/^data:[^,]*,/, "");
      if (!ID_RE.test(jobId) || !b64) return res.status(400).json({ error: "bad request" });
      if (b64.length > MAX_B64) return res.status(413).json({ error: "写真が大きすぎます(縮小してから送ってください)" });
      if (Buffer.from(b64.slice(0, 16), "base64")[0] !== 0xff) return res.status(400).json({ error: "JPEG以外は保存できません" });
      const id = jobId + "-p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const name = String(b.name || "photo.jpg").slice(0, 100);
      await pipeline([
        ["SET", "ap:file:" + id, b64],
        ["HSET", "ap:fmeta", id, JSON.stringify({ id, name, mime: "image/jpeg", job: jobId, at: new Date().toISOString() })],
      ]);
      return res.json({ ok: true, id, url: "/api/file?id=" + encodeURIComponent(id) });
    }
    if (b.op === "del") {
      const id = String(b.id || "");
      if (!ID_RE.test(id)) return res.status(400).json({ error: "bad id" });
      await pipeline([["DEL", "ap:file:" + id], ["HDEL", "ap:fmeta", id]]);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: "bad op" });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
};
