/* Helpers de interface compartilhados pelas telas: montagem de HTML seguro,
 * topbar, toast, bottom sheet e formatacao de numeros e datas em pt-BR. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Pede ao app.js para renderizar a rota atual de novo. Um evento evita que as
 *  telas importem app.js (que importa as telas) e criem um ciclo de modulos. */
export const refresh = () => window.dispatchEvent(new Event('app:refresh'));

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
 * @param {{title: string, back?: string|null, actions?: string, barra?: boolean}} opts
 *   back = rota (hash) do botao voltar; ausente esconde o botao.
 *   barra = false esconde a barra inteira (usado nas 4 abas raiz, onde ela so
 *   repetiria o nome que a tabbar ja mostra); o titulo da aba do navegador
 *   continua sendo definido normalmente.
 */
export function setTop({ title, back = null, actions = '', barra = true }) {
  const topbarEl = $('#topbar');
  const titleEl = $('#topbar-title');
  const backEl = $('#topbar-back');
  const actionsEl = $('#topbar-actions');

  titleEl.textContent = title;
  document.title = title === 'Treino' ? 'Treino' : `${title} · Treino`;
  backEl.hidden = !back;
  backEl.onclick = back ? () => { location.hash = back; } : null;
  actionsEl.innerHTML = actions;

  topbarEl.hidden = !barra;
  $('#view').classList.toggle('view--sem-topbar', !barra);

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
export function confirmSheet({ title, message = '', confirmLabel = 'Confirmar', danger = false }) {
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
        <button class="btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${confirmLabel}</button>
        <button class="btn btn--block btn--ghost" data-no>Cancelar</button>
      </div>
    `);

    sheetOnClose = () => finish(false);
    body.querySelector('[data-yes]').onclick = () => { finish(true); closeSheet(); };
    body.querySelector('[data-no]').onclick = () => { finish(false); closeSheet(); };
  });
}

/* ---------- Formatacao ---------- */

/** 60 -> "60"; 62.5 -> "62,5" (sem zeros inuteis, virgula decimal). */
export function fmtNum(value, maxDecimals = 1) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: maxDecimals });
}

export function fmtWeight(value, unit = 'kg') {
  return `${fmtNum(value, 2)} ${unit}`;
}

const DATE_FULL = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

export const fmtDate = (iso) => DATE_FULL.format(new Date(iso));
export const fmtDateShort = (iso) => DATE_SHORT.format(new Date(iso));
export const fmtWeekday = (iso) => WEEKDAY.format(new Date(iso));

const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Ex: "10 de ago. – 16 de ago.". Aceita Date ou string ISO. */
export const fmtDateRange = (inicio, fim) => `${DAY_MONTH.format(new Date(inicio))} – ${DAY_MONTH.format(new Date(fim))}`;

/** "Hoje", "Ontem", "ha 3 dias" ou a data cheia. */
export function fmtRelativeDay(iso) {
  const days = daysBetween(new Date(iso), new Date());
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return `há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'há 1 semana' : `há ${weeks} semanas`;
  }
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
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
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
 * membros) e marcam a regiao com um traco mais curto por cima — o que muda de
 * um para o outro e so a marca, entao a familia fica coerente.
 *
 * Sem fill/stroke inline: a regra global de styles.css cuida disso. */
const CORPO = 'M12 2.6a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2M12 6.4v7M8.4 8.2L12 7l3.6 1.2M8.4 8.2L7 12.4M15.6 8.2L17 12.4M12 13.4l-1.9 8M12 13.4l1.9 8';
const corpo = (marca) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CORPO}" opacity=".35"/><path d="${marca}"/></svg>`;

export const ICON_GRUPO = {
  'Peito': corpo('M9.2 9.1h5.6'),
  'Costas': corpo('M9.4 10.6h5.2M12 8.6v4'),
  'Ombros': corpo('M8.4 8.2L12 7l3.6 1.2'),
  'Bíceps': corpo('M6.6 9.4L7 12.4'),
  'Tríceps': corpo('M17 12.4l.4-3'),
  'Pernas': corpo('M10.1 21.4l1-4M13.9 21.4l-1-4'),
  'Glúteos': corpo('M9.8 13.9h4.4'),
  'Panturrilha': corpo('M10.3 20.2l-.2 1.2M13.7 20.2l.2 1.2'),
  'Abdômen': corpo('M10.4 11.2h3.2M10.4 12.8h3.2'),
  'Antebraço': corpo('M7 12.4l-.6 2.6M17 12.4l.6 2.6'),
  'Outros': ICON.dumbbell,
};

/** Vibracao curta ao registrar. Ignorado no iOS, que nao expoe a API. */
export function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem suporte */ }
}

// Mora em text.js (sem DOM) porque db.js tambem precisa dela na migracao;
// reexportada aqui para nao mexer em quem ja importava de ui.js.
export { semAcento, normalizarNome } from './text.js';

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
export function createStepper({ label, value = 0, step = 1, min = 0, max = 9999, decimals = 0, suffix = '' }) {
  const wrap = node(html`
    <div class="field">
      <span class="field__label">${label}${suffix ? raw(` <span class="muted">${esc(suffix)}</span>`) : ''}</span>
      <div class="stepper">
        <button class="stepper__btn" type="button" data-dec aria-label="Diminuir ${label}">&minus;</button>
        <input class="stepper__input" type="number" inputmode="${decimals ? 'decimal' : 'numeric'}"
               step="${step}" min="${min}" max="${max}" value="${value}" aria-label="${label}">
        <button class="stepper__btn" type="button" data-inc aria-label="Aumentar ${label}">+</button>
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

  return { el: wrap, get, set, focus: () => input.focus() };
}

/** Liga um grupo `.segmented` (N botoes, um ativo): clique troca o
 *  `aria-pressed` de todos e chama `onChange(botao)` com o botao escolhido —
 *  o dataset de cada botao (`data-modo`, `data-m`, ...) fica por conta de
 *  quem chama, cada grupo usa o atributo que faz sentido pra ele. */
export function wireSegmented(container, onChange) {
  const botoes = container.querySelectorAll('.segmented__btn');
  for (const botao of botoes) {
    botao.onclick = () => {
      for (const b of botoes) b.setAttribute('aria-pressed', String(b === botao));
      onChange(botao);
    };
  }
}
