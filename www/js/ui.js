/* Helpers de interface compartilhados pelas telas: montagem de HTML seguro,
 * topbar, toast, bottom sheet e formatacao de numeros e datas conforme o
 * idioma ativo (ver i18n.js). */

import { t, tn, locale } from './i18n.js';
import {
  isDurationSet, isUnilateralSet, setE1rm, workoutGroupBreakdown, workoutSummary,
} from './models.js';
import { groupLabel, usesDuration } from './seed.js';
import * as db from './db.js';
import { groupSlugFor } from './groups.js';

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

/**
 * Escolha de uma opcao entre poucas, em bottom sheet. Existe pra tirar o
 * `<select>` nativo da frente: o menu do sistema nao obedece paleta, tipo nem
 * raio de canto do app, entao o unico momento em que a tela sumia era
 * justamente o de escolher. Mesmo racional do confirmSheet contra o confirm().
 *
 * @param {{title: string, options: {value: string, label: string}[], value: string}} opts
 * @returns {Promise<string|null>} null quando a folha e fechada sem escolher
 */
export function pickSheet({ title, options, value }) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (picked) => {
      if (answered) return;
      answered = true;
      resolve(picked);
    };

    const body = openSheet(title, node(html`
      <div class="pick">
        ${raw(options.map((o) => `
          <button class="pick__o${o.value === String(value) ? ' pick__o--on' : ''}" data-v="${esc(o.value)}">
            <span>${esc(o.label)}</span>
            ${o.value === String(value) ? ICON.check : ''}
          </button>
        `).join(''))}
      </div>
    `));

    sheetOnClose = () => finish(null);
    for (const button of body.querySelectorAll('[data-v]')) {
      button.onclick = () => { finish(button.dataset.v); closeSheet(); };
    }
  });
}

/* ---------- Linhas de ajuste ----------
 * A familia .set-row: rotulo a esquerda, valor a direita, linha inteira como
 * alvo. Moravam em views/settings.js; subiram quando o Perfil passou a
 * desenhar as mesmas linhas (ver DESIGN.md, "Pecas compartilhadas").
 *
 * `icon` e o desenho a esquerda, so em Configuracoes: dentro de um grupo, e o
 * que deixa achar "idioma" sem ler a coluna inteira. */

function rowInner({
  label, value = '', hint = '', icon = '', arrow = '',
}) {
  return html`
    ${icon ? raw(`<span class="set-row__i">${icon}</span>`) : ''}
    <span class="set-row__k">${label}${hint ? raw(`<span class="set-row__hint">${esc(hint)}</span>`) : ''}</span>
    <span class="set-row__v"><span data-value>${value}</span>${arrow ? raw(arrow) : ''}</span>
  `;
}

/** Linha que abre a folha de escolha. A LINHA INTEIRA e o alvo, nao so o
 *  texto: a seta ao lado do valor e onde a mao vai, e um <select> nativo
 *  terminava o alvo no fim do texto (ver pickSheet). */
export function pickerRow(label, options, value, onPick, { icon = '' } = {}) {
  const labelOf = (v) => options.find((o) => o.value === String(v))?.label ?? String(v);
  let current = String(value);

  // <button>, nao <div> com onclick: como alvo, a linha precisa receber foco
  // pelo teclado e anunciar-se como acionavel.
  const row = node(html`
    <button type="button" class="set-row set-row--tap">
      ${raw(rowInner({ label, value: labelOf(current), icon, arrow: ICON.down }))}
    </button>
  `);

  row.onclick = async () => {
    const picked = await pickSheet({ title: label, options, value: current });
    if (picked == null || picked === current) return;
    current = picked;
    row.querySelector('[data-value]').textContent = labelOf(picked);
    onPick(picked);
  };
  return row;
}

/** Linha de leitura, com valor a direita. `onClick` a torna tocavel — e ai a
 *  seta e o chevron, que significa "leva pra outra tela ou folha", enquanto a
 *  seta pra baixo do pickerRow significa "abre uma lista aqui mesmo". */
