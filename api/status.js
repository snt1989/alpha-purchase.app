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
    const r = await pipeline([["HGETALL", "ap:orders"], ["HGETALL", "ap:mails"], ["HKEYS", "ap:fmeta"]]);
    const bytes = (flat) => { let n = 0; for (let i = 0; i < flat.length; i++) n += Buffer.byteLength(String(flat[i])); return n; };
    const oflat = r[0] || [], fids = r[2] || [];
    out.db = { ok: true, ms: Date.now() - t0, orders: Math.floor(oflat.length / 2), files: fids.length, mails: 0 };
    const sizes = { orders: bytes(oflat), mails: bytes(r[1] || []), files: 0 };
    if (fids.length) {
      try { const sl = await pipeline(fids.slice(0, 2000).map((id) => ["STRLEN", "ap:file:" + id])); sizes.files = sl.reduce((a, x) => a + (Number(x) || 0), 0); } catch (e) {}
    }
    out.storage = { appBytes: sizes.orders + sizes.mails + sizes.files, ordersBytes: sizes.orders, mailsBytes: sizes.mails, filesBytes: sizes.files, usedBytes: null, limitBytes: null, shared: true };
    try {
      const info = String((await pipeline([["INFO"]]))[0] || "");
      const g = (k) => { const m = info.match(new RegExp("(?:^|\\n)" + k + ":(\\d+)")); return m ? Number(m[1]) : null; };
      out.storage.usedBytes = g("used_memory"); out.storage.limitBytes = g("maxmemory") || null;
    } catch (e) {}
    if (!out.storage.limitBytes) out.storage.limitBytes = (Number(process.env.REDIS_LIMIT_MB) || 256) * 1048576; // Upstash 無料プランの目安
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
