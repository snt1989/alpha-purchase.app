// 作業依頼書(ZIP・PDF)をサーバーで読み取って登録する
const AP = require("../parse.js");
const { pipeline, redis } = require("./_lib");
const { nextNos, K } = require("./_ingest");

let zipLib = null, pdfLib = null;
function zipjs() {
  if (!zipLib) { zipLib = require("@zip.js/zip.js"); zipLib.configure({ useWebWorkers: false }); }
  return zipLib;
}
function pdfjs() {
  if (!pdfLib) {
    // canvas は不要(文字の取り出しだけ)。読み込み時の警告を抑える
    const warn = console.warn, log = console.log;
    console.warn = () => {}; console.log = () => {};
    try {
      // ワーカーを明示的に読み込む(Vercel の同梱漏れ防止。pdf.js はこれを「同じスレッドのワーカー」として使う)
      globalThis.pdfjsWorker = require("pdfjs-dist/legacy/build/pdf.worker.js");
      pdfLib = require("pdfjs-dist/legacy/build/pdf.js");
    } finally { console.warn = warn; console.log = log; }
  }
  return pdfLib;
}

// ZIP → [{name, data}] (パスワード付き・入れ子・日本語ファイル名に対応)。パスワード違いは例外
async function unzipPdfs(bytes, pw, depth) {
  const zip = zipjs(), out = [];
  const rd = new zip.ZipReader(new zip.Uint8ArrayReader(bytes), { password: pw || undefined });
  try {
    const ents = await rd.getEntries({ decodeText: decodeName });
    for (const en of ents) {
      if (en.directory || /^__MACOSX|\/\._/.test(en.filename)) continue;
      const name = en.filename.split("/").pop();
      if (/\.pdf$/i.test(name)) out.push({ name, data: await en.getData(new zip.Uint8ArrayWriter(), { password: pw || undefined }) });
      else if (/\.zip$/i.test(name) && (depth || 0) < 2) out.push(...(await unzipPdfs(await en.getData(new zip.Uint8ArrayWriter(), { password: pw || undefined }), pw, (depth || 0) + 1)));
    }
  } finally { try { await rd.close(); } catch (e) {} }
  return out;
}
// ZIP内のファイル名: UTF-8 として正しければ UTF-8、そうでなければ Shift_JIS(Windows で作ったZIP)
function decodeName(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (e) { try { return new TextDecoder("shift_jis").decode(bytes); } catch (e2) { return Buffer.from(bytes).toString("latin1"); } }
}
function needsPw(e) { return /password|encrypted/i.test(String((e && e.message) || e)); }

// 候補を順に試して開く。戻り値 {pdfs, pw}。どれも合わなければ例外
async function openZip(bytes, candidates) {
  const tried = new Set();
  for (const pw of [""].concat(candidates || [])) {
    if (tried.has(pw)) continue; tried.add(pw);
    try { return { pdfs: await unzipPdfs(bytes, pw), pw }; }
    catch (e) { if (!needsPw(e)) throw e; }
  }
  throw Object.assign(new Error("ZIPのパスワードが見つかりませんでした"), { code: "no_password" });
}

// PDF → 行ごとの文字(同じ高さの文字を1行に、離れたセルはタブ区切り)。画面側と同じ作り
async function pdfText(bytes) {
  const doc = await pdfjs().getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent(), rows = [];
    tc.items.filter((i) => i.str && i.str.trim()).forEach((i) => {
      const y = i.transform[5]; let r = rows.find((x) => Math.abs(x.y - y) < 3);
      if (!r) { r = { y, it: [] }; rows.push(r); }
      r.it.push({ s: i.str, x: i.transform[4], w: i.width });
    });
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.it.sort((a, b) => a.x - b.x);
      let line = "", end = null;
      for (const i of r.it) { if (end != null && i.x - end > 6) line += "\t"; line += i.s; end = i.x + i.w; }
      out.push(line);
    }
    out.push("");
  }
  try { await doc.destroy(); } catch (e) {}
  return out.join("\n");
}

