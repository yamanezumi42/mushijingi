// 蟲神器 対戦（スマホ）の Service Worker
// ・入れ物（このフォルダの index.html など）は、ネットがあれば最新を取り、なければ保存した物を使う
// ・中身（app/ の下：ゲーム本体・絵・曲・声）は、取り込んだ時に端末へ保存した物だけを返す（ネットには取りに行かない）
// ・iPhoneのSafariは曲や声を「途中から（Range）」で読みに来るので、その形でも返す
const SHELL = 'mj-shell-v3', PACK = 'mj-pack';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())) });
// 古い入れ物の置き場は消す（2026-10-24 古い index.html が出続けた）
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mj-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const base = new URL('./', self.registration.scope).pathname, appBase = base + 'app/';
  if (u.pathname.startsWith(appBase)) { e.respondWith(fromPack(e.request, u, appBase)); return }
  if (e.request.method !== 'GET') return;
  // 入れ物はいつもネットの最新を取る（取れない時＝圏外だけ、保存した物）。
  //   画面を開く時の要求（navigate）をそのまま使うと取れない端末があり、保存した古い入れ物が出続けた（2026-10-24）→ URL の文字だけで取り直す
  const url = u.origin + u.pathname;
  e.respondWith(fetch(url, {cache:'no-store', credentials:'same-origin'}).then(r => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then(s => s.put(url, c)) } return r })
    .catch(() => caches.match(url, {ignoreSearch:true}).then(r => r || caches.match(e.request, {ignoreSearch:true}))));
});
const base0 = () => new URL('./', self.registration.scope).pathname;
async function fromPack(req, u, appBase){
  let path = decodeURIComponent(u.pathname.slice(appBase.length)); if (!path) path = 'index.html';
  const c = await caches.open(PACK), hit = await c.match(new Request(appBase + encodeURI(path)), {ignoreSearch:true});
  // 取り込む前のアイコンは、入れ物の自前のアイコンを返す
  if (!hit && /^icon-\d+\.png$/.test(path)) return (await caches.match(base0() + 'icon-512.png')) || fetch(base0() + 'icon-512.png');
  if (!hit) return new Response('データがありません：' + path, {status:404, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  const range = req.headers.get('range');
  if (!range) return hit;
  const blob = await hit.blob(), m = /bytes=(\d*)-(\d*)/.exec(range), size = blob.size;
  let a = m && m[1] !== '' ? +m[1] : 0, b = m && m[2] !== '' ? +m[2] : size - 1;
  if (m && m[1] === '' && m[2] !== '') { a = size - +m[2]; b = size - 1 }
  b = Math.min(b, size - 1);
  return new Response(blob.slice(a, b + 1), {status:206, headers:{'Content-Type':hit.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Range':`bytes ${a}-${b}/${size}`, 'Content-Length':String(b - a + 1), 'Accept-Ranges':'bytes'}});
}
