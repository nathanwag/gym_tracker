/* Progresso: como cada grupo muscular anda, e como um grupo anda ao longo das
 * sessoes.
 *
 * Existe porque volume total mente na comparacao entre treinos: um dia de
 * perna soma mais quilos que uma semana de braco, entao "subiu ou desceu?" no
 * agregado responde na verdade "treinou perna essa semana?". Aqui nada e
 * comparado entre grupos em quilos — o indice (nivel 1) mede cada grupo contra
 * o proprio normal, e o grafico (nivel 2) compara ombro so com ombro.
 *
 * Duas telas, duas perguntas:
 *  - #/progresso            "qual grupo saiu do meu normal?"
 *  - #/progresso/<grupo>    "esse grupo esta subindo?"
 */

import * as db from '../db.js';
import { groupSessionSummaries, groupIndex, progressPct } from '../models.js';
import { lineChart } from '../charts.js';
import { t, tn } from '../i18n.js';
import { MUSCLE_GROUPS, groupLabel, usesDuration } from '../seed.js';
import {
  setTop, html, raw, node, ICON, groupColor, wireSegmented, stripAccents,
  fmtNum, fmtDateShort, fmtTempoSerie,
} from '../ui.js';

/* O grupo vai na URL como slug sem acento ("quadriceps") pelo mesmo motivo do
 * catalogo: hash com acento vira percent-encoding ilegivel e varia entre
 * navegadores. Nenhum nome de MUSCLE_GROUPS tem espaco, entao stripAccents
 * basta — nao precisa de tabela de-para. */
export const groupSlug = (group) => stripAccents(group);
const groupFromSlug = (slug) => MUSCLE_GROUPS.find((g) => groupSlug(g) === slug) || null;

// Referencia do indice. Nao e meta: e o proprio historico da pessoa.
const INDEX_REF = 100;
// Abaixo disto o indice nao aparece — ver groupIndex(). Duas ou tres sessoes
// dariam um numero que balanca sozinho, e um painel que oscila a esmo ensina
// a ser ignorado.
const MIN_SESSIONS_FOR_INDEX = 6;
// Com uma sessao so nao ha linha pra desenhar, so um ponto.
const MIN_SESSIONS_FOR_CHART = 2;

/** O alternador que as duas telas do Historico compartilham. Fica aqui, e nao
 *  em history.js, porque quem o introduziu foi esta tela. */
export function historySwitch(active) {
  const el = node(html`
    <div class="segmented" style="margin-bottom:14px">
      <button class="segmented__btn" data-go="#/historico" aria-pressed="${String(active === 'list')}">${t('progress.tab.list')}</button>
      <button class="segmented__btn" data-go="#/progresso" aria-pressed="${String(active === 'progress')}">${t('progress.tab.progress')}</button>
    </div>
  `);
  for (const button of el.querySelectorAll('[data-go]')) {
    button.onclick = () => { location.hash = button.dataset.go; };
  }
  return el;
}

/** Sessoes de cada grupo que tem historico, ja com o indice calculado. Uma
 *  passada so pelo banco serve as duas telas. */
async function loadGroups() {
  const [workouts, sets, exercises] = await Promise.all([
    db.listWorkouts(), db.listAllSets(), db.listExercises(),
  ]);
  const workoutsById = new Map(workouts.map((w) => [w.id, w]));
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));

  const rows = [];
  for (const group of MUSCLE_GROUPS) {
    const summaries = groupSessionSummaries(sets, workoutsById, exercisesById, group);
    if (!summaries.length) continue;
    // Cardio/alongamento nao tem carga: o analogo do volume e o tempo total.
    const field = usesDuration(group) ? 'totalDuration' : 'volume';
    rows.push({
      group,
      summaries,
      index: summaries.length >= MIN_SESSIONS_FOR_INDEX ? groupIndex(summaries, { field }) : null,
    });
  }
  return rows;
}

/* ==========================================================================
   Nivel 1 — indice por grupo
   ========================================================================== */