const MAX_FILE_B64 = 950000; // Redis に保存するPDFの上限(base64で約700KB)

// 読み取った作業依頼 1件を登録。同じ作業依頼番号があれば重複として登録しない
async function registerWork(w, file, ctx) {
  ctx = ctx || {};
  if (w.reqNo) {
    const flat = (await redis(["HGETALL", K.orders])) || [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { const o = JSON.parse(flat[i + 1]); if (o.reqNo === w.reqNo) return { state: "duplicate", job: o }; } catch (e) {}
    }
  }
  const now = new Date().toISOString();
  const no = (await nextNos(1))[0];
  const job = AP.makeWorkJob(w, { now, nextNo: () => no, source: ctx.source || "gmail", fileName: file && file.name, mail: ctx.mail || null, files: [] });
  const cmds = [];
  if (file && file.data) {
    const b64 = Buffer.from(file.data).toString("base64");
    if (b64.length <= MAX_FILE_B64) {
      const fid = job.id + "-1";
      cmds.push(["SET", "ap:file:" + fid, b64], ["HSET", "ap:fmeta", fid, JSON.stringify({ id: fid, name: file.name, mime: "application/pdf", job: job.id, at: now })]);
      job.files = [{ name: file.name, url: "/api/file?id=" + encodeURIComponent(fid) }];
    } else job.files = [{ name: file.name }];
  }
  if (ctx.pwFrom) job.history.push({ at: now, text: "ZIPのパスワードを「" + ctx.pwFrom + "」から読み取り" });
  cmds.push(["HSET", K.orders, job.id, JSON.stringify(job)], ["INCR", K.ver("orders")]);
  if (w.reqNo) cmds.push(["HSET", K.mails, AP.workKey(w), JSON.stringify({ key: AP.workKey(w), at: now, state: "registered", from: job.customer, subject: "作業依頼書 " + w.reqNo + " " + (w.site || "") + " " + (w.subject || ""), jobs: [{ id: job.id, no: job.no }] })], ["INCR", K.ver("mails")]);
  await pipeline(cmds);
  return { state: "registered", job };
}

/**
 * メール添付の処理。attachments: [{name, data(Uint8Array)}]、pwTexts: [{subject, body}](前後のメール)
 * 戻り値: [{file, state, no?, reqNo?, error?}]
 */
async function processAttachments(attachments, pwTexts, ctx) {
  const results = [];
  const cands = [];
  for (const t of pwTexts || []) for (const c of AP.extractPasswords((t.subject || "") + "\n" + (t.body || ""))) cands.push({ pw: c, from: t.subject || "前後のメール" });
  for (const a of attachments) {
    try {
      let pdfs = [], pwFrom = "";
      if (/\.zip$/i.test(a.name)) {
        const r = await openZip(a.data, cands.map((c) => c.pw));
        pdfs = r.pdfs; if (r.pw) pwFrom = (cands.find((c) => c.pw === r.pw) || {}).from || "";
      } else if (/\.pdf$/i.test(a.name)) pdfs = [a];
      else continue;
      if (!pdfs.length) { results.push({ file: a.name, state: "no_pdf" }); continue; }
      for (const p of pdfs) {
        const text = await pdfText(p.data);
        if (!AP.isWorkOrder(text)) { results.push({ file: p.name, state: "not_work_order", text: text.slice(0, 20000) }); continue; }
        const w = AP.parseWorkOrder(text);
        const r = await registerWork(w, p, Object.assign({}, ctx, { pwFrom }));
        results.push({ file: p.name, state: r.state, no: r.job.no, reqNo: w.reqNo });
      }
    } catch (e) {
      results.push({ file: a.name, state: "error", error: String((e && e.message) || e).slice(0, 160), code: e && e.code });
    }
  }
  return results;
}

module.exports = { unzipPdfs, openZip, pdfText, registerWork, processAttachments };
