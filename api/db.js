// データ保存: コレクションごとに Redis の Hash(ap:<col>)。更新のたびに版番号(ap:ver:<col>)を増やす
const { authed, pipeline, body } = require("./_lib");
const { nextNos } = require("./_ingest");
const COLS = ["orders", "mails", "settings"];
const key = (c) => "ap:" + c;
const vkey = (c) => "ap:ver:" + c;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!authed(req)) return res.status(401).json({ error: { code: "not_granted", message: "ログインが必要です" } });
  const b = body(req);
  const bad = () => res.status(400).json({ error: { code: "bad_request" } });
  try {
    if (b.op === "ver") {
      const r = await pipeline(COLS.map((c) => ["GET", vkey(c)]));
      const ver = {}; COLS.forEach((c, i) => (ver[c] = Number(r[i] || 0)));
      return res.json({ ver });
    }
    if (b.op === "list") {
      if (COLS.indexOf(b.col) < 0) return bad();
      const r = await pipeline([["HGETALL", key(b.col)], ["GET", vkey(b.col)]]);
      const flat = r[0] || [], docs = [];
      for (let i = 0; i + 1 < flat.length; i += 2) { try { docs.push({ id: flat[i], data: JSON.parse(flat[i + 1]) }); } catch (e) {} }
      return res.json({ docs, ver: Number(r[1] || 0) });
    }
    if (b.op === "orphans") {
      // どの案件にも付いていない保存済みPDF(紐づけ解除したものなど)
      const r = await pipeline([["HGETALL", "ap:fmeta"], ["HGETALL", key("orders")], ["HGET", key("settings"), "main"]]);
      const used = {}, mark = (f) => { if (f && f.url) used[f.url] = 1; };
      const o = r[1] || []; for (let i = 0; i + 1 < o.length; i += 2) { try { (JSON.parse(o[i + 1]).files || []).forEach(mark); } catch (e) {} }
      try { (JSON.parse(r[2] || "{}").looseDocs || []).forEach(mark); } catch (e) {}
      const m = r[0] || [], list = [];
      for (let i = 0; i + 1 < m.length; i += 2) {
        try { const f = JSON.parse(m[i + 1]); if (f.mime !== "application/pdf") continue; const url = "/api/file?id=" + encodeURIComponent(f.id || m[i]); if (!used[url]) list.push({ id: f.id || m[i], name: f.name || "", url, kind: /-r$/.test(f.id || m[i]) ? "report" : "order", at: f.at || "" }); } catch (e) {}
      }
      return res.json({ ok: true, docs: list });
    }
    if (b.op === "set" || b.op === "del") {
      if (COLS.indexOf(b.col) < 0 || !/^[A-Za-z0-9_\-@.]{1,120}$/.test(String(b.id || ""))) return bad();
      const cmds = b.op === "set"
        ? [["HSET", key(b.col), b.id, JSON.stringify(b.data == null ? {} : b.data)], ["INCR", vkey(b.col)]]
        : [["HDEL", key(b.col), b.id], ["INCR", vkey(b.col)]];
      const r = await pipeline(cmds);
      return res.json({ ok: true, ver: Number(r[1]) });
    }
    if (b.op === "next") return res.json({ ok: true, no: (await nextNos(1))[0] });
    if (b.op === "import") {
      // { data: { orders:[{id,data}], mails:[...], settings:{...} } }  バックアップの復元(既存IDは上書き)
      const d = b.data || {}; let n = 0;
      for (const c of COLS) {
        let items = d[c];
        if (c === "settings" && items && !Array.isArray(items)) items = [{ id: "main", data: items }];
        if (!Array.isArray(items) || !items.length) continue;
        for (let i = 0; i < items.length; i += 100) {
          const cmds = items.slice(i, i + 100).filter((x) => x && x.id).map((x) => ["HSET", key(c), String(x.id), JSON.stringify(x.data || {})]);
          if (cmds.length) { await pipeline(cmds); n += cmds.length; }
        }
        await pipeline([["INCR", vkey(c)]]);
      }
      return res.json({ ok: true, imported: n });
    }
    bad();
  } catch (e) {
    res.status(500).json({ error: { code: e.code === "no_db" ? "capability_disabled" : "upstream_error", message: String(e.message || e).slice(0, 200) } });
  }
};
