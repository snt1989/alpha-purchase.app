// 共通: ログイン(署名付きCookie)と Upstash Redis(REST)
const crypto = require("crypto");

function secret() {
  return process.env.SESSION_SECRET || "s:" + (process.env.APP_PASSWORD || "");
}
function sign(v) {
  return crypto.createHmac("sha256", secret()).update(String(v)).digest("hex");
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function makeToken() {
  const exp = String(Date.now() + 30 * 24 * 3600 * 1000);
  return exp + "." + sign(exp);
}
function authed(req) {
  if (!process.env.APP_PASSWORD) return false;
  const c = (req.headers.cookie || "").split(/;\s*/).find((x) => x.startsWith("apsess="));
  if (!c) return false;
  const parts = decodeURIComponent(c.slice(7)).split(".");
  if (parts.length !== 2 || !(Number(parts[0]) > Date.now())) return false;
  return safeEq(parts[1], sign(parts[0]));
}
function setCookie(res, token, maxAge) {
  res.setHeader("Set-Cookie", "apsess=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge);
}

// ---- Redis ----
const MOCK = () => globalThis.__REDIS_MOCK__; // テスト用(本番では未設定)
function creds() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
async function pipeline(cmds) {
  if (MOCK()) return MOCK()(cmds);
  const { url, token } = creds();
  if (!url || !token) throw Object.assign(new Error("データベースが設定されていません(Upstash Redis)"), { code: "no_db" });
  const r = await fetch(url.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const j = await r.json();
  if (!r.ok || !Array.isArray(j)) throw new Error("Redis error " + r.status + " " + JSON.stringify(j).slice(0, 200));
  j.forEach((x) => { if (x && x.error) throw new Error(x.error); });
  return j.map((x) => x.result);
}
async function redis(cmd) { return (await pipeline([cmd]))[0]; }

function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}
module.exports = { authed, makeToken, setCookie, safeEq, pipeline, redis, body };
