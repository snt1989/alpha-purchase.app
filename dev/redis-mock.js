// テスト・ローカル確認用: Upstash Redis の代わりになるメモリ上の簡易実装(使うコマンドだけ)
module.exports = function createMock() {
  const kv = new Map(); // key -> string | Map
  const hash = (k) => { if (!kv.has(k)) kv.set(k, new Map()); return kv.get(k); };
  function run(c) {
    const [cmd, k, a, b] = c;
    switch (String(cmd).toUpperCase()) {
      case "GET": return kv.has(k) ? kv.get(k) : null;
      case "SET": kv.set(k, String(a)); return "OK";
      case "DEL": return kv.delete(k) ? 1 : 0;
      case "INCR": { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }
      case "HGET": return kv.has(k) && kv.get(k).has(a) ? kv.get(k).get(a) : null;
      case "HSET": { const h = hash(k), isNew = !h.has(a); h.set(a, String(b)); return isNew ? 1 : 0; }
      case "HSETNX": { const h = hash(k); if (h.has(a)) return 0; h.set(a, String(b)); return 1; }
      case "HDEL": return kv.has(k) && kv.get(k).delete(a) ? 1 : 0;
      case "HEXISTS": return kv.has(k) && kv.get(k).has(a) ? 1 : 0;
      case "HKEYS": return kv.has(k) ? [...kv.get(k).keys()] : [];
      case "HGETALL": { const out = []; if (kv.has(k)) kv.get(k).forEach((v, f) => out.push(f, v)); return out; }
      default: throw new Error("mock: unsupported " + cmd);
    }
  }
  return (cmds) => cmds.map(run);
};