export function infoRow(label, value, onClick = null, { icon = '', hint = '', muted = false } = {}) {
  const tag = onClick ? 'button' : 'div';
  const row = node(html`
    <${raw(tag)} ${onClick ? raw('type="button"') : ''} class="set-row${onClick ? ' set-row--tap' : ''}${muted ? ' set-row--muted' : ''}">
      ${raw(rowInner({ label, value, hint, icon, arrow: onClick ? ICON.chevron : '' }))}
    </${raw(tag)}>
  `);
  if (onClick) row.onclick = onClick;
  return row;
}

/**
 * Folha de um campo so, pra ajuste que e NUMERO e nao escolha entre poucos:
 * lista fechada deixa de fora quem faz 9 series ou usa anilha de 1,5 kg (ver
 * DESIGN.md, "Folha de escolha e para escolha; numero e campo").
 *
 * `parse` devolve o valor valido ou null; a dica embaixo do campo e que vira
 * o recado do erro, em vermelho — um toast repetiria a mesma frase dois
 * centimetros acima dela, e ainda por cima em cima do campo.
 *
 * @param {{title: string, label: string, suffix?: string, value: string|number,
 *          hint: string, parse: (text: string) => any}} opts
 * @returns {Promise<any|null>} null quando a folha fecha sem valor
 */
