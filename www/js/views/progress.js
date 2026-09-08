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
import {
  groupSessionSummaries, groupIndex, groupMedians, progressPct, exerciseProgressRows,
} from '../models.js';
import { lineChart } from '../charts.js';
import { thumbHtml, preloadCustomThumbs } from '../media.js';
import { t, tn } from '../i18n.js';
import { MUSCLE_GROUPS, groupLabel, usesDuration } from '../seed.js';
import {
  setTop, html, raw, node, ICON, groupColor, wireSegmented, stripAccents,
  fmtNum, fmtDate, fmtDateShort, fmtTempoSerie, fmtSet, fmtRelativeDay,
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
// Sessoes listadas antes do "ver todas". Seis cobre as duas janelas que o
// indice compara (3 recentes + 3 da base), que e o que a tela esta explicando.
const SESSIONS_SHOWN = 6;

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
  return {
    rows, exercisesById, sets, workoutsById, exercises,
  };
}

/* ==========================================================================
   Nivel 1 — indice por grupo
   ========================================================================== */

export async function render(view) {
  setTop({
    title: t('app.tab.progress'),
    actions: `<button class="icon-btn" type="button" data-search aria-label="${t('exercise.searchPlaceholder')}">${ICON.search}</button>`,
  });
  document.querySelector('[data-search]').onclick = () => { location.hash = '#/exercicios'; };

  const {
    rows, sets, workoutsById, exercises,
  } = await loadGroups();
  const root = node('<div></div>');

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

  root.append(node(`<div class="lab"><span>${t('progress.groups')}</span><span>${t('progress.indexRef')}</span></div>`));

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
  root.append(exerciseSection(sets, workoutsById, exercises, db.settings().unit));
  root.append(node(`<p class="muted small" style="margin:12px 0 0">${t('progress.indexHint')}</p>`));

  view.append(root);
}

/* ==========================================================================
   Nivel 1b — os exercicios, na mesma escala
   ========================================================================== */

/** A biblioteca ordenada pela ultima vez que cada exercicio foi feito, com o
 *  mesmo indice dos grupos a direita.
 *
 *  E a lista que era a aba Exercicios. La ela vinha em acordeao por grupo —
 *  oito cabecalhos fechados pra doze itens, e nenhuma palavra sobre nenhum
 *  deles. O acordeao era do catalogo, onde 873 linhas o obrigam; numa
 *  biblioteca de uma pessoa ele so escondia a tela inteira.
 *
 *  Exercicio sem serie nenhuma fica de fora: nao ha o que comparar. A ultima
 *  linha e a saida pra biblioteca inteira, senao ele ficaria inalcancavel
 *  daqui. */
