const { authed, makeToken, setCookie, safeEq, body } = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const b = body(req);
  if (!process.env.APP_PASSWORD) return res.status(200).json({ ok: false, nopw: true, error: "APP_PASSWORD が設定されていません" });
  const flags = { ai: !!process.env.ANTHROPIC_API_KEY, inbound: !!process.env.INBOUND_TOKEN };
  if (b.op === "check") return res.status(200).json(authed(req) ? Object.assign({ ok: true }, flags) : { ok: false });
  if (b.op === "logout") { setCookie(res, "", 0); return res.status(200).json({ ok: true }); }
  if (b.op === "login") {
    await new Promise((r) => setTimeout(r, 400));
    const pw = typeof b.password === "string" ? b.password : "";
    if (pw && safeEq(pw, process.env.APP_PASSWORD)) { setCookie(res, makeToken(), 30 * 24 * 3600); return res.status(200).json(Object.assign({ ok: true }, flags)); }
    return res.status(401).json({ ok: false, error: "パスワードが違います" });
  }
  res.status(400).json({ ok: false });
};