export function numberSheet({
  title, label, suffix = '', value, hint, parse,
}) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (v) => {
      if (answered) return;
      answered = true;
      resolve(v);
    };

    // type="text" com inputmode decimal, e nao type="number": o campo precisa
    // aceitar a virgula que o teclado do celular oferece em portugues.
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field__label">${label}${suffix ? raw(` <span class="muted">${esc(suffix)}</span>`) : ''}</span>
          <input class="input" data-value type="text" inputmode="decimal" enterkeyhint="done" value="${value}">
        </label>
        <p class="muted small" data-hint aria-live="polite" style="margin:0">${hint}</p>
        <button type="button" class="btn btn--primary btn--block" data-save>${t('common.save')}</button>
      </div>
    `);
    openSheet(title, body);
    onSheetClose(() => finish(null));

    const input = body.querySelector('[data-value]');
    const hintEl = body.querySelector('[data-hint]');

    const submit = () => {
      const parsed = parse(input.value);
      hintEl.classList.toggle('hint--err', parsed == null);
      input.setAttribute('aria-invalid', String(parsed == null));
      if (parsed == null) {
        input.focus();
        input.select();
        return;
      }
      finish(parsed);
      closeSheet();
    };

    body.querySelector('[data-save]').onclick = submit;
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit();
    };
    input.focus();
    input.select();
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
/** "2026-09-07" e interpretado pelo `new Date()` como meia-noite UTC, o que
 *  volta um dia em qualquer fuso negativo — a medicao de peso de hoje
 *  aparecia como ontem. Data com hora nao tem esse problema e passa direto. */
function parseDate(value) {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!dateOnly) return new Date(value);
  return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
}

export const fmtDate = (iso) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDate(iso));
export const fmtDateShort = (iso) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit' }).format(parseDate(iso));
export const fmtWeekday = (iso) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(parseDate(iso));

/** "junho de 2026" / "June 2026" — o "treinando desde" do Perfil, onde o dia
 *  nao acrescenta nada. */
export const fmtMonthYear = (iso) =>
  new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(parseDate(iso));

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
  // Mesmo desenho da aba Perfil na tabbar (index.html): o icone da conta e o
  // da pessoa, e dois desenhos diferentes leriam como assuntos diferentes.
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.6"/><path d="M5.4 20a6.6 6.6 0 0 1 13.2 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.4"/><path d="M19.4 14.2a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H4a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H12a1.6 1.6 0 001-1.5V4a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V12a1.6 1.6 0 001.5 1h.2a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 100 17 8.5 8.5 0 0010.5-6.5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5a13 13 0 010 17a13 13 0 010-17z"/></svg>',
  plusMinus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h6M7 9v6M14 12h6"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8.5 7l3.5-3.5L15.5 7M5.5 13v6.5h13V13"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 2.6v5.4c0 4-2.9 7.6-7 9-4.1-1.4-7-5-7-9V5.8z"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 114.3 1.6c-.9.9-2 1.2-2 2.6M12 17.1v.1"/></svg>',
  scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5h15l1.5 11H3zM9 8.5a3 3 0 016 0"/><path d="M8.5 12.5h7"/></svg>',
};

/* ---------- Cor por grupo muscular ----------
 * A chave e o valor gravado no banco (sempre em portugues); o sufixo e o nome
 * da variavel CSS, sem acento. Tem que casar com MUSCLE_GROUPS em seed.js e
 * com os tokens --m-* em styles.css, do mesmo jeito que ICON_GROUPS acima.
 *
 * Devolve `var(--m-x)` em vez do hex: assim a mesma chamada serve nos dois
 * temas, sem a view saber qual esta ativo. */
export const groupColor = (group) => `var(--m-${groupSlugFor(group)})`;

/* Os tokens --m-* de styles.css deixam de ser a verdade e viram so o valor
 * inicial: a cor agora e dado, e o usuario pode troca-la. Este <style> repete
 * a MESMA cascata de tres blocos do CSS (claro; escuro por preferencia do
 * sistema quando o tema nao esta travado em claro; escuro explicito) para que
 * `groupColor()` continue devolvendo var() e trocar de tema continue sendo
 * coisa do CSS, nao do JS. Entra no fim do <head>, entao vence styles.css por
 * ordem, com a mesma especificidade. */
export function applyGroupTokens() {
  const groups = db.groups();
  const vars = (key) => groups.map((g) => `--m-${g.slug}:${g[key]}`).join(';');
  const light = vars('colorLight');
  const dark = vars('colorDark');

  let tag = document.getElementById('group-tokens');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'group-tokens';
    document.head.append(tag);
  }
  tag.textContent = `:root{${light}}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`
    + `:root[data-theme="dark"]{${dark}}`;
}

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

const ICON_GROUPS = {
  peito: body('peito', [12, 9.1, 1.95]),
  costas: body('costas', [12, 10.6, 1.95]),
  // Abaixo de Costas na silhueta, perto do quadril: hiperextensao/terra e
  // cadeia posterior, nao puxada -- por isso saiu de Costas.
  lombar: body('lombar', [12, 12.9, 1.49]),
  ombros: body('ombros', [8.4, 8.2, 1.49], [15.6, 8.2, 1.49]),
  // Logo abaixo do pescoço, mais estreito que a mancha de Ombros: e onde
  // o trapezio fica na silhueta (base do pescoço ate o topo do ombro).
  trapezio: body('trapezio', [12, 7.5, 1.32]),
  pescoco: body('pescoco', [12, 5.3, 1.15]),
  biceps: body('biceps', [6.8, 10.9, 1.38]),
  triceps: body('triceps', [17.2, 10.9, 1.38]),
  // Coxa e uma so regiao na silhueta (sem frente/costas pra distinguir
  // quadriceps de posterior); a marca muda de altura — mais alta vs mais
  // baixa na coxa — pra diferenciar os dois icones.
  quadriceps: body('quadriceps', [11.2, 16, 1.49], [12.8, 16, 1.49]),
  posterior: body('posterior', [10.6, 19, 1.21], [13.4, 19, 1.21]),
  gluteos: body('gluteos', [12, 13.9, 1.72]),
  panturrilha: body('panturrilha', [10.2, 20.8, 1.03], [13.8, 20.8, 1.03]),
  abdomen: body('abdomen', [12, 11.2, 1.15], [12, 12.8, 1.15]),
  antebraco: body('antebraco', [6.7, 13.7, 1.26], [17.3, 13.7, 1.26]),
  // Cardio e alongamento nao sao regiao do corpo, entao fogem da familia
  // "silhueta com mancha" e usam glifo proprio -- mas na cor do grupo, igual
  // aos outros, pra familia toda seguir a mesma legenda.
  cardio: `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor('cardio')}"><path d="M3 13h3.5l1.8-5 3.4 10 2.2-9 1.6 4h4.5"/></svg>`,
  alongamento: `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor('alongamento')}"><circle cx="14.5" cy="4.2" r="1.6" fill="currentColor" stroke="none"/><path d="M14.5 5.8l-3 2.4.8 4M11.5 8.2l-4.5 1M12.3 12.2l-2.8 1.5-1 4M12.3 12.2l2 2 .8 4.3"/></svg>`,
  outros: `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor('outros')}"><path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/></svg>`,
};

