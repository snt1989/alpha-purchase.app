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
async function pdfText(bytes, asPages) {
  const doc = await pdfjs().getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [], pages = [];
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
    if (asPages) { pages.push(out.splice(0).join("\n")); }
  }
  try { await doc.destroy(); } catch (e) {}
  return asPages ? pages : out.join("\n");
}

// メールの本文だけで先に登録された案件(作業依頼番号が未確定で、書類もまだ無い)
const preMail = (o) => !o.reqNo && !o.provisional && !(o.files || []).length;
const nrm = (t) => String(t || "").replace(/[\s　【】\[\]()（）]/g, "").replace(/\d{6,}/g, "");
function lcs(a, b) { let best = 0, prev = new Array(b.length + 1).fill(0); for (let i = 1; i <= a.length; i++) { const cur = [0]; for (let j = 1; j <= b.length; j++) { cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0; if (cur[j] > best) best = cur[j]; } prev = cur; } return best; }
// 店舗名が一致する「書類待ちの案件」が1件だけなら、それに結びつける
function byStore(all, name) {
  const n = nrm(name); if (n.length < 3) return null;
  const c = all.filter((o) => preMail(o) && o.status !== 8 && [o.site, o.subject].some((t) => { const m = nrm(t); return m && lcs(m, n) >= 6; }));
  return c.length === 1 ? c[0] : null;
}

// 関連メール: 案件に届いたメールを記録(同じメールは1回だけ)
function addRel(o, mail) {
  if (!mail || !mail.messageId) return;
  const key = "g" + String(mail.messageId).replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
  if ((o.mails || []).some((x) => x.key === key)) return;
  const url = /^[0-9a-f]{8,}$/i.test(String(mail.messageId)) ? "https://mail.google.com/mail/u/0/#all/" + mail.messageId : "";
  o.mails = (o.mails || []).concat([{ key, subject: mail.subject || "", from: mail.from || "", date: mail.date || "", url }]);
}

