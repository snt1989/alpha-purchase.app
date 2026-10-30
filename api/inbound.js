// メールの自動取込の受信口。Gmail の Google Apps Script(画面の「依頼の取込」にコピー用のコードあり)から
// POST { messageId, from, subject, date, body, attachments:[{name, b64}], pwTexts:[{subject, body}] } を、
// Authorization: Bearer <INBOUND_TOKEN> 付きで受け取る。
//  - 添付(ZIP・PDF)があれば作業依頼書として読み取って登録(ZIPのパスワードは pwTexts=前後のメールから探す)
//  - 添付がなければ本文から見積依頼・注文として登録
const { safeEq, body, redis } = require("./_lib");
const { ingest, K } = require("./_ingest");
const { processAttachments } = require("./_work");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const tok = process.env.INBOUND_TOKEN;
  if (!tok || tok.length < 16) return res.status(503).json({ ok: false, error: "INBOUND_TOKEN が未設定です(16文字以上)" });
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!given || !safeEq(given, tok)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const b = body(req);
  // 連携の生存確認(Apps Script が実行のたびに送る。メールが0件でもエラーでも届く)
  if (b.heartbeat) {
    const n = (x) => Math.max(0, Math.min(100000, Number(x) || 0));
    const hb = { at: new Date().toISOString(), ok: b.ok !== false, error: String(b.error || "").slice(0, 300), scanned: n(b.scanned), sent: n(b.sent), pending: n(b.pending) };
    try { await redis(["SET", "ap:heartbeat", JSON.stringify(hb)]); return res.json({ ok: true }); }
    catch (e) { return res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 200) }); }
  }
  const mail = { from: String(b.from || ""), subject: String(b.subject || ""), date: String(b.date || ""), messageId: String(b.messageId || ""), body: String(b.body || "") };
  const atts = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 10)
    .filter((a) => a && a.name && typeof a.b64 === "string" && /\.(zip|pdf)$/i.test(a.name))
    .map((a) => ({ name: String(a.name).slice(0, 200), data: new Uint8Array(Buffer.from(a.b64, "base64")) }));
  try {
    if (atts.length) {
      const pwTexts = (Array.isArray(b.pwTexts) ? b.pwTexts : []).slice(0, 6).map((t) => ({ subject: String((t && t.subject) || "").slice(0, 300), body: String((t && t.body) || "").slice(0, 8000) }));
      const results = await processAttachments(atts, pwTexts, { source: "gmail", mail: { from: mail.from, subject: mail.subject, date: mail.date, messageId: mail.messageId, body: mail.body.slice(0, 5000) } });
      // 作業依頼書ではない添付(見積依頼書のPDFなど)は、本文+PDFの文字を合わせて見積依頼・注文として登録する
      const others = results.filter((r) => r.state === "not_work_order" && r.text);
      const hasWork = results.some((r) => r.state === "registered" || r.state === "duplicate");
      const pwRetry = results.some((r) => r.state === "error" && r.code === "no_password");
      if (!hasWork && !pwRetry && others.length) {
        const text = (mail.body + "\n\n" + others.map((r) => "【添付 " + r.file + "】\n" + r.text).join("\n\n")).slice(0, 30000);
        const r = await ingest(Object.assign({}, mail, { body: text }), { source: "gmail" });
        return res.json({ ok: true, state: r.state, nos: (r.jobs || []).map((j) => j.no), results: results.map((x) => ({ file: x.file, state: x.state })) });
      }
      results.forEach((r) => { delete r.text; });
      // 記録(取込ログに出す)
      const key ="g" + (mail.messageId || Date.now()).toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
      const ok = results.filter((r) => r.state === "registered");
      await redis(["HSET", K.mails, key, JSON.stringify({ key, at: new Date().toISOString(), state: ok.length ? "registered" : results.some((r) => r.state === "duplicate") ? "duplicate" : "error",
        from: mail.from, subject: mail.subject, jobs: ok.map((r) => ({ id: "", no: r.no })), files: results })]);
      await redis(["INCR", K.ver("mails")]);
      // パスワードが見つからない・読めない場合は 422(送信側はラベルを付けずに次回やり直す)
      const retry = results.some((r) => r.state === "error" && r.code === "no_password");
      return res.status(retry ? 422 : 200).json({ ok: !retry, results });
    }
    if (mail.body.trim().length < 5) return res.status(400).json({ ok: false, error: "body が空です" });
    const r = await ingest(mail, { source: "gmail" });
    res.json({ ok: true, state: r.state, nos: (r.jobs || []).map((j) => j.no) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 200) }); // 500 なら送信側は「未処理」のままにして、次回やり直す
  }
};
