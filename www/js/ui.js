/* Helpers de interface compartilhados pelas telas: montagem de HTML seguro,
 * topbar, toast, bottom sheet e formatacao de numeros e datas conforme o
 * idioma ativo (ver i18n.js). */

import { t, tn, locale } from './i18n.js';
import {
  isDurationSet, isUnilateralSet, setE1rm, workoutGroupBreakdown, workoutSummary,
} from './models.js';
import { groupBy, groupLabel } from './seed.js';

/** Nome do app. Nao passa por t(): e nome proprio, igual nos dois idiomas. */
export const APP_NAME = 'Anilha';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Pede ao app.js para renderizar a rota atual de novo. Um evento evita que as
 *  telas importem app.js (que importa as telas) e criem um ciclo de modulos. */
export const refresh = () => window.dispatchEvent(new Event('app:refresh'));

/** Pede ao app.js pra voltar: se a navegacao atual tiver historico de
 *  verdade dentro do app nesta sessao, volta pra tela anterior real (de onde
 *  a pessoa veio); senao cai no destino fixo `fallback`. Evento pelo mesmo
 *  motivo de refresh() acima — sem ciclo de modulos com app.js. */
export const goBack = (fallback) => window.dispatchEvent(new CustomEvent('app:voltar', { detail: fallback }));

/* ---------- HTML seguro ----------
 * Nomes de exercicio e notas sao digitados pelo usuario, entao toda
 * interpolacao e escapada por padrao. Use raw() para injetar HTML de proposito. */

const RAW = Symbol('raw');

export function raw(value) {
  return { [RAW]: String(value) };
}

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && RAW in value) return value[RAW];
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return out;
}

/** Converte uma string de HTML no elemento correspondente. */
export function node(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}

/* ---------- Topbar ---------- */

/**
 * @param {{title: string, back?: string|null, actions?: string, showBar?: boolean}} opts
 *   back = rota (hash) do botao voltar; ausente esconde o botao.
 *   showBar = false esconde a barra inteira; hoje so a tela de exercicio usa
 *   isso, pra foto poder sangrar ate o topo (ver heroPhoto em exercise.js). O
 *   titulo da aba do navegador continua sendo definido normalmente.
 */
