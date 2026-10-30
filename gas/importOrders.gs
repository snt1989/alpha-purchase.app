// アルファ受注ナビ: Gmail の依頼メールを自動で取り込む(Google Apps Script)
// 使い方: script.google.com に貼り付け → TOKEN を設定 → トリガーで importOrders を「5分ごと」に実行
const ENDPOINT = '__ORIGIN__/api/inbound';
const TOKEN = 'ここに INBOUND_TOKEN を貼り付け';
// 拾うメールの条件(Gmailの検索と同じ書き方)。アルファパーチェス(alphapurchase.co.jp)と、修繕依頼の配信元(gravity-inc001.com)だけを拾う
const QUERY = 'newer_than:3d -label:AP取込済 (from:alphapurchase.co.jp OR from:gravity-inc001.com)';
const DONE_LABEL = 'AP取込済';

function importOrders() {
  const stat = { ok: true, error: '', scanned: 0, sent: 0, pending: 0 };
  try {
    run_(stat);
  } catch (e) {
    stat.ok = false; stat.error = String((e && e.message) || e).slice(0, 300);
    console.log('importOrders error: ' + stat.error);
  }
  // 画面の「Gmail連携」の印用: 実行のたびに結果を知らせる(メールが0件でも、エラーでも送る)
  try {
    UrlFetchApp.fetch(ENDPOINT, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + TOKEN }, payload: JSON.stringify({ heartbeat: true, ok: stat.ok, error: stat.error, scanned: stat.scanned, sent: stat.sent, pending: stat.pending })
    });
  } catch (e) { console.log('heartbeat failed: ' + e); }
}

function run_(stat) {
  const done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const me = Session.getActiveUser().getEmail();
  GmailApp.search(QUERY, 0, 20).forEach(function (th) {
    let ok = true;
    stat.scanned++;
    th.getMessages().forEach(function (m) {
      if (m.isInTrash() || (me && m.getFrom().indexOf(me) >= 0)) return;
      const body = m.getPlainBody() || '';
      const atts = m.getAttachments({ includeInlineImages: false }).filter(function (a) { return /\.(zip|pdf)$/i.test(a.getName()); });
      // パスワード通知だけのメールは単独では送らない(添付メールを処理するときに前後のメールとして読む)
      if (!atts.length && /パスワード|password|解凍/i.test(m.getSubject() + body.slice(0, 400)) && body.length < 2000) return;
      const payload = {
        messageId: m.getId(), from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(), body: body.slice(0, 20000),
        attachments: atts.map(function (a) { return { name: a.getName(), b64: Utilities.base64Encode(a.getBytes()) }; }),
        pwTexts: atts.length ? neighbors(m) : []
      };
      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + TOKEN }, payload: JSON.stringify(payload)
      });
      const code = res.getResponseCode();
      // 422 = ZIPのパスワードがまだ見つからない(パスワードのメールが後から届くことがある)→ 次回やり直す
      if (code !== 200) { ok = false; stat.pending++; console.log(m.getSubject() + ' : ' + code + ' ' + res.getContentText().slice(0, 300)); }
      else stat.sent++;
    });
    if (ok) th.addLabel(done);
  });
}

// 添付メールの前後1通(同じ差出人)と、同じ時間帯のパスワード通知メール
function neighbors(m) {
  const from = (m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1].trim();
  const t = m.getDate().getTime(), day = 864e5;
  const fmt = function (d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd'); };
  const q = 'from:' + from + ' after:' + fmt(new Date(t - day)) + ' before:' + fmt(new Date(t + 2 * day));
  const list = [], seen = {};
  GmailApp.search(q, 0, 30).forEach(function (th) {
    th.getMessages().forEach(function (x) { if (!seen[x.getId()]) { seen[x.getId()] = 1; list.push(x); } });
  });
  list.sort(function (a, b) { return a.getDate() - b.getDate(); });
  const i = list.findIndex(function (x) { return x.getId() === m.getId(); });
  const pick = [];
  if (i >= 0 && list[i + 1]) pick.push(list[i + 1]);
  if (i > 0) pick.push(list[i - 1]);
  list.forEach(function (x) {
    if (x.getId() !== m.getId() && pick.indexOf(x) < 0 && /パスワード|password|PW|解凍/i.test(x.getSubject() + x.getPlainBody().slice(0, 500))) pick.push(x);
  });
  return pick.slice(0, 6).map(function (x) { return { subject: x.getSubject(), body: x.getPlainBody().slice(0, 8000) }; });
}