export async function render(view) {
  setTop({ title: t('history.title') });

  const rows = await loadGroups();
  const root = node('<div></div>');
  root.append(historySwitch('progress'));

  if (!rows.length) {
    root.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('progress.empty')}</p>
        <a class="btn btn--primary" href="#/">${t('history.empty.start')}</a>
      </div></div>
    `));
    view.append(root);
    return;
  }

  // Quem tem indice primeiro, do mais acima do proprio normal ao mais abaixo;
  // os sem historico suficiente vao pro fim, ordenados por quantas sessoes ja
  // tem — sao os que estao mais perto de ganhar um numero.
  rows.sort((a, b) => {
    if (a.index == null && b.index == null) return b.summaries.length - a.summaries.length;
    if (a.index == null) return 1;
    if (b.index == null) return -1;
    return b.index - a.index;
  });

  // Escala comum, com folga, e nunca menor que a referencia: as barras seguem
  // comparaveis entre si e o traco de 100 nao cai na borda direita.
  const scale = Math.max(INDEX_REF, ...rows.map((r) => r.index || 0)) * 1.15;

  root.append(node(`<div class="lab"><span>${t('progress.index')}</span><span>${t('progress.indexRef')}</span></div>`));

  const list = node('<div class="gidx"></div>');
  for (const row of rows) {
    const below = row.index != null && row.index < INDEX_REF;
    list.append(node(html`
      <a class="gidx__row${below ? ' gidx__row--under' : ''}" href="#/progresso/${groupSlug(row.group)}">
        <span class="gidx__name">${groupLabel(row.group)}</span>
        <span class="gidx__track">
          ${row.index == null ? '' : raw(`<span class="gidx__fill" style="width:${Math.min(100, (row.index / scale) * 100)}%;background:${groupColor(row.group)}"></span>`)}
          <span class="gidx__ref" style="left:${(INDEX_REF / scale) * 100}%"></span>
        </span>
        <span class="gidx__v">${row.index == null ? '—' : fmtNum(row.index, 0)}</span>
        <span class="gidx__go">${raw(ICON.chevron)}</span>
      </a>
    `));
  }
  root.append(list);
  root.append(node(`<p class="muted small" style="margin:12px 0 0">${t('progress.indexHint')}</p>`));

  view.append(root);
}

/* ==========================================================================
   Nivel 2 — um grupo, sessao a sessao
   ========================================================================== */

// Funcao, nao const de modulo: t() precisa ser reavaliado a cada render, ja
// que o idioma muda em runtime (ver idioma:mudou em app.js).
function chartMetrics(timeBased, unit) {
  const sets = { short: t('progress.metric.sets'), field: 'setCount', suffix: '' };
  return timeBased
    ? {
      sets,
      duration: {
        short: t('progress.metric.time'), field: 'minutes', suffix: ` ${t('common.min')}`,
      },
    }
    : {
      sets,
      volume: { short: t('progress.metric.volume'), field: 'volume', suffix: ` ${unit}` },
    };
}

export async function renderGroup(view, slug) {
  const group = groupFromSlug(slug);
  if (!group) { location.hash = '#/progresso'; return; }

  setTop({ title: groupLabel(group), back: '#/progresso' });

  const rows = await loadGroups();
  const current = rows.find((r) => r.group === group);
  const unit = db.settings().unit;
  const timeBased = usesDuration(group);

  const root = node('<div class="stack"></div>');

  // Chips com os outros grupos que tem historico: trocar de grupo sem voltar
  // pra lista e o gesto mais provavel depois de olhar um.
  if (rows.length > 1) {
    const chips = node('<div class="chips"></div>');
    for (const row of rows) {
      chips.append(node(html`
        <a class="chip${row.group === group ? ' chip--on' : ''}" href="#/progresso/${groupSlug(row.group)}">
          <i style="background:${groupColor(row.group)}"></i>${groupLabel(row.group)}
        </a>
      `));
    }
    root.append(chips);
  }

  if (!current || current.summaries.length < MIN_SESSIONS_FOR_CHART) {
    root.append(node(html`
      <div class="empty small">
        ${raw(ICON.dumbbell)}
        <p>${t('progress.chart.few')}</p>
      </div>
    `));
    view.append(root);
    return;
  }

  // `setCount` e `minutes` nao existem no resumo cru: o grafico precisa de um
  // numero por sessao, e series sao o comprimento da lista, nao um campo.
  const summaries = current.summaries.map((r) => ({
    ...r, setCount: r.sets.length, minutes: r.totalDuration / 60,
  }));
  const last = summaries[summaries.length - 1];

  root.append(node(html`
    <div class="lab">
      <span>${tn('progress.sessions', summaries.length)}</span>
      <span data-change></span>
    </div>
  `));

  const metrics = chartMetrics(timeBased, unit);
  const card = node(html`
    <div>
      <div class="segmented" data-metrics>
        ${raw(Object.entries(metrics)
    .map(([key, metric], i) => `<button class="segmented__btn" data-m="${key}" aria-pressed="${i === 0}">${metric.short}</button>`)
    .join(''))}
      </div>
      <div class="week__big week__big--sm" style="padding-top:10px">
        <span class="data" data-big></span>
        <span class="week__unit" data-bigunit></span>
      </div>
      <div class="week__sub">
        <span><span class="data">${fmtNum(last.sets.length, 0)}</span> ${tn('home.stat.sets', last.sets.length)}</span>
        ${timeBased
    ? raw(`<span><span class="data">${fmtTempoSerie(last.totalDuration)}</span> ${t('progress.total')}</span>`)
    : raw(`<span><span class="data">${fmtNum(last.volume, 0)}</span> ${unit}</span>`)}
        <span><span class="data">${fmtDateShort(last.when)}</span> ${t('progress.lastSession')}</span>
      </div>
      <div data-chart style="padding:10px 0 2px;--accent:${groupColor(group)}"></div>
    </div>
  `);

  const chartArea = card.querySelector('[data-chart]');
  const changeText = root.querySelector('[data-change]');

  const draw = (key) => {
    const metric = metrics[key];
    chartArea.innerHTML = '';

    card.querySelector('[data-big]').textContent = fmtNum(last[metric.field], 0);
    card.querySelector('[data-bigunit]').textContent = metric.suffix.trim() || t('progress.metric.sets');

    chartArea.append(lineChart({
      points: summaries.map((r) => ({
        when: r.when,
        value: r[metric.field],
        label: `${tn('common.set', r.sets.length)} · ${timeBased ? fmtTempoSerie(r.totalDuration) : `${fmtNum(r.volume, 0)} ${unit}`}`,
      })),
      suffix: metric.suffix,
      decimals: 0,
    }));

    const change = progressPct(summaries, metric.field);
    changeText.textContent = change == null ? ''
      : t('common.pct', { sign: change >= 0 ? '+' : '', value: fmtNum(change, 1) });
    changeText.style.color = change == null || change === 0 ? '' : `var(--${change > 0 ? 'success' : 'danger'})`;
  };

  wireSegmented(card, (button) => draw(button.dataset.m));
  draw(Object.keys(metrics)[0]);

  root.append(card);
  view.append(root);
}