export function setTop({
  title, back = null, actions = '', showBar = true,
}) {
  const topbarEl = $('#topbar');
  const titleEl = $('#topbar-title');
  const backEl = $('#topbar-back');
  const actionsEl = $('#topbar-actions');

  titleEl.textContent = title;
  document.title = title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`;
  backEl.hidden = !back;
  backEl.onclick = back ? () => goBack(back) : null;
  actionsEl.innerHTML = actions;

  topbarEl.hidden = !showBar;
  $('#view').classList.toggle('view--no-topbar', !showBar);

  return actionsEl;
}

/* ---------- Toast ---------- */

let toastTimer = null;

export function toast(message, ms = 2200) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- Bottom sheet ---------- */

let sheetOnClose = null;

/** Registra um callback pra ser chamado na proxima vez que o sheet fechar
 *  (por qualquer via: backdrop, X, Escape ou closeSheet() direto). Usado por
 *  quem abre um sheet fora de confirmSheet() e precisa saber quando ele
 *  fecha (ver share-image.js). */
export function onSheetClose(cb) { sheetOnClose = cb; }

export function openSheet(title, content) {
  const sheet = $('#sheet');
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.innerHTML = '';
  body.append(typeof content === 'string' ? node(`<div>${content}</div>`) : content);
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  return body;
}

export function closeSheet() {
  const sheet = $('#sheet');
  if (sheet.hidden) return;
  sheet.hidden = true;
  document.body.style.overflow = '';
  const cb = sheetOnClose;
  sheetOnClose = null;
  if (cb) cb();
}

export function initSheet() {
  $('#sheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close-sheet]')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });
}

/**
 * Confirmacao em bottom sheet. Evita o confirm() nativo, que no PWA em modo
 * standalone do iOS aparece com o dominio e destoa do resto do app.
 * @returns {Promise<boolean>}
 */
export function confirmSheet({
  title, message = '', confirmLabel = null, danger = false,
}) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };

    const body = openSheet(title, html`
      ${message ? raw(`<p class="muted">${esc(message)}</p>`) : ''}
      <div class="stack" style="margin-top:8px">
        <button class="btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${confirmLabel || t('common.confirm')}</button>
        <button class="btn btn--block btn--ghost" data-no>${t('common.cancel')}</button>
      </div>
    `);

    sheetOnClose = () => finish(false);
    body.querySelector('[data-yes]').onclick = () => { finish(true); closeSheet(); };
    body.querySelector('[data-no]').onclick = () => { finish(false); closeSheet(); };
  });
}

/* ---------- Formatacao ---------- */

/** 60 -> "60"; 62.5 -> "62,5" em pt-BR, "62.5" em en-US. */
export function fmtNum(value, maxDecimals = 1) {
  const n = Number(value) || 0;
  return n.toLocaleString(locale(), { maximumFractionDigits: maxDecimals });
}

export function fmtWeight(value, unit = 'kg') {
  return `${fmtNum(value, 2)} ${unit}`;
}

// Formatters sao recriados a cada chamada (nao memoizados em const de modulo)
// porque o idioma pode mudar em runtime, sem reload — ver idioma:mudou em app.js.
// Numerico (20/08/2026) e nao "20 de ago. de 2026": e a data que aparece em
// lista, onde a versao por extenso ocupa a linha toda. A ORDEM dos campos vem
// do locale — pt-BR da 20/08/2026 e en-US da 08/20/2026.
export const fmtDate = (iso) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
export const fmtDateShort = (iso) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit' }).format(new Date(iso));
export const fmtWeekday = (iso) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(new Date(iso));

/** Ex: "10 de ago. – 16 de ago." (pt) / "Aug 10 – Aug 16" (en). Aceita Date ou string ISO. */
export function fmtDateRange(start, end) {
  const fmt = new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short' });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

/** "Hoje", "Ontem", "ha 3 dias" ou a data cheia.
 *
 *  De uma semana em diante vira data: "ha 3 semanas" nao diz que dia foi, e a
 *  lista de treinos e justamente onde se procura o dia. */
export function fmtRelativeDay(iso) {
  const days = daysBetween(new Date(iso), new Date());
  if (days <= 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 7) return tn('common.daysAgo', days);
  return fmtDate(iso);
}

/** Diferenca em dias de calendario, ignorando horas. */
export function daysBetween(a, b) {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

/** Duracao entre dois ISO em "1h 12min" / "48min". */
export function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  return fmtMinutes(Math.round((new Date(endIso) - new Date(startIso)) / 60000));
}

/** "55min" / "1h 30min" a partir de minutos ja somados — o que fmtDuration
 *  precisa depois de subtrair, e o que o total da semana precisa sem ter dois
 *  instantes pra subtrair (ver gymSeconds em models.js). */
export function fmtMinutes(minutes) {
  const min = Math.max(0, Math.round(Number(minutes) || 0));
  const sufMin = t('common.min');
  if (min < 60) return `${min}${sufMin}`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  const sufHora = t('common.hour');
  return rest ? `${h}${sufHora} ${rest}${sufMin}` : `${h}${sufHora}`;
}

/** Duracao de uma serie de Cardio/Alongamento (segundos) em "12min 30s" /
 *  "45s". Diferente de fmtDuration: aqui a entrada ja e a duracao guardada
 *  na serie, nao dois timestamps ISO pra subtrair. */
export function fmtTempoSerie(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const min = Math.floor(s / 60);
  const rest = s % 60;
  const sufMin = t('common.min');
  const sufSeg = t('common.sec');
  if (min <= 0) return `${rest}${sufSeg}`;
  return rest ? `${min}${sufMin} ${rest}${sufSeg}` : `${min}${sufMin}`;
}

/** Valor de uma serie pra exibir compacto, sem unidade de peso: "20×10"
 *  (peso/reps) ou "12min 30s" (cardio/alongamento). Usado onde varias series
 *  aparecem lado a lado numa mesma linha (comparacao com o treino anterior,
 *  resumo do que ja foi feito). Concentra num lugar so a decisao que antes
 *  se repetia igual em cada tela que lista series. */
export function fmtSet(s) {
  if (isDurationSet(s)) return fmtTempoSerie(s.durationSec);
  if (isUnilateralSet(s)) return `${fmtNum(s.weight, 2)}×${s.repsRight}/${s.repsLeft}`;
  return `${fmtNum(s.weight, 2)}×${s.reps}`;
}

/** Mesma decisao que fmtSet, com unidade de peso e espacada — usado quando
 *  a serie aparece sozinha numa linha (lista de series de um treino). */
export function fmtSetWithUnit(s, unit) {
  if (isDurationSet(s)) return fmtTempoSerie(s.durationSec);
  if (isUnilateralSet(s)) return `${fmtNum(s.weight, 2)} ${unit} × ${s.repsRight}/${s.repsLeft}`;
  return `${fmtNum(s.weight, 2)} ${unit} × ${s.reps}`;
}

/* ---------- Diversos ---------- */

export const ICON = {
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  // Mesmo desenho do botao voltar em index.html — aqui pras telas que escondem
  // a topbar e precisam do proprio botao (ver heroPhoto em exercise.js).
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.8.8-5 4.7 1.3 6.9L12 17.4 6 20.7l1.3-6.9-5-4.7 6.8-.8z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M14.5 7.5l2 2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 20h6M12 14v6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 11l4 4 4-4M4.5 19.5h15"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15.5l-5.2-5.2a2 2 0 00-2.8 0L4.5 19"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2L8.6 6h6.8l1.4 2.5H20a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1v-8a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.5a6.5 6.5 0 106.5 6.5M20.5 20.5l-4.6-4.6"/></svg>',
  steps: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h3M4 12h3M4 17.5h3M10 6.5h10M10 12h10M10 17.5h10"/></svg>',
};

/* ---------- Cor por grupo muscular ----------
 * A chave e o valor gravado no banco (sempre em portugues); o sufixo e o nome
 * da variavel CSS, sem acento. Tem que casar com MUSCLE_GROUPS em seed.js e
 * com os tokens --m-* em styles.css, do mesmo jeito que ICON_GROUPS acima.
 *
 * Devolve `var(--m-x)` em vez do hex: assim a mesma chamada serve nos dois
 * temas, sem a view saber qual esta ativo. */
const GROUP_COLOR_NAMES = {
  'Peito': 'peito',
  'Costas': 'costas',
  'Lombar': 'lombar',
  'Ombros': 'ombros',
  'Trapézio': 'trapezio',
  'Pescoço': 'pescoco',
  'Bíceps': 'biceps',
  'Tríceps': 'triceps',
  'Quadríceps': 'quadriceps',
  'Posterior': 'posterior',
  'Glúteos': 'gluteos',
  'Panturrilha': 'panturrilha',
  'Abdômen': 'abdomen',
  'Antebraço': 'antebraco',
  'Cardio': 'cardio',
  'Alongamento': 'alongamento',
  'Outros': 'outros',
};

export const groupColor = (group) => `var(--m-${GROUP_COLOR_NAMES[group] || 'outros'})`;

/** A barra de assinatura de um treino: uma faixa por grupo, larga na
 *  proporcao das series. E o que faz um dia de perna ser reconhecivel de um
 *  de peito na lista do historico, sem ler uma palavra. */
export function signatureHtml(breakdown) {
  if (!breakdown.length) return '';
  const segs = breakdown
    .map((g) => `<span class="sig__seg" style="flex:${g.sets};background:${groupColor(g.group)}"></span>`)
    .join('');
  return `<span class="sig" aria-hidden="true">${segs}</span>`;
}

/* Icone por grupo muscular: aparece no cabecalho das secoes e no lugar da foto
 * quando o exercicio nao tem figura.
 *
 * Sao pictogramas de regiao do corpo, nao desenhos anatomicos: a 22px um
 * desenho de dorsal vira borrao. Todos partem da mesma silhueta (cabeca, tronco,
 * membros) — a silhueta fica esmaecida e uma mancha cheia na cor de destaque
 * marca a regiao. Um traco fino (versao anterior) sumia entre grupos vizinhos
 * como Ombros/Trapezio; a mancha preenchida da o contraste que faltava sem
 * abandonar o mono-acento do resto do app.
 *
 * Sem fill/stroke inline no traco da silhueta: a regra global de styles.css
 * cuida disso. A mancha e o unico elemento com fill/color explicitos aqui,
 * de proposito — e o que precisa saltar aos olhos.
 */
const BODY_PATH = 'M12 2.6a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2M12 6.4v7M8.4 8.2L12 7l3.6 1.2M8.4 8.2L7 12.4M15.6 8.2L17 12.4M12 13.4l-1.9 8M12 13.4l1.9 8';
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;
// Na cor do proprio grupo, nao em cinza: e a mesma legenda das barras da
// semana, da assinatura no historico e da pastilha no cartao de exercicio, e
// era o ultimo lugar do app que ainda nao a usava. A familia se mantem porque
// silhueta e mancha continuam no mesmo tom — o que separa as duas e a
// opacidade: a silhueta e o andaime, a mancha e a informacao.
const body = (group, ...dots) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor(group)}">`
  + `<path d="${BODY_PATH}" opacity=".62" stroke-width="2.3"/>`
  + `${dots.map((p) => dot(...p)).join('')}</svg>`;

export const ICON_GROUPS = {
  'Peito': body('Peito', [12, 9.1, 1.95]),
  'Costas': body('Costas', [12, 10.6, 1.95]),
  // Abaixo de Costas na silhueta, perto do quadril: hiperextensao/terra e
  // cadeia posterior, nao puxada -- por isso saiu de Costas.
  'Lombar': body('Lombar', [12, 12.9, 1.49]),
  'Ombros': body('Ombros', [8.4, 8.2, 1.49], [15.6, 8.2, 1.49]),
  // Logo abaixo do pescoço, mais estreito que a mancha de Ombros: e onde
  // o trapezio fica na silhueta (base do pescoço ate o topo do ombro).
  'Trapézio': body('Trapézio', [12, 7.5, 1.32]),
  'Pescoço': body('Pescoço', [12, 5.3, 1.15]),
  'Bíceps': body('Bíceps', [6.8, 10.9, 1.38]),
  'Tríceps': body('Tríceps', [17.2, 10.9, 1.38]),
  // Coxa e uma so regiao na silhueta (sem frente/costas pra distinguir
  // quadriceps de posterior); a marca muda de altura — mais alta vs mais
  // baixa na coxa — pra diferenciar os dois icones.
  'Quadríceps': body('Quadríceps', [11.2, 16, 1.49], [12.8, 16, 1.49]),
  'Posterior': body('Posterior', [10.6, 19, 1.21], [13.4, 19, 1.21]),
  'Glúteos': body('Glúteos', [12, 13.9, 1.72]),
  'Panturrilha': body('Panturrilha', [10.2, 20.8, 1.03], [13.8, 20.8, 1.03]),
  'Abdômen': body('Abdômen', [12, 11.2, 1.15], [12, 12.8, 1.15]),
  'Antebraço': body('Antebraço', [6.7, 13.7, 1.26], [17.3, 13.7, 1.26]),
  // Cardio e alongamento nao sao regiao do corpo, entao fogem da familia
  // "silhueta com mancha" e usam glifo proprio -- mas na cor do grupo, igual
  // aos outros, pra familia toda seguir a mesma legenda.
  'Cardio': `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor('Cardio')}"><path d="M3 13h3.5l1.8-5 3.4 10 2.2-9 1.6 4h4.5"/></svg>`,
  'Alongamento': `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor('Alongamento')}"><circle cx="14.5" cy="4.2" r="1.6" fill="currentColor" stroke="none"/><path d="M14.5 5.8l-3 2.4.8 4M11.5 8.2l-4.5 1M12.3 12.2l-2.8 1.5-1 4M12.3 12.2l2 2 .8 4.3"/></svg>`,
  'Outros': `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor('Outros')}"><path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/></svg>`,
};

/** Dia do mes e abreviacao do dia da semana (ou do mes), pro bloco de data da
 *  linha. A lista de treinos usa o dia da semana; a de sessoes de um exercicio
 *  usa o mes, porque ali as datas atravessam meses e "29 QUI" seria ambiguo. */
export const fmtDayNum = (iso) => new Intl.DateTimeFormat(locale(), { day: 'numeric' }).format(new Date(iso));
export const fmtMonthShort = (iso) => new Intl.DateTimeFormat(locale(), { month: 'short' }).format(new Date(iso))
  .replace(/\.$/, '');
const fmtWeekdayShort = (iso) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(iso))
  .replace(/\.$/, '');

