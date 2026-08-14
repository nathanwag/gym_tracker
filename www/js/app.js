/* Ponto de entrada: abre o banco, aplica o tema, registra o service worker e
 * despacha a rota atual. A navegacao e por hash (#/exercicios/12) porque isso
 * funciona igual no GitHub Pages, em subpasta, e na origem local do WebView
 * nativo do Capacitor — sem nenhuma configuracao de servidor. */

import { $, initSheet, closeSheet, html, node } from './ui.js';
import * as db from './db.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as history from './views/history.js';
import * as exercise from './views/exercise.js';
import * as settings from './views/settings.js';

const ROUTES = [
  [/^\/?$/, (view) => home.render(view)],
  [/^\/sessao$/, (view) => session.render(view)],
  [/^\/historico$/, (view) => history.render(view)],
  [/^\/historico\/(\d+)$/, (view, id) => history.renderWorkout(view, Number(id))],
  [/^\/exercicios$/, (view) => exercise.renderList(view)],
  [/^\/exercicios\/(\d+)$/, (view, id) => exercise.renderDetail(view, Number(id))],
  [/^\/ajustes$/, (view) => settings.render(view)],
];

const TABS = [
  [/^\/(sessao)?$/, 'treino'],
  [/^\/historico/, 'historico'],
  [/^\/exercicios/, 'exercicios'],
  [/^\/ajustes/, 'ajustes'],
];

function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

function highlightTab(path) {
  const ativa = TABS.find(([re]) => re.test(path))?.[1];
  for (const item of document.querySelectorAll('.tabbar__item')) {
    if (item.dataset.tab === ativa) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

let renderToken = 0;

async function router() {
  const path = currentPath();
  const rota = ROUTES.find(([re]) => re.test(path));

  if (!rota) { location.hash = '#/'; return; }

  const token = ++renderToken;
  closeSheet();
  highlightTab(path);

  const view = $('#view');
  const [, handler] = rota;
  const params = rota[0].exec(path).slice(1);

  try {
    view.innerHTML = '';
    await handler(view, ...params);
  } catch (err) {
    console.error(err);
    if (token === renderToken) showError(view, err);
  }

  // Uma navegacao mais nova pode ter comecado enquanto esta carregava.
  if (token !== renderToken) return;
  window.scrollTo(0, 0);
}

function showError(view, err) {
  view.innerHTML = html`
    <div class="card card__pad">
      <h2>Algo deu errado</h2>
      <p class="muted small">${err?.message || String(err)}</p>
      <button class="btn btn--block" onclick="location.reload()">Recarregar</button>
    </div>
  `;
}

function applyTheme(tema) {
  const root = document.documentElement;
  if (tema === 'claro') root.dataset.theme = 'light';
  else if (tema === 'escuro') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
}

window.addEventListener('tema:mudou', (e) => applyTheme(e.detail));

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Origem insegura (teste por IP na rede local) nao registra service worker —
  // no iOS isso e regra, entao o teste de instalacao precisa ser via HTTPS.
  if (!window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('Service worker nao registrado:', err);
  }
}

async function requestPersistence() {
  // O Safari nao implementa storage.persist(); a chamada e defensiva e o app
  // nao depende do resultado. No iOS o que de fato protege os dados da limpeza
  // e o app estar instalado na tela de inicio.
  try { await navigator.storage?.persist?.(); } catch { /* sem suporte */ }
}

async function boot() {
  initSheet();
  window.addEventListener('hashchange', router);
  window.addEventListener('app:refresh', router);

  try {
    await db.init();
    await db.getSettings();
  } catch (err) {
    console.error(err);
    $('#view').append(node(html`
      <div class="card card__pad">
        <h2>Nao foi possivel abrir o banco de dados</h2>
        <p class="muted small">${err?.message || String(err)}</p>
        <p class="muted small">Se estiver numa aba privada do Safari, abra o app numa aba normal.</p>
      </div>
    `));
    return;
  }

  applyTheme(db.settings().tema);
  await router();
  registerServiceWorker();
  requestPersistence();
}

boot();
