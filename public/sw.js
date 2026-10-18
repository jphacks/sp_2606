/* CoStep network-only worker. Never persist application pages or user data. */
const OFFLINE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CoStep | オフライン</title><style>body{font-family:system-ui,sans-serif;background:#f5f7fb;color:#243248;display:grid;place-content:center;min-height:90vh;margin:24px}main{max-width:360px}h1{font-size:28px}p{line-height:1.8}a{display:inline-block;background:#2459c9;color:white;padding:14px 20px;border-radius:12px;text-decoration:none}</style></head><body><main><h1>CoStep</h1><h2>インターネットに接続してください</h2><p>学習記録やメッセージの表示・保存には通信が必要です。接続後にもう一度開いてください。</p><a href="/">もう一度開く</a></main></body></html>`;
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // API, Auth, images, RSC and mutations always go straight to the network.
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname !== '/') return;
  event.respondWith(fetch(request).catch(() => new Response(OFFLINE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' },
  })));
});