/**
 * Uma linha de treino na lista (inicio e historico usam a mesma).
 *
 * O que a linha responde de relance: quando foi, o que treinou e quanto
 * moveu. Os grupos entram duas vezes de proposito — em cor na assinatura e
 * por extenso logo abaixo — porque a cor sozinha nao e acessivel e o texto
 * sozinho nao e reconhecivel a distancia.
 *
 * @param {object} workout treino
 * @param {object[]} sets series daquele treino
 * @param {Map<number, object>} exercisesById exercicios indexados por id
 * @param {{unit: string, prCount?: number, badge?: string}} opts
 */
export function workoutRow(workout, sets, exercisesById, { unit, prCount = 0, badge = '' }) {
  const breakdown = workoutGroupBreakdown(sets, exercisesById);
  const summary = workoutSummary(sets);

  // Tres grupos: o suficiente pra nomear o treino ("Peito · Ombros · Triceps")
  // sem estourar a linha. Os demais continuam visiveis na assinatura em cor.
  const names = breakdown.slice(0, 3).map((g) => groupLabel(g.group)).join(' · ');

  return node(html`
    <a class="hrow" href="#/historico/${workout.id}">
      <span class="hrow__day">
        <span class="hrow__num">${fmtDayNum(workout.startedAt)}</span>
        <span class="hrow__wd">${fmtWeekdayShort(workout.startedAt)}</span>
      </span>
      <span class="hrow__mid">
        ${raw(signatureHtml(breakdown))}
        <span class="hrow__groups">${names || tn('common.set', summary.sets)}</span>
      </span>
      <span class="hrow__end">
        <span class="hrow__vol">${fmtNum(summary.volume, 0)}</span>
        <span class="hrow__meta">
          <span class="hrow__unit">${unit}</span>
          ${prCount ? raw(`<span class="badge badge--pr">${tn('common.pr', prCount)}</span>`) : ''}
          ${raw(badge)}
        </span>
      </span>
    </a>
  `);
}

