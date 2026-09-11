/* Ponto de entrada: abre o banco, aplica o tema, registra o service worker e
 * despacha a rota atual. A navegacao e por hash (#/exercicios/12) porque isso
 * funciona igual no GitHub Pages, em subpasta, e na origem local do WebView
 * nativo do Capacitor — sem nenhuma configuracao de servidor. */

import {
  $, initSheet, openSheet, closeSheet, html, raw, node, refresh, ICON, listInCard,
  applyGroupTokens,
} from './ui.js';
import { t, tn } from './i18n.js';
import * as db from './db.js';
import { precacheMedia } from './media.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as history from './views/history.js';
import * as progress from './views/progress.js';
import * as exercise from './views/exercise.js';
import * as picker from './views/exercise-picker.js';
import * as catalog from './views/catalog.js';
import * as templates from './views/templates.js';
import * as groups from './views/groups.js';
import * as settings from './views/settings.js';
import * as profile from './views/profile.js';
import * as backup from './views/backup.js';
import * as bodyWeight from './views/body-weight.js';

const ROUTES = [
  [/^\/?$/, (view) => home.render(view)],
  [/^\/sessao$/, (view) => session.render(view)],
  // A aba Treino corta a lista nos 5 mais recentes; /historico e o resto
  // dela. Nao ganha aba: o TABS abaixo mantem os dois sob a do Treino.
  [/^\/historico$/, (view) => history.renderList(view)],
  [/^\/historico\/(\d+)$/, (view, id) => history.renderWorkout(view, Number(id))],
  [/^\/progresso$/, (view) => progress.render(view)],
  // Grupo muscular sem acento no hash, pelo mesmo motivo do slug do catalogo.
  [/^\/progresso\/([a-z0-9-]+)$/, (view, slug) => progress.renderGroup(view, slug)],
  [/^\/exercicios$/, (view) => exercise.renderList(view)],
  // /grupo/ no meio, e nao /exercicios/<slug> direto: um grupo que a pessoa
  // chame de "123" viraria slug numerico e cairia na rota do id acima.
  [/^\/exercicios\/grupo\/([a-z0-9-]+)$/, (view, slug) => exercise.renderGroup(view, slug)],
  [/^\/exercicios\/(\d+)$/, (view, id) => exercise.renderDetail(view, Number(id))],
  [/^\/exercicios\/(\d+)\/editar$/, (view, id) => exercise.renderEdit(view, Number(id))],
  // Escolher exercicio pra um treino — do treino em andamento ou da edicao
  // de um treino do historico; nos dois casos e "por o exercicio no treino T".
  [/^\/treino\/(\d+)\/adicionar$/, (view, id) => picker.render(view, Number(id))],
  [/^\/modelos$/, (view) => templates.renderList(view)],
  [/^\/modelos\/(\d+)$/, (view, id) => templates.renderDetail(view, Number(id))],
  [/^\/modelos\/(\d+)\/adicionar$/, (view, id) => picker.renderForTemplate(view, Number(id))],
  // Sem ambiguidade com /exercicios/(\d+): la o parametro e o id numerico do
  // banco, aqui e o slug do catalogo.
  // A lista do catalogo virou a busca de #/exercicios. A rota sobrevive porque
  // pode estar salva num link antigo.
  [/^\/catalogo$/, () => { location.hash = '#/exercicios'; }],
  [/^\/catalogo\/([a-z0-9-]+)$/, (view, slug) => catalog.renderDetail(view, slug)],
  // Grupos entram pelo Progresso, que e onde a lista deles ja aparece.
  [/^\/grupos$/, (view) => groups.renderList(view)],
  [/^\/perfil$/, (view) => profile.render(view)],
  // Rota com o nome antigo de proposito: /ajustes nunca aparece como rotulo e
  // trocar o hash quebraria link salvo de quem ja usa o app.
  [/^\/ajustes$/, (view) => settings.render(view)],
  [/^\/backup$/, (view) => backup.render(view)],
  [/^\/peso$/, (view) => bodyWeight.render(view)],
];

const TABS = [
  [/^\/(sessao)?$/, 'workout'],
  // Modelo nao tem aba propria: mora atras do Treino, que e onde ele vira
  // treino de verdade — a folha do botao de treinar ja o usa.
  [/^\/modelos/, 'workout'],
  // O detalhe de um treino continua sob /historico/<id>, mas a aba dele e a
  // Treino: e de la que a lista de treinos sai.
  [/^\/historico/, 'workout'],
  // Biblioteca e catalogo tambem nao tem: sao manutencao de umas poucas vezes
  // na vida, e vivem atras da lupa do Progresso.
  [/^\/progresso/, 'progress'],
  // Biblioteca, catalogo e grupos sao uma aba so: o vocabulario do treino.
  [/^\/(exercicios|catalogo|grupos)/, 'library'],
  // Perfil e tudo que mora atras dele: configuracoes, backup e peso corporal.
  [/^\/(perfil|ajustes|backup|peso)/, 'profile'],
];

function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

