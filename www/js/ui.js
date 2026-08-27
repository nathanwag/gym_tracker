/* Helpers de interface compartilhados pelas telas: montagem de HTML seguro,
 * topbar, toast, bottom sheet e formatacao de numeros e datas conforme o
 * idioma ativo (ver i18n.js). */

import { t, tn, locale } from './i18n.js';
import { isDurationSet } from './models.js';
import { groupBy, groupLabel } from './seed.js';

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
 *   showBar = false esconde a barra inteira (usado nas 4 abas raiz, onde ela so
 *   repetiria o nome que a tabbar ja mostra); o titulo da aba do navegador
 *   continua sendo definido normalmente.
 */
export function setTop({
  title, back = null, actions = '', showBar = true,
}) {
  const topbarEl = $('#topbar');
  const titleEl = $('#topbar-title');
  const backEl = $('#topbar-back');
  const actionsEl = $('#topbar-actions');

  titleEl.textContent = title;
  document.title = title === 'Treino' ? 'Treino' : `${title} · Treino`;
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
export const fmtDate = (iso) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
export const fmtDateShort = (iso) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit' }).format(new Date(iso));
export const fmtWeekday = (iso) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(new Date(iso));

/** Ex: "10 de ago. – 16 de ago." (pt) / "Aug 10 – Aug 16" (en). Aceita Date ou string ISO. */
export function fmtDateRange(start, end) {
  const fmt = new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short' });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

/** "Hoje", "Ontem", "ha 3 dias" ou a data cheia. */
export function fmtRelativeDay(iso) {
  const days = daysBetween(new Date(iso), new Date());
  if (days <= 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 7) return tn('common.daysAgo', days);
  if (days < 30) return tn('common.weeksAgo', Math.floor(days / 7));
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
  const min = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
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
  return isDurationSet(s) ? fmtTempoSerie(s.durationSec) : `${fmtNum(s.weight, 2)}×${s.reps}`;
}

/** Mesma decisao que fmtSet, com unidade de peso e espacada — usado quando
 *  a serie aparece sozinha numa linha (lista de series de um treino). */
export function fmtSetWithUnit(s, unit) {
  return isDurationSet(s) ? fmtTempoSerie(s.durationSec) : `${fmtNum(s.weight, 2)} ${unit} × ${s.reps}`;
}

/* ---------- Diversos ---------- */

export const ICON = {
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 20h6M12 14v6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 11l4 4 4-4M4.5 19.5h15"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15.5l-5.2-5.2a2 2 0 00-2.8 0L4.5 19"/></svg>',
};

/* Icone por grupo muscular: aparece no cabecalho das secoes e no lugar da foto
 * quando o exercicio nao tem figura.
 *
 * Sao pictogramas de regiao do corpo, nao desenhos anatomicos: a 22px um
 * desenho de dorsal vira borrao. Todos partem da mesma silhueta (cabeca, tronco,
 * membros) — a silhueta fica esmaecida e uma mancha cheia na cor de destaque
 * marca a regiao. Um traco fino (versao anterior) sumia entre grupos vizinhos
 * como Deltoides/Trapezio; a mancha preenchida da o contraste que faltava sem
 * abandonar o mono-acento do resto do app.
 *
 * Sem fill/stroke inline no traco da silhueta: a regra global de styles.css
 * cuida disso. A mancha e o unico elemento com fill/color explicitos aqui,
 * de proposito — e o que precisa saltar aos olhos.
 */
const BODY_PATH = 'M12 2.6a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2M12 6.4v7M8.4 8.2L12 7l3.6 1.2M8.4 8.2L7 12.4M15.6 8.2L17 12.4M12 13.4l-1.9 8M12 13.4l1.9 8';
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;
// color:var(--accent) no svg inteiro (nao so no ponto) e o que faz a marca
// destacar igual Cardio/Alongamento -- silhueta e ponto no mesmo tom, so a
// opacidade diferente, em vez de silhueta cinza (herdada de .catalog__icon) com
// um ponto colorido cortando a familia.
const body = (...dots) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:var(--accent)"><path d="${BODY_PATH}" opacity=".3"/>${dots.map((p) => dot(...p)).join('')}</svg>`;

export const ICON_GROUPS = {
  'Peito': body([12, 9.1, 1.7]),
  'Costas': body([12, 10.6, 1.7]),
  // Abaixo de Costas na silhueta, perto do quadril: hiperextensao/terra e
  // cadeia posterior, nao puxada -- por isso saiu de Costas.
  'Lombar': body([12, 12.9, 1.3]),
  'Deltoides': body([8.4, 8.2, 1.3], [15.6, 8.2, 1.3]),
  // Logo abaixo do pescoço, mais estreito que a mancha de Deltoides: e onde
  // o trapezio fica na silhueta (base do pescoço ate o topo do ombro).
  'Trapézio': body([12, 7.5, 1.15]),
  'Pescoço': body([12, 5.3, 1]),
  'Bíceps': body([6.8, 10.9, 1.2]),
  'Tríceps': body([17.2, 10.9, 1.2]),
  // Coxa e uma so regiao na silhueta (sem frente/costas pra distinguir
  // quadriceps de posterior); a marca muda de altura — mais alta vs mais
  // baixa na coxa — pra diferenciar os dois icones.
  'Quadríceps': body([11.2, 16, 1.3], [12.8, 16, 1.3]),
  'Posterior': body([10.6, 19, 1.05], [13.4, 19, 1.05]),
  'Glúteos': body([12, 13.9, 1.5]),
  'Panturrilha': body([10.2, 20.8, 0.9], [13.8, 20.8, 0.9]),
  'Abdômen': body([12, 11.2, 1], [12, 12.8, 1]),
  'Antebraço': body([6.7, 13.7, 1.1], [17.3, 13.7, 1.1]),
  // Cardio e alongamento nao sao regiao do corpo, entao fogem da familia
  // "silhueta com mancha" e usam glifo proprio -- mas no mesmo color:var(--accent)
  // que corpo() usa agora, entao a familia toda fica no mesmo tom.
  'Cardio': `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:var(--accent)"><path d="M3 13h3.5l1.8-5 3.4 10 2.2-9 1.6 4h4.5"/></svg>`,
  'Alongamento': `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:var(--accent)"><circle cx="14.5" cy="4.2" r="1.6" fill="var(--accent)" stroke="none"/><path d="M14.5 5.8l-3 2.4.8 4M11.5 8.2l-4.5 1M12.3 12.2l-2.8 1.5-1 4M12.3 12.2l2 2 .8 4.3"/></svg>`,
  'Outros': ICON.dumbbell,
};

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