/* ---------- Livro-razao das series ----------
 * Peso e reps em colunas em vez de uma frase por linha: e a forma nativa do
 * dado (e a mesma da ficha de papel), e faz quatro series virarem quatro
 * linhas comparaveis de relance.
 *
 * Mora aqui porque a sessao e o detalhe de um treino no historico mostram a
 * MESMA tabela — muda so quem pode tocar nela e se ha uma linha fantasma no
 * fim. Duas copias divergiriam no primeiro ajuste de coluna. */

/** Cabecalho de uma serie na coluna do numero: aquecimento nao entra na
 *  numeracao, porque "A, 1, 2, 3" diz quantas valendo foram feitas — o que
 *  "1, 2, 3, 4" escondia. */
function setNumbers(sets) {
  let n = 0;
  return sets.map((s) => {
    if (s.warmup) return t('session.led.warmupShort');
    n += 1;
    return n;
  });
}

/** Quantas series valendo ja existem — e o numero que a linha fantasma usa. */
export const workingCount = (sets) => sets.filter((s) => !s.warmup).length;

function ledgerCells(set) {
  // Cardio/alongamento nao tem peso nem reps: a duracao ocupa as tres colunas.
  if (isDurationSet(set)) {
    return html`<span class="led__v" style="grid-column:2 / 5">${fmtSet(set)}</span>`;
  }
  return html`
    <span class="led__v">${fmtNum(set.weight, 2)}</span>
    <span class="led__v">${isUnilateralSet(set) ? `${set.repsRight}/${set.repsLeft}` : set.reps}</span>
    <span class="led__1rm">${set.warmup ? '' : fmtNum(setE1rm(set), 0)}</span>
  `;
}

