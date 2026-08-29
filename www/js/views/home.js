/* Tela inicial: comecar ou retomar um treino, resumo da semana e ultimos treinos. */

import * as db from '../db.js';
import {
  workoutSummary, weekMuscleGroupSummary, weeklyTrend, progressPct, mondayOf,
} from '../models.js';
import { lineChart } from '../charts.js';
import { t, tn } from '../i18n.js';
import { groupLabel } from '../seed.js';
import {
  setTop, html, raw, node, ICON, ICON_GROUPS, refresh, wireSegmented,
  fmtNum, fmtRelativeDay, fmtDateRange, fmtDateShort,
} from '../ui.js';

export async function render(view) {
  setTop({ title: 'Treino', showBar: false });

  const [active, workouts, sets, exercises] = await Promise.all([
    db.getActiveWorkout(),
    db.listWorkouts(),
    db.listAllSets(),
    db.listExercises(),
  ]);

  const unit = db.settings().unit;
  const setsByWorkout = new Map();
  for (const s of sets) {
    if (!setsByWorkout.has(s.workoutId)) setsByWorkout.set(s.workoutId, []);
    setsByWorkout.get(s.workoutId).push(s);
  }
  const workoutsById = new Map(workouts.map((w) => [w.id, w]));
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));

  const container = node('<div class="stack"></div>');

  if (!active && workouts.length === 0) container.append(firstTimeCard());

  const firstWeek = workouts.length
    ? mondayOf(workouts.reduce((min, w) => (w.startedAt < min ? w.startedAt : min), workouts[0].startedAt))
    : null;
  container.append(weekCard(sets, workoutsById, exercisesById, unit, firstWeek));

  if (workouts.length) container.append(trendCard(sets, workoutsById, unit));

  const finished = workouts.filter((w) => w.finishedAt);
  if (finished.length) {
    container.append(node(`<h2 class="section-title">${t('home.recentWorkouts')}</h2>`));
    container.append(recentList(finished.slice(0, 5), setsByWorkout, unit));
  }

  view.append(container);
}

/* ---------- Treino ---------- */

function firstTimeCard() {
  return node(html`
    <div class="card card__pad" style="text-align:center">
      <p class="muted small" style="margin:0">${t('home.firstTime')}</p>
    </div>
  `);
}

/* ---------- Resumo da semana ---------- */

function weekTitle(offset) {
  if (offset === 0) return t('home.week.this');
  if (offset === 1) return t('home.week.last');
  return tn('common.weeksAgo', offset);
}

// Series por grupo muscular, nao so volume total: e a metrica que a
// literatura de dose-resposta usa (Schoenfeld/Baz-Valle), e o app ja tinha
// o dado (muscleGroup por exercicio) sem expor essa leitura.
//
// Escopo de modulo, nao da funcao: sobrevive a abrir um treino em "ultimos
// treinos" (ou qualquer outra tela) e voltar — sem isso a home sempre
// reabria em "essa semana", perdendo a semana que a pessoa estava vendo.
let weekOffset = 0; // semanas para tras; 0 = semana atual

// Card com estado proprio (offset de semanas), no molde de createStepper em
// ui.js: navegar entre semanas so troca o referenceDate passado pra
// weekMuscleGroupSummary e redesenha o card — series/treinos/exercicios ja
// estao todos em memoria, sem consulta nova ao banco por clique.
function weekCard(sets, workoutsById, exercisesById, unit, firstWeek) {
  const el = node('<div class="card"></div>');

  function draw() {
    const ref = new Date();
    ref.setDate(ref.getDate() - weekOffset * 7);
    const {
      start, end, workouts: weekWorkouts, sets: weekSets, volume, byGroup,
    } = weekMuscleGroupSummary(sets, workoutsById, exercisesById, ref);

    const canGoBack = firstWeek != null && start > firstWeek;
    const canGoForward = weekOffset > 0;
    const maxSets = byGroup.reduce((m, g) => Math.max(m, g.sets), 0);

    const groupRows = byGroup.map((g) => html`
      <div class="muscle-group__row${g.sets === maxSets ? ' muscle-group__row--top' : ''}">
        <span class="muscle-group__icon" aria-hidden="true">${raw(ICON_GROUPS[g.group] || '')}</span>
        <span class="muscle-group__name">${groupLabel(g.group)}</span>
        <span class="muscle-group__track"><span class="muscle-group__fill" style="width:${maxSets ? (g.sets / maxSets) * 100 : 0}%"></span></span>
        <span class="muscle-group__sets">${g.sets}</span>
      </div>
    `).join('');

    el.innerHTML = html`
      <div class="card__pad row row--between" style="${byGroup.length ? 'padding-bottom:10px' : ''}">
        <button class="icon-btn week-nav__back" data-back aria-label="${t('home.week.previous')}" ${canGoBack ? '' : 'disabled'}>${raw(ICON.chevron)}</button>
        <div style="text-align:center">
          <h2 style="font-size:1rem">${weekTitle(weekOffset)}</h2>
          <p class="muted small" style="margin:2px 0 0">${fmtDateRange(start, end)}</p>
        </div>
        <button class="icon-btn" data-forward aria-label="${t('home.week.next')}" ${canGoForward ? '' : 'disabled'}>${raw(ICON.chevron)}</button>
      </div>
      <div class="stats stats--hero">
        <div class="stat">
          <div class="stat__val">${fmtNum(volume, 0)}</div>
          <div class="stat__label">${t('home.stat.volume', { unit })}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${weekWorkouts}</div>
          <div class="stat__label">${t('home.stat.workouts')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${weekSets}</div>
          <div class="stat__label">${t('home.stat.sets')}</div>
        </div>
      </div>
      ${byGroup.length ? raw(`<div class="muscle-group card__pad">${groupRows}</div>`) : ''}
    `;

    el.querySelector('[data-back]').onclick = () => { weekOffset += 1; draw(); };
    el.querySelector('[data-forward]').onclick = () => { weekOffset -= 1; draw(); };
  }

  draw();
  return el;
}

