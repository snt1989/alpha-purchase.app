// サーバーの状態(設定画面の「サーバーの情報」用)。ログインが必要。秘密の値は返さず、設定済みかどうかだけ返す。
const { authed, pipeline } = require("./_lib");

const set = (k) => !!process.env[k];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const out = {
    at: new Date().toISOString(),
    runtime: {
      node: process.version,
      region: process.env.VERCEL_REGION || "",
      env: process.env.VERCEL_ENV || "",
      commit: String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
      commitMessage: String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "").split("\n")[0].slice(0, 100),
      host: String((req.headers && req.headers.host) || ""),
    },
    config: {
      password: set("APP_PASSWORD"),
      sessionSecret: set("SESSION_SECRET"),
      inboundToken: set("INBOUND_TOKEN"),
      ai: set("ANTHROPIC_API_KEY"),
      redis: !!((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)),
    },
    db: { ok: false },
    inbound: { endpoint: "", lastAt: "", lastSubject: "", lastState: "" },
  };
  const proto = String((req.headers && req.headers["x-forwarded-proto"]) || "https").split(",")[0];
  if (out.runtime.host) out.inbound.endpoint = proto + "://" + out.runtime.host + "/api/inbound";
  const t0 = Date.now();
  try {
    const r = await pipeline([["HKEYS", "ap:orders"], ["HGETALL", "ap:mails"], ["HKEYS", "ap:fmeta"]]);
    out.db = { ok: true, ms: Date.now() - t0, orders: (r[0] || []).length, files: (r[2] || []).length, mails: 0 };
    const flat = r[1] || [];
    let last = null;
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.db.mails++;
      try { const m = JSON.parse(flat[i + 1]); if (m && m.at && (!last || m.at > last.at)) last = m; } catch (e) {}
    }
    if (last) { out.inbound.lastAt = last.at; out.inbound.lastSubject = String(last.subject || "").slice(0, 80); out.inbound.lastState = String(last.state || ""); }
  } catch (e) { out.db = { ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 160) }; }
  res.json(out);
};