// メール(件名・本文)から関連する既存案件を探す: 作業依頼番号 → 顧客案件番号(8桁) → 店舗名が1件だけ一致
function findCaseForMail(all, mail) {
  const live = all.filter((o) => o.status !== 8);
  const text = String(mail.subject || "") + "\n" + String(mail.body || "").slice(0, 3000);
  const ids = (o) => [o.reqNo, o.caseNo, o.no].map((v) => String(v || "").trim()).filter((v) => v.length >= 6);
  const flat = text.replace(/[\s　]/g, "");
  for (const o of live) { if (ids(o).some((v) => flat.indexOf(v) >= 0)) return o; }
  const nums = text.match(/(?:^|[^0-9])(\d{8})(?:[^0-9]|$)/g) || [];
  for (const n of nums) { const d = n.replace(/\D/g, ""); const o = live.find((x) => String(x.subject || "").indexOf(d) >= 0); if (o) return o; }
  const subj = nrm(String(mail.subject || "").replace(/【[^】]*】/g, ""));
  if (subj.length >= 6) {
    const c = live.filter((o) => [o.site, o.subject].some((t) => { const m = nrm(t); return m && lcs(m, subj) >= 6; }));
    if (c.length === 1) return c[0];
  }
  return null;
}
// 作業依頼番号・顧客案件番号(表記ゆれを無視)が同じ既存の案件を探す
function findByNos(all, n) {
  const k = (v) => AP.nkNo(v), r = k(n.reqNo), c = k(n.caseNo);
  if (r.length < 6 && c.length < 6) return null;
  const live = all.filter((o) => o.status !== 8);
  return live.find((o) => r.length >= 6 && (k(o.reqNo) === r || k(o.caseNo) === r)) || live.find((o) => c.length >= 6 && (k(o.caseNo) === c || k(o.reqNo) === c)) || null;
}
async function relateMail(mail) {
  const flat = (await redis(["HGETALL", K.orders])) || [], all = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { all.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  // 1通に複数の案件番号があれば、それぞれの案件に関連メールとして紐づける
  const text = String(mail.subject || "") + "\n" + String(mail.body || "").slice(0, 6000);
  const hit = [];
  AP.extractAllCaseNos(text).forEach((en) => { const o = findByNos(all, en); if (o && !hit.some((h) => h.id === o.id)) hit.push(o); });
  if (!hit.length) { const o = findCaseForMail(all, mail); if (o) hit.push(o); }
  if (!hit.length) return null;
  const cmds = [];
  hit.forEach((o) => { addRel(o, mail); o.history = (o.history || []).concat({ at: new Date().toISOString(), text: "関連メールを自動で紐づけ: " + (mail.subject || "") }); cmds.push(["HSET", K.orders, o.id, JSON.stringify(o)]); });
  cmds.push(["INCR", K.ver("orders")]);
  await pipeline(cmds);
  return hit;
}

// 作業依頼書と作業完了報告書が1つのPDFに合わさっている場合、種類ごとのPDFに分ける
async function splitCombined(file) {
  try {
    const pages = await pdfText(file.data, true);
    if (pages.length < 2) return [file];
    const type = pages.map((t) => (AP.isWorkOrder(t) ? "order" : AP.isCompletionReport(t) ? "report" : ""));
    const segs = []; // {type, pages[]}
    pages.forEach((t, i) => {
      const last = segs[segs.length - 1];
      if (!type[i] || (last && last.type === type[i])) { if (last) last.pages.push(i); else segs.push({ type: "", pages: [i] }); }
      else segs.push({ type: type[i], pages: [i] });
    });
    if (segs.length && !segs[0].type && segs[1]) { segs[1].pages = segs[0].pages.concat(segs[1].pages); segs.shift(); }
    const typed = segs.filter((g) => g.type);
    if (new Set(typed.map((g) => g.type)).size < 2) return [file];
    const { PDFDocument } = require("pdf-lib");
    const src = await PDFDocument.load(file.data, { ignoreEncryption: true });
    const base = String(file.name || "書類.pdf").replace(/\.pdf$/i, "");
    const out = [], n = {};
    for (const g of typed) {
      const d = await PDFDocument.create();
      (await d.copyPages(src, g.pages)).forEach((pg) => d.addPage(pg));
      const lbl = g.type === "order" ? "作業依頼書" : "作業完了報告書";
      n[lbl] = (n[lbl] || 0) + 1;
      out.push({ name: base + "_" + lbl + (n[lbl] > 1 ? n[lbl] : "") + ".pdf", data: Buffer.from(await d.save()) });
    }
    return out;
  } catch (e) { return [file]; }
}

const MAX_FILE_B64 = 950000; // Redis に保存するPDFの上限(base64で約700KB)

// 読み取った作業依頼 1件を登録。同じ作業依頼番号があれば重複として登録しない
async function registerWork(w, file, ctx) {
  ctx = ctx || {};
  const flat = (await redis(["HGETALL", K.orders])) || [];
  const all = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { all.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  // 作業完了報告書から仮登録された案件(provisional)や、メール本文だけで先に登録された案件(PDF待ち)があれば、新規にせずそこへ内容を反映する
  let target = null;
  if (w.reqNo) target = all.find((o) => o.provisional && o.reqNo === w.reqNo) || null;
  if (!target && w.caseNo) target = all.find((o) => preMail(o) && (o.caseNo === w.caseNo || String(o.subject || "").indexOf(w.caseNo) >= 0)) || null;
  if (!target && w.caseNo) target = all.find((o) => o.status !== 8 && o.caseNo === w.caseNo && !o.reqNo) || null;
  if (!target) { const same = findByNos(all, { caseNo: w.caseNo }); if (same && (!w.reqNo || !same.reqNo || AP.nkNo(same.reqNo) !== AP.nkNo(w.reqNo))) target = same; }
  if (!target) target = byStore(all, w.site || w.property);
  if (!target && w.reqNo) { const dup = all.find((o) => o.reqNo === w.reqNo); if (dup) return { state: "duplicate", job: dup }; }
  const now0 = new Date().toISOString();
  const now = now0;
  const no = target ? target.no : (await nextNos(1))[0];
  const job = AP.makeWorkJob(w, { now, nextNo: () => no, source: ctx.source || "gmail", fileName: file && file.name, mail: ctx.mail || null, files: [] });
  if (target) job.id = target.id; // 既存の案件に反映するときは同じIDを使う(ファイルのIDも揃う)
  const cmds = [];
  if (file && file.data) {
    const b64 = Buffer.from(file.data).toString("base64");
    if (b64.length <= MAX_FILE_B64) {
      const fid = job.id + "-1";
      cmds.push(["SET", "ap:file:" + fid, b64], ["HSET", "ap:fmeta", fid, JSON.stringify({ id: fid, name: file.name, mime: "application/pdf", job: job.id, at: now })]);
      job.files = [{ name: file.name, url: "/api/file?id=" + encodeURIComponent(fid), label: "作業依頼書", kind: "order" }];
    } else job.files = [{ name: file.name, label: "作業依頼書", kind: "order" }];
  }
  if (target) {
    // 既存の案件に上書き(番号・状態・履歴・写真などは引き継ぐ)
    const keep = {}; ["id", "no", "status", "history", "photos", "createdAt", "receivedAt", "staff", "note"].forEach((k) => { if (k === "receivedAt" && target.provisional) return; if (target[k] !== undefined) keep[k] = target[k]; });
    const merged = Object.assign({}, job, keep, { pdfLink: undefined, provisional: undefined });
    // 元のメールから読み取った情報は消さない。PDFに無い項目は元の値を残し、メール情報(差出人・連絡先など)は常に元を優先する
    const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
    Object.keys(target).forEach((k) => { if (["files", "history", "pdfLink", "provisional", "issues", "needsReview", "parsedBy"].indexOf(k) >= 0) return; if (empty(merged[k]) && !empty(target[k])) merged[k] = target[k]; });
    ["mail", "email", "source"].forEach((k) => { if (!empty(target[k])) merged[k] = target[k]; });
    if (!empty(target.contact) && target.email) merged.contact = target.contact;
    if (!empty(target.subject)) { merged.mailSubject = target.subject; }
    merged.files = (job.files || []).concat((target.files || []).filter((f) => f.kind === "report"));
    merged.mails = target.mails || []; addRel(merged, ctx.mail);
    merged.history = (target.history || []).concat({ at: now, text: target.provisional ? "作業依頼書を読み込んで内容を確定" : "作業依頼書PDFを読み込んで内容を更新" });
    cmds.push(["HSET", K.orders, target.id, JSON.stringify(merged)], ["INCR", K.ver("orders")]);
    if (w.reqNo) cmds.push(["HSET", K.mails, AP.workKey(w), JSON.stringify({ key: AP.workKey(w), at: now, state: "registered", from: job.customer, subject: "作業依頼書 " + w.reqNo + " " + (w.site || "") + " " + (w.subject || ""), jobs: [{ id: target.id, no: target.no }] })], ["INCR", K.ver("mails")]);
    await pipeline(cmds);
    return { state: "merged", job: merged };
  }
  if (ctx.pwFrom) job.history.push({ at: now, text: "ZIPのパスワードを「" + ctx.pwFrom + "」から読み取り" });
  cmds.push(["HSET", K.orders, job.id, JSON.stringify(job)], ["INCR", K.ver("orders")]);
  if (w.reqNo) cmds.push(["HSET", K.mails, AP.workKey(w), JSON.stringify({ key: AP.workKey(w), at: now, state: "registered", from: job.customer, subject: "作業依頼書 " + w.reqNo + " " + (w.site || "") + " " + (w.subject || ""), jobs: [{ id: job.id, no: job.no }] })], ["INCR", K.ver("mails")]);
  await pipeline(cmds);
  return { state: "registered", job };
}

/** 「書類の確認」から追加したPDFは、既存の案件に書類として付けるだけ。案件を新規に作らず、案件の内容も書き換えない */
async function attachDoc(kind, k, file) {
  const flat = (await redis(["HGETALL", K.orders])) || [];
  const all = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { all.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  const live = all.filter((o) => o.status !== 8);
  const o = (k.reqNo && live.find((x) => x.reqNo === k.reqNo)) || (k.caseNo && (live.find((x) => x.caseNo === k.caseNo) || live.find((x) => String(x.subject || "").indexOf(k.caseNo) >= 0))) || byStore(live, k.site) || null;
  if (!o) return { state: "no_match" };
  const now = new Date().toISOString(), cmds = [];
  const label = kind === "order" ? "作業依頼書" : "作業完了報告書";
  const entry = { name: (file && file.name) || label + ".pdf", label, kind };
  const fid = o.id + (kind === "order" ? "-1" : "-r");
  const b64 = Buffer.from(file.data).toString("base64");
  if (b64.length <= MAX_FILE_B64) {
    cmds.push(["SET", "ap:file:" + fid, b64], ["HSET", "ap:fmeta", fid, JSON.stringify({ id: fid, name: entry.name, mime: "application/pdf", job: o.id, at: now })]);
    entry.url = "/api/file?id=" + encodeURIComponent(fid);
  }
  o.files = (o.files || []).filter((f) => (f.kind || (/報告/.test((f.label || "") + (f.name || "")) ? "report" : "order")) !== kind).concat(entry);
  o.history = (o.history || []).concat({ at: now, text: label + "を書類として追加(" + entry.name + ")" });
  cmds.push(["HSET", K.orders, o.id, JSON.stringify(o)], ["INCR", K.ver("orders")]);
  await pipeline(cmds);
  return { state: "docs_added", job: o };
}

/** 作業完了報告書(様式)を案件に付ける。案件番号が同じ案件があればそこへ、なければ仮の案件を作る(あとで作業依頼書が届いたら内容を確定する) */
async function registerReport(rep, file, ctx) {
  ctx = ctx || {};
  const flat = (await redis(["HGETALL", K.orders])) || [];
  const all = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { all.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  let o = all.find((x) => rep.reqNo && x.reqNo === rep.reqNo) || all.find((x) => rep.caseNo && x.caseNo === rep.caseNo) || all.find((x) => rep.caseNo && preMail(x) && String(x.subject || "").indexOf(rep.caseNo) >= 0) || byStore(all, rep.property) || null;
  const now = new Date().toISOString();
  let created = false;
  if (!o) {
    const no = (await nextNos(1))[0];
    o = AP.makeWorkJob({ client: AP.CLIENT, reqNo: rep.reqNo, caseNo: rep.caseNo, site: [rep.property, rep.branch].filter(Boolean).join(" "), address: rep.address, subject: rep.subject, storeCode: rep.storeCode, property: rep.property, category: "", detail: "", schedule: "", noWork: "", amountNote: "", dept: "", deptTel: "", signer: "", siteTel: "", workDate: "", quoteNo: "", requestedAt: now, missing: [] }, { now, nextNo: () => no, source: ctx.source || "gmail", mail: ctx.mail || null, files: [] });
    o.provisional = true; o.needsReview = true;
    o.issues = ["作業依頼書がまだ届いていません(作業完了報告書から仮登録。届くと内容が確定します)"];
    o.history = [{ at: now, text: "作業完了報告書から仮登録(" + (file && file.name || "") + ")" }];
    created = true;
  }
  const cmds = [];
  const entry = { name: (file && file.name) || "作業完了報告書.pdf", label: "作業完了報告書", kind: "report" };
  if (file && file.data) {
    const b64 = Buffer.from(file.data).toString("base64");
    if (b64.length <= MAX_FILE_B64) {
      const fid = o.id + "-r";
      cmds.push(["SET", "ap:file:" + fid, b64], ["HSET", "ap:fmeta", fid, JSON.stringify({ id: fid, name: entry.name, mime: "application/pdf", job: o.id, at: now })]);
      entry.url = "/api/file?id=" + encodeURIComponent(fid);
    }
  }
  addRel(o, ctx.mail);
  o.files = (o.files || []).filter((f) => f.kind !== "report").concat(entry);
  if (!created) o.history = (o.history || []).concat({ at: now, text: "作業完了報告書を追加" });
  cmds.push(["HSET", K.orders, o.id, JSON.stringify(o)], ["INCR", K.ver("orders")]);
  await pipeline(cmds);
  return { state: created ? "provisional" : "attached", job: o };
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
      const docs = [];
      { const ex = []; for (const p of pdfs) for (const q of await splitCombined(p)) ex.push(q); pdfs = ex; }
      for (const p of pdfs) docs.push({ p, text: await pdfText(p.data) });
      // 作業依頼書を先に、作業完了報告書を後に処理する(同じ案件に結びつけるため)
      docs.sort((x, y) => (AP.isWorkOrder(y.text) ? 1 : 0) - (AP.isWorkOrder(x.text) ? 1 : 0));
      for (const { p, text } of docs) {
        if (ctx && ctx.attachOnly && (AP.isWorkOrder(text) || AP.isCompletionReport(text))) {
          const isO = AP.isWorkOrder(text), x = isO ? AP.parseWorkOrder(text) : AP.parseCompletionReport(text);
          const r = await attachDoc(isO ? "order" : "report", { reqNo: x.reqNo, caseNo: x.caseNo, site: x.site || x.property }, p);
          results.push({ file: p.name, state: r.state, no: r.job && r.job.no, reqNo: x.reqNo });
        } else if (AP.isWorkOrder(text)) {
          const w = AP.parseWorkOrder(text);
          const r = await registerWork(w, p, Object.assign({}, ctx, { pwFrom }));
          results.push({ file: p.name, state: r.state, no: r.job.no, reqNo: w.reqNo });
        } else if (AP.isCompletionReport(text)) {
          const rep = AP.parseCompletionReport(text);
          const r = await registerReport(rep, p, ctx);
          results.push({ file: p.name, state: r.state, no: r.job.no, reqNo: rep.reqNo });
        } else results.push({ file: p.name, state: "not_work_order", text: text.slice(0, 20000) });
      }
    } catch (e) {
      results.push({ file: a.name, state: "error", error: String((e && e.message) || e).slice(0, 160), code: e && e.code });
    }
  }
  return results;
}

module.exports = { addRel, findByNos, relateMail, findCaseForMail, splitCombined, unzipPdfs, openZip, pdfText, registerWork, registerReport, processAttachments };
