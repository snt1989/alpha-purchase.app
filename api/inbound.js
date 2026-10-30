// メールの自動取込の受信口。Gmail の Google Apps Script(設定画面にコピー用のコードあり)などから
// POST { messageId, from, subject, date, body } を、Authorization: Bearer <INBOUND_TOKEN> 付きで受け取る
const { safeEq, body } = require("./_lib");
const { ingest } = require("./_ingest");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const tok = process.env.INBOUND_TOKEN;
  if (!tok || tok.length < 16) return res.status(503).json({ ok: false, error: "INBOUND_TOKEN が未設定です(16文字以上)" });
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!given || !safeEq(given, tok)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const b = body(req);
  if (!b.body || String(b.body).trim().length < 5) return res.status(400).json({ ok: false, error: "body が空です" });
  const mail = { from: String(b.from || ""), subject: String(b.subject || ""), date: String(b.date || ""), messageId: String(b.messageId || ""), body: String(b.body) };
  try {
    const r = await ingest(mail, { source: "gmail" });
    res.json({ ok: true, state: r.state, nos: (r.jobs || []).map((j) => j.no) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 200) }); // 500 なら送信側は「未処理」のままにして、次回やり直す
  }
};