function exerciseSection(sets, workoutsById, exercises, unit) {
  const rows = exerciseProgressRows(
    sets, workoutsById, exercises,
    // Cardio/alongamento nao tem carga: o analogo do e1RM e o tempo total.
    (ex) => (usesDuration(ex.muscleGroup) ? 'totalDuration' : 'bestE1rm'),
  );
  if (!rows.length) return node('<div></div>');

  const wrap = node(html`
    <div>
      <div class="lab"><span>${t('progress.exercises')}</span><span>${t('progress.indexRef')}</span></div>
    </div>
  `);

  const list = node('<div></div>');
  const draw = () => {
    list.innerHTML = '';
    for (const row of rows) {
      const below = row.index != null && row.index < INDEX_REF;
      const timeBased = usesDuration(row.exercise.muscleGroup);
      const last = timeBased
        ? fmtTempoSerie(row.lastDuration)
        : `${fmtNum(row.lastWeight, 2)} ${unit}`;
      list.append(node(html`
        <a class="srow${below ? ' srow--under' : ''}" href="#/exercicios/${row.exercise.id}">
          ${raw(thumbHtml(row.exercise))}
          <span class="srow__mid">
            <span class="srow__day">${row.exercise.name}</span>
            <span class="srow__detail">${fmtRelativeDay(row.lastAt)} · ${last}</span>
          </span>
          <span class="srow__end">
            <span class="srow__v">${row.index == null ? '—' : fmtNum(row.index, 0)}</span>
          </span>
          <span class="srow__go">${raw(ICON.chevron)}</span>
        </a>
      `));
    }
    list.append(node(html`
      <a class="srow" href="#/exercicios">
        <span class="srow__mid"><span class="srow__day">${t('progress.allExercises')}</span></span>
        <span class="srow__go">${raw(ICON.chevron)}</span>
      </a>
    `));
  };

  draw();
  wrap.append(list);
  // Miniatura personalizada nao atrasa a primeira pintura: redesenha so quando
  // (e se) o cache terminar de carregar, como na tela de exercicio.
  preloadCustomThumbs().then(() => { if (list.isConnected) draw(); }).catch(() => {});
  return wrap;
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

/** Por que o indice esta onde esta. O numero sozinho nao acusa se o grupo
 *  perdeu serie, perdeu carga, ou as duas — e sem isso "72" nao aciona nada. */
function indexReason(summaries, timeBased) {
  const fields = timeBased ? ['setCount', 'minutes'] : ['setCount', 'maxWeight'];
  const m = groupMedians(summaries, fields);
  if (!m) return null;

  const setsDelta = m.recent.setCount - m.base.setCount;
  const loadKey = timeBased ? 'minutes' : 'maxWeight';
  const loadDelta = m.recent[loadKey] - m.base[loadKey];
  const fmtLoad = (v) => (timeBased ? `${fmtNum(v, 0)} ${t('common.min')}` : fmtNum(v, 2));

  // So o que mudou entra na frase: listar "series iguais, carga igual" num
  // grupo estavel seria ruido com cara de diagnostico.
  const parts = [];
  if (setsDelta) parts.push(t('progress.reason.sets', { recent: fmtNum(m.recent.setCount, 1), base: fmtNum(m.base.setCount, 1) }));
  if (loadDelta) parts.push(t('progress.reason.load', { recent: fmtLoad(m.recent[loadKey]), base: fmtLoad(m.base[loadKey]) }));
  if (!parts.length) return t('progress.reason.steady');
  return t('progress.reason.frame', { parts: parts.join(t('progress.reason.join')) });
}

/** As sessoes que formaram o indice, da mais recente pra tras. Cada uma leva
 *  ao treino — e o caminho que a tela de exercicio ja oferece e esta nao. */
function sessionList(summaries, exercisesById, unit, timeBased) {
  const wrap = node('<div></div>');

  for (const r of [...summaries].reverse().slice(0, SESSIONS_SHOWN)) {
    // Uma linha por sessao, com os exercicios do grupo naquele dia e as
    // series de cada um — e o que diferencia duas sessoes de mesmo volume.
    const byExercise = new Map();
    for (const set of r.sets) {
      const name = exercisesById.get(set.exerciseId)?.name;
      if (!name) continue;
      if (!byExercise.has(name)) byExercise.set(name, []);
      byExercise.get(name).push(set);
    }
    const detail = [...byExercise.entries()]
      .map(([name, sets]) => `${name} · ${sets.map((set) => fmtSet(set)).join(', ')}`)
      .join(' · ');

    wrap.append(node(html`
      <a class="srow" href="#/historico/${r.workoutId}">
        <span class="srow__mid">
          <span class="srow__day">${fmtDate(r.when)}</span>
          <span class="srow__detail">${detail}</span>
        </span>
        <span class="srow__end">
          <span class="srow__v">${timeBased ? fmtTempoSerie(r.totalDuration) : fmtNum(r.volume, 0)}</span>
          <span class="srow__u">${timeBased ? t('progress.total') : unit}</span>
        </span>
        <span class="srow__go">${raw(ICON.chevron)}</span>
      </a>
    `));
  }
  return wrap;
}

export async function renderGroup(view, slug) {
  const group = groupFromSlug(slug);
  if (!group) { location.hash = '#/progresso'; return; }

  const { rows, exercisesById } = await loadGroups();
  const current = rows.find((r) => r.group === group);
  const unit = db.settings().unit;
  const timeBased = usesDuration(group);

  setTop({
    title: groupLabel(group),
    back: '#/progresso',
    actions: current ? `<span class="topbar__meta">${tn('progress.sessions', current.summaries.length)}</span>` : '',
  });

  const root = node('<div class="stack"></div>');

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

  /* --- 1. o indice, que e o numero que trouxe voce ate aqui --- */
  const header = node(html`
    <div>
      <div class="lab"><span>${t('progress.index')}</span><span data-change></span></div>
      <div class="week__big" style="padding-top:2px">
        <span class="data" style="color:${groupColor(group)}">${current.index == null ? '—' : fmtNum(current.index, 0)}</span>
        <span class="week__unit">${t('progress.ofNormal')}</span>
      </div>
    </div>
  `);
  root.append(header);

  const reason = current.index == null ? t('progress.reason.tooFew') : indexReason(summaries, timeBased);
  if (reason) root.append(node(html`<p class="muted small" style="margin:0">${reason}</p>`));

  /* --- 2. a prova: a serie temporal do grupo --- */
  const metrics = chartMetrics(timeBased, unit);
  const card = node(html`
    <div>
      <div class="segmented" data-metrics>
        ${raw(Object.entries(metrics)
    .map(([key, metric], i) => `<button class="segmented__btn" data-m="${key}" aria-pressed="${i === 0}">${metric.short}</button>`)
    .join(''))}
      </div>
      <div data-chart style="padding:10px 0 2px;--accent:${groupColor(group)}"></div>
    </div>
  `);

  const chartArea = card.querySelector('[data-chart]');
  const changeText = header.querySelector('[data-change]');

  const draw = (key) => {
    const metric = metrics[key];
    chartArea.innerHTML = '';

    chartArea.append(lineChart({
      points: summaries.map((r) => ({
        when: r.when,
        value: r[metric.field],
        label: `${tn('common.set', r.sets.length)} · ${timeBased ? fmtTempoSerie(r.totalDuration) : `${fmtNum(r.volume, 0)} ${unit}`}`,
      })),
      suffix: metric.suffix,
      decimals: 0,
      onTap: null,
    }));

    const change = progressPct(summaries, metric.field);
    changeText.textContent = change == null ? ''
      : t('progress.changeIn', {
        pct: t('common.pct', { sign: change >= 0 ? '+' : '', value: fmtNum(change, 1) }),
        metric: metric.short.toLowerCase(),
      });
    changeText.style.color = change == null || change === 0 ? '' : `var(--${change > 0 ? 'success' : 'danger'})`;
  };

  wireSegmented(card, (button) => draw(button.dataset.m));
  draw(Object.keys(metrics)[0]);
  root.append(card);

  /* --- 3. as sessoes que formaram o numero --- */
  root.append(node(`<h2 class="section-title">${t('progress.sessionsTitle')}</h2>`));
  root.append(sessionList(summaries, exercisesById, unit, timeBased));

  /* --- 4. so entao a saida pra outro grupo. Antes ficavam no topo, e trocar
     de grupo e um gesto de DEPOIS de ler, nao de antes: oito chips empurravam
     o grafico pra fora da dobra. Levam o indice junto pra ja dizer o que se
     vai encontrar. --- */
  const others = rows.filter((r) => r.group !== group);
  if (others.length) {
    root.append(node(`<h2 class="section-title">${t('progress.otherGroup')}</h2>`));
    const chips = node('<div class="chips"></div>');
    for (const row of others) {
      chips.append(node(html`
        <a class="chip" href="#/progresso/${groupSlug(row.group)}">
          <i style="background:${groupColor(row.group)}"></i>${groupLabel(row.group)}
          ${row.index == null ? '' : raw(`<b>${fmtNum(row.index, 0)}</b>`)}
        </a>
      `));
    }
    root.append(chips);
  }

  view.append(root);
}
