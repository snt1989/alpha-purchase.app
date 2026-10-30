// 画面から作業依頼書(PDF・ZIP)を読み込む。メール本文だけで先に登録された案件(PDF待ち)があれば、そこへ内容を反映する
const { authed, body } = require("./_lib");
const { processAttachments } = require("./_work");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const b = body(req);
  const name = String(b.name || "").slice(0, 200);
  if (!/\.(pdf|zip)$/i.test(name) || typeof b.b64 !== "string" || b.b64.length < 100) return res.status(400).json({ ok: false, error: "PDFかZIPを選んでください" });
  try {
    const data = new Uint8Array(Buffer.from(b.b64, "base64"));
    const pw = String(b.password || "").slice(0, 100);
    const results = await processAttachments([{ name, data }], pw ? [{ subject: "入力されたパスワード", body: "パスワード: " + pw }] : [], { source: "pdf", attachOnly: b.create !== true });
    res.json({ ok: true, results: results.map((r) => ({ file: r.file, state: r.state, no: r.no, reqNo: r.reqNo, error: r.error, code: r.code })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
};
