// 写真から作業報告の文章を作る(Claude API。ANTHROPIC_API_KEY が必要)
// POST { job:{site,subject,detail,workDate}, photos:[{id}] } → { ok, summary, photos:[{id,tag,caption}] }
const AP = require("../parse.js");
const { authed, body, pipeline } = require("./_lib");

const ID_RE = /^[A-Za-z0-9_\-]{1,100}$/;
const TAGS = ["作業前", "作業中", "作業後", "その他"];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "AIが設定されていません(Vercelの環境変数 ANTHROPIC_API_KEY)" });
  const b = body(req), job = b.job || {};
  const ids = (Array.isArray(b.photos) ? b.photos : []).map((p) => String((p && p.id) || "")).filter((x) => ID_RE.test(x)).slice(0, 12);
  if (!ids.length) return res.status(400).json({ error: "写真がありません" });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 55000);
  try {
    const imgs = await pipeline(ids.map((id) => ["GET", "ap:file:" + id]));
    const content = [];
    ids.forEach((id, i) => {
      if (!imgs[i]) return;
      content.push({ type: "text", text: "写真" + (i + 1) + "(id=" + id + ")" });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgs[i] } });
    });
    const s = (v) => String(v || "").slice(0, 400);
    content.push({ type: "text", text:
      "上の写真は、設備の修繕・点検など現場作業の記録です。作業完了報告書に載せる内容を作ってください。\n" +
      "物件: " + s(job.site) + "\n作業名称: " + s(job.subject) + "\n作業内容(依頼書): " + s(job.detail) + "\n作業日: " + s(job.workDate) + "\n\n" +
      "ルール: 写真から読み取れることだけを書く。見えないこと・推測は書かない。です・ます調。各コメントは40字以内。\n" +
      "次のJSONだけを返す: {\"summary\":\"作業内容のまとめ(3〜5文)\",\"photos\":[{\"id\":\"写真のid\",\"tag\":\"作業前|作業中|作業後|その他\",\"caption\":\"写真の説明\"}]}" });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 2500,
        system: "あなたは現場作業の報告書を作る担当です。指定されたJSON形式の出力だけを返してください。", messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("AI " + r.status + " " + String((j.error && j.error.message) || "").slice(0, 120));
    const out = AP.pickJson((j.content || []).filter((x) => x.type === "text").map((x) => x.text).join(""));
    if (!out) throw new Error("AIの返答を読み取れませんでした");
    res.json({
      ok: true, summary: String(out.summary || "").slice(0, 1500),
      photos: (Array.isArray(out.photos) ? out.photos : []).filter((p) => p && ids.indexOf(p.id) >= 0)
        .map((p) => ({ id: p.id, tag: TAGS.indexOf(p.tag) >= 0 ? p.tag : "その他", caption: String(p.caption || "").slice(0, 80) })),
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
  finally { clearTimeout(timer); }
};