/**
 * @param {{
 *   sets: object[],
 *   prIds?: Set<number>,
 *   editingId?: number|null,
 *   onPick?: ((set: object) => void)|null,
 *   ghost?: {set: object, when: string}|null,
 * }} opts
 *   onPick ausente deixa as linhas inertes (leitura); presente as torna
 *   tocaveis. ghost e a serie do treino anterior na posicao da proxima.
 * @returns {HTMLElement}
 */
export function setLedger({
  sets, prIds = new Set(), editingId = null, onPick = null, ghost = null,
}) {
  const timeBased = sets.some(isDurationSet) || (ghost && isDurationSet(ghost.set));
  const wrap = node(html`
    <div class="led">
      <div class="led__head" aria-hidden="true">
        <span>${t('session.led.num')}</span>
        <span>${timeBased ? t('session.led.time') : t('session.led.weight')}</span>
        <span>${timeBased ? '' : t('session.led.reps')}</span>
        <span>${timeBased ? '' : '1RM'}</span>
        <span></span>
      </div>
    </div>
  `);

  const labels = setNumbers(sets);
  sets.forEach((s, i) => {
    const isPR = prIds.has(s.id);
    const star = isPR
      ? `<span class="led__star" aria-label="${t('session.led.pr')}">${ICON.star}</span>`
      : '<span></span>';
    const classes = `led__row${s.warmup ? ' led__row--warm' : ''}${isPR ? ' led__row--pr' : ''}`;
    const inner = html`
      <span class="led__n">${labels[i]}</span>
      ${raw(ledgerCells(s))}
      ${raw(star)}
    `;

    // Involucro por modo: <div> inerte na leitura, <button> tocavel na edicao.
    const row = onPick
      ? node(html`<button class="${classes}" data-set="${s.id}" aria-current="${s.id === editingId}">${raw(inner)}</button>`)
      : node(html`<div class="${classes}" data-set="${s.id}">${raw(inner)}</div>`);
    if (onPick) row.onclick = () => onPick(s);
    wrap.append(row);
  });

  if (ghost) {
    const cells = isDurationSet(ghost.set)
      ? html`<span class="led__v" style="grid-column:2 / 4">${fmtSet(ghost.set)}</span>`
      : html`
        <span class="led__v">${fmtNum(ghost.set.weight, 2)}</span>
        <span class="led__v">${isUnilateralSet(ghost.set) ? `${ghost.set.repsRight}/${ghost.set.repsLeft}` : ghost.set.reps}</span>
      `;
    wrap.append(node(html`
      <div class="led__row led__row--ghost">
        <span class="led__n">${workingCount(sets) + 1}</span>
        ${raw(cells)}
        <span class="led__ago">${fmtRelativeDay(ghost.when)}</span>
      </div>
    `));
  }

  return wrap;
}

