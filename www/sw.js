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

const VERSION = 'anilha-v26';

// Dois caches de proposito. O do app e versionado e descartavel: bumpar VERSION
// e como se deploya. O de midia NAO e versionado — sao dezenas de MB de fotos
// que o usuario baixou aos poucos, e joga-las fora a cada atualizacao seria
// inaceitavel na academia sem sinal. O Set existe para o dia do segundo cache
// permanente: filtrar por duas constantes soltas e o tipo de linha que alguem
// "simplifica" e volta a apagar as fotos.
const APP_CACHE = VERSION;
// js/media.js guarda uma copia desta constante para o lado da pagina (service
// worker classico, sem `type: 'module'`, nao pode importar daqui) — as duas
// strings precisam continuar iguais.
const MEDIA_CACHE = 'workout-media';
const PERMANENT = new Set([MEDIA_CACHE]);

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
  './fonts/manrope-variable.woff2',
  './fonts/barlow-condensed-600.woff2',
  './fonts/barlow-condensed-700.woff2',
  './fonts/barlow-condensed-800.woff2',
  './js/app.js',
  './js/ui.js',
  './js/i18n.js',
  './js/i18n-strings.js',
  './js/text.js',
  './js/db.js',
  './js/models.js',
  './js/seed.js',
  './js/backup.js',
  './js/share-image.js',
  './js/charts.js',
  './js/curve.js',
  './js/catalog.js',
  './js/media.js',
  './js/set-composer.js',
  './js/views/home.js',
  './js/views/session.js',
  './js/views/exercise-picker.js',
  './js/views/exercise.js',
  './js/views/catalog.js',
  './js/views/history.js',
  './js/views/settings.js',
  // O catalogo entra no precache para a busca funcionar offline. As 873
  // miniaturas NAO entram: 873 cache.add em paralelo num 3G de academia demora
  // minutos, e se o install falhar o app perde o offline inteiro. Elas sao
  // baixadas depois, em lotes, a pedido da pagina (ver 'precache-media').
  './data/catalogo.json',
  './data/instrucoes.json',
  './img/ex/manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  if (DEV) { self.skipWaiting(); return; }
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // addAll aborta tudo se um item falhar; adiciona um a um para o SW
    // sobreviver a um asset ausente durante o desenvolvimento.
    await Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== APP_CACHE && !PERMANENT.has(k))
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') { self.skipWaiting(); return; }

  if (event.data?.type === 'precache-media') {
    event.waitUntil(precacheMedia(event.data.urls || [], event.source));
  }
});

/** Baixa figuras para o cache permanente, em lotes.
 *
 *  Quem decide quando isto roda e a pagina, nao o activate: ela sabe se a
 *  conexao e celular ou se o usuario pediu economia de dados, e assim o
 *  download nunca atrasa a ativacao do service worker.
 *
 *  Lotes de 24 porque centenas de requisicoes simultaneas travam a rede da
 *  pagina inteira no celular. */
async function precacheMedia(urls, client) {
  const cache = await caches.open(MEDIA_CACHE);

  // Uma chamada a keys() e um Set: 873 cache.match() seriam ordens de grandeza
  // mais caros.
  const existing = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const missing = urls.filter((u) => !existing.has(new URL(u, self.location.href).pathname));

  let done = 0;
  for (let i = 0; i < missing.length; i += 24) {
    const batch = missing.slice(i, i + 24);
    await Promise.all(batch.map((u) => cache.add(u).catch(() => {})));
    done += batch.length;
    client?.postMessage({ type: 'precache-media:progress', done, total: missing.length });
  }

  client?.postMessage({ type: 'precache-media:done', total: missing.length });
}

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
        const cache = await caches.open(APP_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Figuras dos exercicios. Este ramo TEM de vir antes do generico: la embaixo
  // toda resposta same-origin vai parar no cache versionado, e as fotos
  // sumiriam no proximo deploy — um sintoma intermitente e dificil de rastrear.
  //
  // includes() em vez de caminho relativo ao escopo para funcionar igual em
  // /usuario/repo/ do Pages e na origem local do WebView.
  if (url.pathname.includes('/img/ex/')) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(req);
      // Cache-first sem revalidacao: foto e conteudo imutavel, e o ramo
      // generico dispararia rede a cada acerto — dados queimados a toa.
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        // Aciona o onerror da <img>, que revela o icone do grupo por tras.
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) caches.open(APP_CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