/* ---------- Tendencia semanal ---------- */

// Funcao, nao const de modulo: precisa reavaliar t() a cada render, ja que o
// idioma pode mudar em runtime (ver idioma:mudou em app.js).
function trendMetrics() {
  return {
    sets: { short: t('home.trend.metricSets'), label: t('home.trend.labelSets') },
    volume: { short: t('home.trend.metricVolume'), label: t('home.trend.labelVolume') },
  };
}

function trendCard(sets, workoutsById, unit) {
  const trend = weeklyTrend(sets, workoutsById, 8);
  const metrics = trendMetrics();

  const card = node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:6px">
        <h2 style="font-size:1rem">${t('home.trend.title')}</h2>
        <p class="muted small" data-change style="margin:2px 0 10px"></p>
        <div class="segmented" data-metrics>
          ${raw(Object.entries(metrics)
            .map(([key, metric], i) => `<button class="segmented__btn" data-m="${key}" aria-pressed="${i === 0}">${metric.short}</button>`)
            .join(''))}
        </div>
      </div>
      <div data-chart style="padding:6px 8px 12px"></div>
    </div>
  `);

  const chartArea = card.querySelector('[data-chart]');
  const changeText = card.querySelector('[data-change]');

  const draw = (key) => {
    const metric = metrics[key];
    chartArea.innerHTML = '';

    if (!trend.some((p) => p.sets > 0)) {
      chartArea.append(node(html`
        <div class="empty small">
          ${raw(ICON.dumbbell)}
          <p>${t('home.trend.empty')}</p>
        </div>
      `));
      changeText.textContent = '';
      return;
    }

    const points = trend.map((p) => ({
      when: p.start.toISOString(),
      value: p[key],
      label: t('home.trend.pointLabel', {
        workouts: p.workouts, sets: fmtNum(p.sets, 0), volume: fmtNum(p.volume, 0), unit,
      }),
    }));

    chartArea.append(lineChart({
      points,
      suffix: key === 'sets' ? '' : ` ${unit}`,
      decimals: 0,
    }));

    const change = progressPct(trend, key);
    changeText.textContent = change == null ? '' :
      t('home.trend.change', {
        sign: change >= 0 ? '+' : '',
        value: fmtNum(change, 1),
        label: metric.label,
        date: fmtDateShort(trend[0].start),
      });
  };

  wireSegmented(card, (button) => draw(button.dataset.m));
  draw('sets');
  return card;
}

/* ---------- Ultimos treinos ---------- */

function recentList(workouts, setsByWorkout, unit) {
  const items = workouts.map((w) => {
    const r = workoutSummary(setsByWorkout.get(w.id) || []);
    return html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${w.id}">
          <div class="grow">
            <div style="font-weight:650">${fmtRelativeDay(w.startedAt)}</div>
            <div class="muted small">
              ${tn('common.exercise', r.exercises)} ·
              ${tn('common.set', r.sets)} ·
              ${fmtNum(r.volume, 0)} ${unit}
            </div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </a>
      </li>
    `;
  });

  return node(html`
    <div class="card">
      <ul class="list">${raw(items.join(''))}</ul>
    </div>
  `);
}
