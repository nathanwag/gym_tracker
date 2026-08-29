/* Tela inicial: comecar ou retomar um treino, resumo da semana e ultimos treinos. */

import * as db from '../db.js';
import {
  weekMuscleGroupSummary, weeklyTrend, progressPct, mondayOf, allPrIds,
} from '../models.js';
import { lineChart } from '../charts.js';
import { t, tn } from '../i18n.js';
import { groupLabel } from '../seed.js';
import {
  setTop, html, raw, node, ICON, groupColor, workoutRow, wireSegmented,
  fmtNum, fmtDateRange, fmtMinutes,
} from '../ui.js';

/* Referencia de series semanais por grupo. Nao e meta configuravel nem
 * promessa: e a faixa que a literatura de dose-resposta (Schoenfeld,
 * Baz-Valle) trata como produtiva, desenhada como um traco na barra. Sem
 * nenhuma referencia, comprimento de barra so diz "mais que o outro" — nao
 * diz se a semana foi suficiente. */
const WEEKLY_SET_GOAL = 10;

export async function render(view) {
  setTop({ title: t('app.tab.workout') });

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

  const container = node('<div></div>');

  if (!active && workouts.length === 0) container.append(firstTimeCard());

  const firstWeek = workouts.length
    ? mondayOf(workouts.reduce((min, w) => (w.startedAt < min ? w.startedAt : min), workouts[0].startedAt))
    : null;
  container.append(weekBlock(sets, workoutsById, exercisesById, unit, firstWeek));

  if (workouts.length) container.append(trendCard(sets, workoutsById, unit));

  const finished = workouts.filter((w) => w.finishedAt);
  if (finished.length) {
    container.append(node(`<h2 class="section-title">${t('home.recentWorkouts')}</h2>`));
    container.append(recentList(finished.slice(0, 5), setsByWorkout, exercisesById, sets, unit));
  }

  view.append(container);
}

/* ---------- Treino ---------- */