/* ---------- Listas ---------- */

/** Envolve uma lista de &lt;li&gt; num card padrao — usado em toda lista
 *  simples do app (resultado de busca, sugestoes do catalogo, selecao de
 *  exercicio). Interface pequena, pra nao repetir o par card+ul em cada tela. */
export function listInCard(items) {
  const card = node('<div class="card"><ul class="list"></ul></div>');
  const ul = card.querySelector('ul');
  for (const li of items) ul.append(li);
  return card;
}

/**
 * Lista de itens agrupados por `getGroup(item)`, em cards que expandem e
 * recolhem ao toque — usado pelo catalogo e pelo seletor de exercicios da
 * sessao pra nao rolar uma lista de dezenas/centenas de itens de uma vez so.
 * `openGroups` e um Set&lt;string&gt; de nomes de grupo, de quem chama: cada tela
 * guarda o seu (o que ficou aberto no catalogo nao e o mesmo que ficou
 * aberto no seletor de exercicios da sessao).
 * @param {{items: object[], getGroup: (item: object) => string,
 *          openGroups: Set<string>, renderItem: (item: object) => HTMLElement}} opts
 * @returns {HTMLElement} elemento transparente ao layout (display:contents) —
 *   os cards de grupo caem direto no container de quem chama, como se nao
 *   houvesse wrapper.
 */
