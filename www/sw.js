/* Service worker do Treino.
 *
 * Objetivo: o app abrir e funcionar 100% offline depois da primeira visita —
 * na academia o sinal costuma ser ruim, e no iPhone o app so fica isento da
 * limpeza de dados do Safari quando esta instalado na tela de inicio.
 *
 * Estrategia:
 *   - navegacao (abrir o app): rede primeiro, cache como reserva. Garante que
 *     uma versao nova seja pega assim que houver conexao.
 *   - demais arquivos: cache primeiro + revalidacao em segundo plano.
 * Todos os caminhos sao relativos para funcionar tanto em /usuario/repo/ do
 * GitHub Pages quanto na origem local do WebView nativo.
 */

const VERSION = 'treino-v1';

// Em desenvolvimento o cache atrapalha mais do que ajuda: uma alteracao de CSS
// so apareceria na segunda recarga. Em localhost o SW fica em modo transparente.
// 127.0.0.1 fica de fora de proposito: e por onde se testa o comportamento real
// de cache/offline sem precisar publicar.
const DEV = self.location.hostname === 'localhost';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/db.js',
  './js/models.js',
  './js/seed.js',
  './js/backup.js',
  './js/charts.js',
  './js/views/home.js',
  './js/views/session.js',
  './js/views/exercise.js',
  './js/views/history.js',
  './js/views/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  if (DEV) { self.skipWaiting(); return; }
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll aborta tudo se um item falhar; adiciona um a um para o SW
    // sobreviver a um asset ausente durante o desenvolvimento.
    await Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (DEV) return;

  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
