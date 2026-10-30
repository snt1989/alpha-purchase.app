// 作業依頼書と作業完了報告書が1つのPDFに入っている場合、種類ごとに分けて保存する
const assert = require("assert"), fs = require("fs"), path = require("path");
const { PDFDocument } = require("pdf-lib");
const w = require("../api/_work.js");
(async () => {
  const fx = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n));
  const o = await PDFDocument.load(fx("order.pdf")), r = await PDFDocument.load(fx("report.pdf"));
  const m = await PDFDocument.create();
  for (const src of [o, r]) (await m.copyPages(src, src.getPageIndices())).forEach((p) => m.addPage(p));
  const data = Buffer.from(await m.save());
  const parts = await w.splitCombined({ name: "合体.pdf", data });
  assert.strictEqual(parts.length, 2, "2つに分かれる");
  assert.ok(/作業依頼書/.test(parts[0].name) && /作業完了報告書/.test(parts[1].name), parts.map((p) => p.name).join());
  assert.strictEqual((await PDFDocument.load(parts[0].data)).getPageCount(), o.getPageCount());
  assert.strictEqual((await PDFDocument.load(parts[1].data)).getPageCount(), r.getPageCount());
  const single = await w.splitCombined({ name: "order.pdf", data: fx("order.pdf") });
  assert.strictEqual(single.length, 1);
  console.log("split tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
