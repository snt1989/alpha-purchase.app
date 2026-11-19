/* アルファパーチェス案件管理 - インストール用の最小Service Worker
   データ(/api)は一切キャッシュしない。画面の本体だけ、オフライン時の表示用に保存する。 */
const CACHE = "ap-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/icons/icon-192.png"])).catch(() => {})); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put("/", cp)); return res; }).catch(() => caches.match("/").then((m) => m || new Response("オフラインです。ネットワークに接続してから開き直してください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))));
  }
});