export function groupedList({
  items, getGroup, openGroups, renderItem,
}) {
  const root = node('<div class="contents"></div>');

  const redraw = () => {
    root.innerHTML = '';
    for (const { group, items: groupItems } of groupBy(items, getGroup)) {
      const open = openGroups.has(group);
      const section = node(html`
        <div class="card catalog__group">
          <button class="catalog__header" type="button" aria-expanded="${String(open)}">
            <span class="catalog__icon" aria-hidden="true">${raw(ICON_GROUPS[group] || '')}</span>
            <span class="grow" style="font-weight:600">${groupLabel(group)}</span>
            <span class="muted small">${groupItems.length}</span>
            <span class="list__chev catalog__arrow">${raw(ICON.chevron)}</span>
          </button>
        </div>
      `);

      section.querySelector('button').onclick = () => {
        if (open) openGroups.delete(group); else openGroups.add(group);
        redraw();
      };

      if (open) {
        const ul = node('<ul class="list"></ul>');
        for (const item of groupItems) ul.append(renderItem(item));
        section.append(ul);
      }
      root.append(section);
    }
  };

  redraw();
  return root;
}

/** Vibracao curta ao registrar. Ignorado no iOS, que nao expoe a API. */
export function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem suporte */ }
}

// Mora em text.js (sem DOM) porque db.js tambem precisa dela na migracao;
// reexportada aqui para nao mexer em quem ja importava de ui.js.
export { stripAccents, normalizeName } from './text.js';

/* ---------- Plataforma ---------- */

export function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se apresenta como Macintosh; o toque e o que o denuncia.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** true quando o app roda instalado na tela de inicio (nao dentro do Safari). */
export function isStandalone() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

/* ---------- Stepper numerico ---------- */

/**
 * Campo numerico com botoes de - e +, usado para peso e repeticoes.
 * Os botoes existem porque digitar de pe entre series e ruim: na pratica
 * registrar uma serie vira um ou dois toques.
 *
 * @param {{label: string, value: number, step: number, min?: number, max?: number,
 *          decimals?: number, suffix?: string}} opts
 * @returns {{el: HTMLElement, get: () => number, set: (v: number) => void, focus: () => void}}
 */