function highlightTab(path) {
  const active = TABS.find(([re]) => re.test(path))?.[1];
  for (const item of document.querySelectorAll('.tabbar__item')) {
    if (item.dataset.tab === active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

async function updateFab() {
  const fab = $('#fab-workout');
  const active = await db.getActiveWorkout();
  fab.disabled = false;
  fab.classList.toggle('is-active', !!active);
  fab.setAttribute('aria-label', active ? t('app.fab.resume') : t('app.fab.start'));
}

function initFab() {
  const fab = $('#fab-workout');
  fab.onclick = async () => {
    const active = await db.getActiveWorkout();
    if (active) { location.hash = '#/sessao'; return; }

    // So pergunta quando ha o que perguntar: sem modelo montado, o FAB abre um
    // treino vazio direto, como sempre fez.
    const templates = (await db.listTemplates()).filter((tpl) => (tpl.exerciseIds || []).length);
    if (!templates.length) { startWorkout(fab, null); return; }
    openStartSheet(fab, templates);
  };
}

/** `templateId` null = treino livre. O FAB e desabilitado antes do await pra
 *  um toque duplo nao abrir dois treinos; updateFab() reabilita no proximo
 *  render. */
async function startWorkout(fab, templateId) {
  fab.disabled = true;
  if (templateId === null) await db.startWorkout();
  else await db.startWorkoutFromTemplate(templateId);
  location.hash = '#/sessao';
}

function openStartSheet(fab, templates) {
  const option = (label, hint, icon, onPick) => {
    const li = node(html`
      <li class="list__item">
        <button class="list__link" type="button">
          <span class="editor-sec__icon">${raw(icon)}</span>
          <div class="grow">
            <div style="font-weight:650">${label}</div>
            <div class="muted small">${hint}</div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </button>
      </li>
    `);
    li.querySelector('button').onclick = () => { closeSheet(); onPick(); };
    return li;
  };

  openSheet(t('app.start.title'), listInCard([
    option(t('app.start.free'), t('app.start.freeHint'), ICON.plus, () => startWorkout(fab, null)),
    ...templates.map((tpl) => option(
      tpl.name,
      tn('common.exercise', tpl.exerciseIds.length),
      ICON.dumbbell,
      () => startWorkout(fab, tpl.id),
    )),
  ]));
}

let renderToken = 0;

// Pilha de navegacao dentro do app nesta sessao, pra "voltar" (ver voltar()
// em ui.js) retornar pra tela de onde a pessoa realmente veio, em vez do
// destino fixo hardcoded em cada setTop({back}). Mantida por nos mesmos, nao
// pelo historico real do navegador: popstate nao e sinal confiavel de "essa
// troca de hash foi um voltar" (neste Chrome ele dispara tambem numa
// atribuicao direta de location.hash) — entao so empilha quando a navegacao
// NAO veio do nosso proprio botao voltar (`isGoingBack`, setado bem antes de
// disparar o hashchange que o consome).
let previousPath = null;
const backStack = [];
let isGoingBack = false;

async function router() {
  const path = currentPath();
  const route = ROUTES.find(([re]) => re.test(path));

  if (!route) { location.hash = '#/'; return; }

  // Ignora refresh-in-place (app:refresh chama router() com o mesmo path) e
  // trata o primeiro render do boot como base, sem empilhar.
  if (previousPath !== null && path !== previousPath && !isGoingBack) {
    backStack.push(previousPath);
  }
  isGoingBack = false;
  previousPath = path;

  const token = ++renderToken;
  closeSheet();
  highlightTab(path);
  updateFab();

  const view = $('#view');
  const [, handler] = route;
  const params = route[0].exec(path).slice(1);

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
      <h2>${t('app.error.title')}</h2>
      <p class="muted small">${err?.message || String(err)}</p>
      <button class="btn btn--block" onclick="location.reload()">${t('app.error.reload')}</button>
    </div>
  `;
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') root.dataset.theme = 'light';
  else if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
}

/** Aplica o idioma ativo na casca estatica do app.js (www/index.html) — a
 *  unica parte da tela que nao e reconstruida a cada render de view. Chamada
 *  no boot e sempre que 'language:changed' dispara. Le o idioma atual via t(), em
 *  vez de receber como parametro, porque quem dispara o evento ja gravou o
 *  valor novo em db.js antes de disparar. */
function applyStaticLanguage() {
  document.documentElement.lang = t('app.htmlLang');
  for (const tab of ['workout', 'progress', 'library', 'profile']) {
    const span = document.querySelector(`.tabbar__item[data-tab="${tab}"] span`);
    if (span) span.textContent = t(`app.tab.${tab}`);
  }
  $('#topbar-back')?.setAttribute('aria-label', t('app.back'));
  document.querySelector('#sheet button[data-close-sheet]')?.setAttribute('aria-label', t('common.close'));
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.metaDescription'));
}

window.addEventListener('theme:changed', (e) => applyTheme(e.detail));
window.addEventListener('language:changed', () => { applyStaticLanguage(); refresh(); });

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
  initFab();
  window.addEventListener('hashchange', router);
  window.addEventListener('app:refresh', router);
  window.addEventListener('app:voltar', (e) => {
    if (backStack.length) {
      isGoingBack = true;
      location.hash = backStack.pop();
    } else {
      location.hash = e.detail;
    }
  });

  try {
    await db.init();
    await db.getSettings();
  } catch (err) {
    console.error(err);
    $('#view').append(node(html`
      <div class="card card__pad">
        <h2>${t('app.dbError.title')}</h2>
        <p class="muted small">${err?.message || String(err)}</p>
        <p class="muted small">${t('app.dbError.privateTab')}</p>
      </div>
    `));
    return;
  }

  applyTheme(db.settings().theme);
  // Antes do primeiro render: a cor de cada grupo agora e dado, e toda tela
  // pinta alguma coisa com ela. `applyGroupTokens` escreve os --m-* por cima
  // dos de styles.css, que ficaram sendo so o valor inicial.
  await db.listGroups();
  applyGroupTokens();
  applyStaticLanguage();
  await router();
  await registerServiceWorker();
  requestPersistence();
  // Depois da tela pronta: baixar figuras nunca deve atrasar o primeiro render.
  precacheMedia().catch(() => {});
}

boot();