/** Icone do grupo. Aceita slug ou o nome em portugues do catalogo, como
 *  groupColor e groupLabel.
 *
 *  Grupo criado pelo usuario nao tem desenho: os 17 sao silhuetas com a mancha
 *  posicionada a mao, e nao ha como gerar uma pra "Adutores". Ate haver, ele
 *  aparece como um disco na propria cor — a cor ja e a legenda do grupo em
 *  todo o resto do app. */
export function groupIcon(group) {
  const slug = groupSlugFor(group);
  return ICON_GROUPS[slug]
    || `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${groupColor(slug)}">`
      + `<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/></svg>`;
}

/** Dia do mes e abreviacao do dia da semana (ou do mes), pro bloco de data da
 *  linha. A lista de treinos usa o dia da semana; a de sessoes de um exercicio
 *  usa o mes, porque ali as datas atravessam meses e "29 QUI" seria ambiguo. */
export const fmtDayNum = (iso) => new Intl.DateTimeFormat(locale(), { day: 'numeric' }).format(parseDate(iso));
export const fmtMonthShort = (iso) => new Intl.DateTimeFormat(locale(), { month: 'short' }).format(parseDate(iso))
  .replace(/\.$/, '');
const fmtWeekdayShort = (iso) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(parseDate(iso))
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

/** Campo "grupo muscular" dos formularios de exercicio. Estava copiado em
 *  quatro telas (catalogo, seletor, criar e editar exercicio) — a lista de
 *  MUSCLE_GROUPS montada a mao nas quatro, com a mesma `selected` no meio.
 *
 *  Segue sendo `<select>` nativo, e nao pickSheet: aqui ele e um CAMPO de
 *  formulario, ao lado de um <input> de texto com a mesma moldura. pickSheet e
 *  pro valor que mora numa linha de leitura (ver a aba Voce), onde uma moldura
 *  de campo nao existiria pra dar contexto. */
export function groupField(selected = null, { grow = false } = {}) {
  const chosen = selected ? groupSlugFor(selected) : null;
  const options = db.groups()
    .map((g) => `<option value="${esc(g.slug)}"${g.slug === chosen ? ' selected' : ''}>${esc(groupLabel(g.slug))}</option>`)
    .join('');
  return `
    <label class="field${grow ? ' grow' : ''}">
      <span class="field__label">${esc(t('exercise.form.muscleGroup'))}</span>
      <select class="select" data-group>${options}</select>
    </label>`;
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


/** "Hoje · 135 kg": a ultima vez que o exercicio foi feito e com quanto. O
 *  Progresso e a busca de exercicio desenham a mesma frase, e duas copias
 *  divergiriam na primeira troca de unidade. `row` vem de
 *  exerciseProgressRows() (models.js). */
export function lastDoneLabel(exercise, row, unit) {
  const load = usesDuration(exercise.muscleGroup)
    ? fmtTempoSerie(row.lastDuration)
    : `${fmtNum(row.lastWeight, 2)} ${unit}`;
  return `${fmtRelativeDay(row.lastAt)} · ${load}`;
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