export function createStepper({
  label, value = 0, step = 1, min = 0, max = 9999, decimals = 0, suffix = '',
}) {
  const wrap = node(html`
    <div class="field">
      <span class="field__label">${label}${suffix ? raw(` <span class="muted">${esc(suffix)}</span>`) : ''}</span>
      <div class="stepper">
        <button class="stepper__btn" type="button" data-dec aria-label="${t('ui.decrease', { label })}">&minus;</button>
        <input class="stepper__input" type="number" inputmode="${decimals ? 'decimal' : 'numeric'}"
               step="${step}" min="${min}" max="${max}" value="${value}" aria-label="${label}">
        <button class="stepper__btn" type="button" data-inc aria-label="${t('ui.increase', { label })}">+</button>
      </div>
    </div>
  `);

  const input = wrap.querySelector('input');
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const round = (n) => Number(n.toFixed(decimals + 2));

  const get = () => {
    const n = parseFloat(String(input.value).replace(',', '.'));
    return Number.isFinite(n) ? clamp(n) : 0;
  };
  const set = (v) => { input.value = String(round(clamp(Number(v) || 0))); };

  const bump = (dir) => {
    set(round(get() + dir * step));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    buzz(8);
  };

  wrap.querySelector('[data-dec]').addEventListener('click', () => bump(-1));
  wrap.querySelector('[data-inc]').addEventListener('click', () => bump(1));
  // Selecionar tudo ao focar evita ter que apagar o valor anterior digito a digito.
  input.addEventListener('focus', () => input.select());

  return {
    el: wrap, get, set, focus: () => input.focus(),
  };
}

/**
 * Par de steppers min+seg pra series de Cardio/Alongamento (ver
 * DURATION_GROUPS em seed.js), que guardam duracao em vez de peso/reps.
 * Mesmo contrato de createStepper — get()/set() trabalham em segundos
 * totais — pra nao exigir tratamento especial nos call sites que hoje
 * esperam {el, get, set, focus}.
 * @param {{value?: number}} opts value em segundos
 * @returns {{el: HTMLElement, get: () => number, set: (v: number) => void, focus: () => void}}
 */
export function createDurationStepper({ value = 0 } = {}) {
  const initialTotal = Math.max(0, Math.round(Number(value) || 0));
  const minutes = createStepper({
    label: t('session.durationMin'), value: Math.floor(initialTotal / 60), step: 1, min: 0, max: 600, decimals: 0,
  });
  const seconds = createStepper({
    label: t('session.durationSec'), value: initialTotal % 60, step: 5, min: 0, max: 59, decimals: 0,
  });

  const wrap = node('<div class="composer__duration"></div>');
  wrap.append(minutes.el, seconds.el);

  const set = (v) => {
    const total = Math.max(0, Math.round(Number(v) || 0));
    minutes.set(Math.floor(total / 60));
    seconds.set(total % 60);
  };

  return {
    el: wrap,
    get: () => minutes.get() * 60 + seconds.get(),
    set,
    focus: () => minutes.focus(),
  };
}

/** Liga um grupo `.segmented` (N botoes, um ativo): clique troca o
 *  `aria-pressed` de todos e chama `onChange(button)` com o botao escolhido —
 *  o dataset de cada botao (`data-mode`, `data-m`, ...) fica por conta de
 *  quem chama, cada grupo usa o atributo que faz sentido pra ele. */
export function wireSegmented(container, onChange) {
  const buttons = container.querySelectorAll('.segmented__btn');
  for (const button of buttons) {
    button.onclick = () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      onChange(button);
    };
  }
}

/** Alternador entre as duas listas da aba Exercicios: a biblioteca e os
 *  modelos de treino. Fica aqui, e nao numa das duas views, porque as duas o
 *  desenham identico no topo — e o unico jeito de a pessoa descobrir a outra. */
export function librarySwitch(active) {
  const el = node(html`
    <div class="segmented">
      <button class="segmented__btn" data-to="#/exercicios"
              aria-pressed="${String(active === 'exercises')}">${t('exercise.listTitle')}</button>
      <button class="segmented__btn" data-to="#/modelos"
              aria-pressed="${String(active === 'templates')}">${t('templates.listTitle')}</button>
    </div>
  `);
  wireSegmented(el, (button) => { location.hash = button.dataset.to; });
  return el;
}