function firstTimeCard() {
  return node(html`
    <div class="card card__pad" style="text-align:center;margin-bottom:16px">
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

// Bloco com estado proprio (offset de semanas), no molde de createStepper em
// ui.js: navegar entre semanas so troca o referenceDate passado pra
// weekMuscleGroupSummary e redesenha — series/treinos/exercicios ja estao
// todos em memoria, sem consulta nova ao banco por clique.
//
// Sem cartao em volta: o volume da semana e o assunto da tela, e um cartao o
// colocava no mesmo peso visual do grafico e da lista logo abaixo.
function weekBlock(sets, workoutsById, exercisesById, unit, firstWeek) {
  const el = node('<div></div>');

  function draw() {
    const ref = new Date();
    ref.setDate(ref.getDate() - weekOffset * 7);
    const {
      start, end, workouts: weekWorkouts, sets: weekSets, volume, gymSeconds, byGroup,
    } = weekMuscleGroupSummary(sets, workoutsById, exercisesById, ref);

    const canGoBack = firstWeek != null && start > firstWeek;
    const canGoForward = weekOffset > 0;

    // Escala comum a todas as barras, nunca menor que a meta: assim as barras
    // seguem comparaveis entre si e o traco da meta continua visivel mesmo
    // numa semana em que ninguem chegou perto. A folga de 8% evita que ele
    // caia exatamente na borda direita, onde viraria so mais uma linha.
    const scale = Math.max(WEEKLY_SET_GOAL, byGroup.reduce((m, g) => Math.max(m, g.sets), 0)) * 1.08;
    const goalAt = (WEEKLY_SET_GOAL / scale) * 100;

    const groupRows = byGroup.map((g) => html`
      <div class="muscle-group__row${g.sets < WEEKLY_SET_GOAL ? ' muscle-group__row--under' : ''}">
        <span class="muscle-group__name">${groupLabel(g.group)}</span>
        <span class="muscle-group__track">
          <span class="muscle-group__fill" style="width:${(g.sets / scale) * 100}%;background:${groupColor(g.group)}"></span>
          <span class="muscle-group__goal" style="left:${goalAt}%"></span>
        </span>
        <span class="muscle-group__sets">${g.sets}</span>
      </div>
    `).join('');

    el.innerHTML = html`
      <div class="week__nav">
        <span class="tag" title="${fmtDateRange(start, end)}">${weekTitle(weekOffset)}</span>
        <span class="week__arrows">
          <button class="icon-btn week-nav__back" data-back aria-label="${t('home.week.previous')}" ${canGoBack ? '' : 'disabled'}>${raw(ICON.chevron)}</button>
          <button class="icon-btn" data-forward aria-label="${t('home.week.next')}" ${canGoForward ? '' : 'disabled'}>${raw(ICON.chevron)}</button>
        </span>
      </div>

      <div class="week__big">
        <span class="data">${fmtNum(volume, 0)}</span>
        <span class="week__unit">${unit}</span>
      </div>
      <div class="week__sub">
        <span><span class="data">${weekWorkouts}</span> ${tn('home.stat.workouts', weekWorkouts)}</span>
        <span><span class="data">${weekSets}</span> ${tn('home.stat.sets', weekSets)}</span>
        ${gymSeconds ? raw(`<span><span class="data">${fmtMinutes(gymSeconds / 60)}</span> ${t('home.gymTime')}</span>`) : ''}
      </div>

      ${byGroup.length ? raw(`
        <div class="lab"><span>${t('home.byGroup')}</span><span>${t('home.goal', { n: WEEKLY_SET_GOAL })}</span></div>
        <div class="muscle-group">${groupRows}</div>
      `) : ''}
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

// Sem cartao, como o bloco da semana: um rotulo com a metrica de um lado e a
// variacao do outro, e o grafico solto no fundo. O cartao punha a tendencia no
// mesmo peso do resumo, e ela e a leitura secundaria da tela.
function trendCard(sets, workoutsById, unit) {
  const trend = weeklyTrend(sets, workoutsById, 8);
  const metrics = trendMetrics();

  const card = node(html`
    <div>
      <div class="lab">
        <span data-window></span>
        <span data-change></span>
      </div>
      <div class="segmented" data-metrics>
        ${raw(Object.entries(metrics)
          .map(([key, metric], i) => `<button class="segmented__btn" data-m="${key}" aria-pressed="${i === 0}">${metric.short}</button>`)
          .join(''))}
      </div>
      <div data-chart style="padding:10px 0 2px"></div>
    </div>
  `);

  const chartArea = card.querySelector('[data-chart]');
  const changeText = card.querySelector('[data-change]');
  const windowText = card.querySelector('[data-window]');

  const draw = (key) => {
    const metric = metrics[key];
    chartArea.innerHTML = '';
    windowText.textContent = t('home.trend.window', { label: metric.short });

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

    // So o percentual, na cor do sinal: a frase inteira ("em volume por semana
    // desde 06/07") repetia o que o rotulo ao lado e o eixo do grafico ja dizem.
    const change = progressPct(trend, key);
    changeText.textContent = change == null ? '' :
      t('home.trend.pct', { sign: change >= 0 ? '+' : '', value: fmtNum(change, 1) });
    changeText.style.color = change == null || change === 0 ? '' : `var(--${change > 0 ? 'success' : 'danger'})`;
  };

  wireSegmented(card, (button) => draw(button.dataset.m));
  draw('sets');
  return card;
}

/* ---------- Ultimos treinos ---------- */

function recentList(workouts, setsByWorkout, exercisesById, allSets, unit) {
  // Uma passada so pelo historico inteiro, por exercicio: cada linha depois
  // so pergunta quantas das suas series estao no conjunto. Calcular PR por
  // treino, dentro do laco, releria o historico a cada linha.
  const prIds = allPrIds(allSets);

  const list = node('<div></div>');
  for (const w of workouts) {
    const workoutSets = setsByWorkout.get(w.id) || [];
    list.append(workoutRow(w, workoutSets, exercisesById, {
      unit,
      prCount: workoutSets.filter((s) => prIds.has(s.id)).length,
    }));
  }
  return list;
}
