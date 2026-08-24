/* Ponto de entrada: abre o banco, aplica o tema, registra o service worker e
 * despacha a rota atual. A navegacao e por hash (#/exercicios/12) porque isso
 * funciona igual no GitHub Pages, em subpasta, e na origem local do WebView
 * nativo do Capacitor — sem nenhuma configuracao de servidor. */

import { $, initSheet, closeSheet, html, node, refresh } from './ui.js';
import { t } from './i18n.js';
import * as db from './db.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as history from './views/history.js';
import * as exercise from './views/exercise.js';
import * as catalog from './views/catalog.js';
import * as settings from './views/settings.js';

const ROUTES = [
  [/^\/?$/, (view) => home.render(view)],
  [/^\/sessao$/, (view) => session.render(view)],
  [/^\/historico$/, (view) => history.render(view)],
  [/^\/historico\/(\d+)$/, (view, id) => history.renderWorkout(view, Number(id))],
  [/^\/exercicios$/, (view) => exercise.renderList(view)],
  [/^\/exercicios\/(\d+)$/, (view, id) => exercise.renderDetail(view, Number(id))],
  // Sem ambiguidade com /exercicios/(\d+): la o parametro e o id numerico do
  // banco, aqui e o slug do catalogo.
  [/^\/catalogo$/, (view) => catalog.renderList(view)],
  [/^\/catalogo\/([a-z0-9-]+)$/, (view, slug) => catalog.renderDetail(view, slug)],
  [/^\/ajustes$/, (view) => settings.render(view)],
];

const TABS = [
  [/^\/(sessao)?$/, 'treino'],
  [/^\/historico/, 'historico'],
  // O catalogo nao tem aba propria: a tabbar de 4 ja esta no limite confortavel
  // de toque. Ele vive dentro de Exercicios e mantem essa aba acesa.
  [/^\/(exercicios|catalogo)/, 'exercicios'],
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

async function atualizarFab() {
  const fab = $('#fab-treino');
  const ativo = await db.getActiveWorkout();
  fab.disabled = false;
  fab.classList.toggle('is-ativo', !!ativo);
  fab.setAttribute('aria-label', ativo ? t('app.fab.retomar') : t('app.fab.iniciar'));
}

function initFab() {
  const fab = $('#fab-treino');
  fab.onclick = async () => {
    const ativo = await db.getActiveWorkout();
    if (!ativo) {
      fab.disabled = true;
      await db.startWorkout();
    }
    location.hash = '#/sessao';
  };
}

let renderToken = 0;

async function router() {
  const path = currentPath();
  const rota = ROUTES.find(([re]) => re.test(path));

  if (!rota) { location.hash = '#/'; return; }

  const token = ++renderToken;
  closeSheet();
  highlightTab(path);
  atualizarFab();

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
      <h2>${t('app.erro.titulo')}</h2>
      <p class="muted small">${err?.message || String(err)}</p>
      <button class="btn btn--block" onclick="location.reload()">${t('app.erro.recarregar')}</button>
    </div>
  `;
}

function applyTheme(tema) {
  const root = document.documentElement;
  if (tema === 'claro') root.dataset.theme = 'light';
  else if (tema === 'escuro') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
}

/** Aplica o idioma ativo na casca estatica do app.js (www/index.html) — a
 *  unica parte da tela que nao e reconstruida a cada render de view. Chamada
 *  no boot e sempre que 'idioma:mudou' dispara. Le o idioma atual via t(), em
 *  vez de receber como parametro, porque quem dispara o evento ja gravou o
 *  valor novo em db.js antes de disparar. */
function aplicarIdiomaEstatico() {
  document.documentElement.lang = t('app.htmlLang');
  for (const tab of ['treino', 'historico', 'exercicios', 'ajustes']) {
    const span = document.querySelector(`.tabbar__item[data-tab="${tab}"] span`);
    if (span) span.textContent = t(`app.tab.${tab}`);
  }
  $('#topbar-back')?.setAttribute('aria-label', t('app.voltar'));
  document.querySelector('#sheet button[data-close-sheet]')?.setAttribute('aria-label', t('common.fechar'));
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.metaDescricao'));
}

window.addEventListener('tema:mudou', (e) => applyTheme(e.detail));
window.addEventListener('idioma:mudou', () => { aplicarIdiomaEstatico(); refresh(); });

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

/** Pede ao service worker que baixe as miniaturas do catalogo.
 *
 *  Roda so uma vez por versao do catalogo, e so quando a conexao permite: sao
 *  ~2 MB, o que e barato no wi-fi e caro no celular. Quem quiser forcar tem o
 *  botao em Ajustes. */
export async function precacheMidia({ forcar = false } = {}) {
  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  if (!reg?.active) return false;

  const conexao = navigator.connection;
  if (!forcar && (conexao?.saveData || conexao?.type === 'cellular')) return false;

  let manifesto;
  try {
    manifesto = await (await fetch('./img/ex/manifest.json')).json();
  } catch {
    return false;
  }

  if (!forcar && db.settings().midiaPrecacheVersao === manifesto.versao) return false;

  reg.active.postMessage({
    tipo: 'precache-midia',
    urls: manifesto.slugs.map((slug) => `./img/ex/thumb/${slug}.webp`),
  });
  await db.setSetting('midiaPrecacheVersao', manifesto.versao);
  return true;
}

async function requestPersistence() {
  // O Safari nao implementa storage.persist(); a chamada e defensiva e o app
  // nao depende do resultado. No iOS o que de fato protege os dados da limpeza
  // e o app estar instalado na tela de inicio.
  try { await navigator.storage?.persist?.(); } catch { /* sem suporte */ }
}

async function boot() {
  initSheet();
  initFab();
  window.addEventListener('hashchange', router);
  window.addEventListener('app:refresh', router);

  try {
    await db.init();
    await db.getSettings();
  } catch (err) {
    console.error(err);
    $('#view').append(node(html`
      <div class="card card__pad">
        <h2>${t('app.bancoErro.titulo')}</h2>
        <p class="muted small">${err?.message || String(err)}</p>
        <p class="muted small">${t('app.bancoErro.abaPrivada')}</p>
      </div>
    `));
    return;
  }

  applyTheme(db.settings().tema);
  aplicarIdiomaEstatico();
  await router();
  await registerServiceWorker();
  requestPersistence();
  // Depois da tela pronta: baixar figuras nunca deve atrasar o primeiro render.
  precacheMidia().catch(() => {});
}

boot();
