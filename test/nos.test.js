const A = require("../parse.js"), as = require("assert");
let r = A.extractCaseNos("件名: ローソン 03193190\n作業依頼番号 / 顧客案件番号  2610-02011-2851 / 03193190");
as.deepStrictEqual(r, { reqNo: "2610-02011-2851", caseNo: "03193190" });
r = A.extractCaseNos("顧客案件番号：０３１９３１９０"); as.strictEqual(r.caseNo, "03193190");
r = A.extractCaseNos("案件番号 2610-02011-2851 / 03193190"); as.strictEqual(r.caseNo, "03193190");
as.strictEqual(A.nkNo("0319 3190"), "03193190");
console.log("nos tests OK");
