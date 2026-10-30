// 画面から貼り付けたメール(または .eml)を読み取って登録する
const AP = require("../parse.js");
const { authed, body } = require("./_lib");
const { ingest } = require("./_ingest");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const b = body(req);
  const text = String(b.text || "");
  if (text.trim().length < 5) return res.status(400).json({ error: { code: "bad_request", message: "メール本文が空です" } });
  let mail = { from: String(b.from || ""), subject: String(b.subject || ""), date: String(b.date || ""), messageId: String(b.messageId || ""), body: text };
  if (!mail.from && !mail.subject) { const s = AP.sniffHeaders(text); mail = Object.assign(mail, { from: s.from, subject: s.subject, date: s.date || mail.date, body: s.body }); }
  if (mail.date && !/^\d{4}-\d{2}-\d{2}T/.test(mail.date)) mail.date = AP.parseDate(mail.date) || "";
  try {
    res.json(Object.assign({ ok: true }, await ingest(mail, { source: "paste", dryRun: !!b.dryRun, force: !!b.force })));
  } catch (e) {
    res.status(500).json({ error: { code: e.code === "no_db" ? "capability_disabled" : "upstream_error", message: String(e.message || e).slice(0, 200) } });
  }
};
