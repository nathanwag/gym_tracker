/* Historico: lista de treinos e o detalhe de um treino. */

import * as db from '../db.js';
import {
  workoutSummary, prSetIds, setE1rm, totalVolume, totalDuration, isDurationSet,
} from '../models.js';
import { thumbHtml } from '../media.js';
import { openShareSheet } from '../share-image.js';
import { t, tn, locale } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, toast, confirmSheet,
  fmtNum, fmtDate, fmtRelativeDay, fmtWeekday, fmtDuration, fmtTempoSerie, fmtSetWithUnit,
} from '../ui.js';

const monthYear = (iso) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(iso));

/* ==========================================================================
   Lista de treinos
   ========================================================================== */

export async function render(view) {
  setTop({ title: t('history.title'), showBar: false });

  const [workouts, sets] = await Promise.all([db.listWorkouts(), db.listAllSets()]);
  const unit = db.settings().unit;

  if (!workouts.length) {
    view.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('history.empty.message')}</p>
        <a class="btn btn--primary" href="#/">${t('history.empty.start')}</a>
      </div></div>
    `));
    return;
  }

  const byWorkout = new Map();
  for (const s of sets) {
    if (!byWorkout.has(s.workoutId)) byWorkout.set(s.workoutId, []);
    byWorkout.get(s.workoutId).push(s);
  }

  const root = node('<div></div>');
  let currentMonth = null;

  for (const workout of workouts) {
    const month = monthYear(workout.startedAt);
    if (month !== currentMonth) {
      currentMonth = month;
      root.append(node(html`<h2 class="section-title">${month}</h2>`));
      root.append(node('<div class="card"><ul class="list"></ul></div>'));
    }

    const r = workoutSummary(byWorkout.get(workout.id) || []);
    const ul = root.lastElementChild.querySelector('ul');
    ul.append(node(html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${workout.id}">
          <div class="grow">
            <div class="row" style="gap:6px">
              <span style="font-weight:650">${fmtRelativeDay(workout.startedAt)}</span>
              ${workout.finishedAt ? '' : raw(`<span class="badge badge--accent">${t('history.inProgress')}</span>`)}
            </div>
            <div class="muted small">
              ${tn('common.exercise', r.exercises)} ·
              ${tn('common.set', r.sets)} ·
              ${fmtNum(r.volume, 0)} ${unit}
            </div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </a>
      </li>
    `));
  }

  view.append(root);
}

/* ==========================================================================
   Detalhe de um treino
   ========================================================================== */

export async function renderWorkout(view, workoutId) {
  const [workout, sets, exercises, allSets] = await Promise.all([
    db.getWorkout(workoutId),
    db.listSetsByWorkout(workoutId),
    db.listExercises(),
    db.listAllSets(),
  ]);

  if (!workout) {
    setTop({ title: t('history.genericTitle'), back: '#/historico' });
    view.append(node(`<div class="card card__pad">${t('history.notFound')}</div>`));
    return;
  }

  const unit = db.settings().unit;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const summary = workoutSummary(sets);

  setTop({
    title: fmtDate(workout.startedAt),
    back: '#/historico',
    actions: `
      ${workout.finishedAt ? `<button class="icon-btn" data-share aria-label="${t('history.share')}">${ICON.image}</button>` : ''}
      <button class="btn btn--sm btn--ghost" data-delete aria-label="${t('history.delete')}">${t('common.delete')}</button>
    `,
  });
  document.querySelector('[data-share]')?.addEventListener('click', () => {
    openShareSheet(workout, sets, byId, unit);
  });
  document.querySelector('[data-delete]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('history.confirmDelete.title'),
      message: t('history.confirmDelete.message'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(workout.id);
    toast(t('history.toastDeleted'));
    location.hash = '#/historico';
  };

  const root = node('<div class="stack"></div>');

  root.append(node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:10px">
        <div class="row" style="gap:8px">
          <h2 style="font-size:1rem">${fmtWeekday(workout.startedAt)}</h2>
          ${workout.finishedAt ? '' : raw(`<span class="badge badge--accent">${t('history.inProgress')}</span>`)}
        </div>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat__val">${fmtDuration(workout.startedAt, workout.finishedAt) || '—'}</div>
          <div class="stat__label">${t('history.stat.duration')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${summary.sets}</div>
          <div class="stat__label">${t('history.stat.sets')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(summary.volume, 0)}</div>
          <div class="stat__label">${t('history.stat.volume', { unit })}</div>
        </div>
      </div>
    </div>
  `));

  if (!workout.finishedAt) {
    const resume = node(`<button class="btn btn--primary btn--block">${t('history.resume')}</button>`);
    resume.onclick = () => { location.hash = '#/sessao'; };
    root.append(resume);
  }

  // Ordem dos exercicios: a mesma da sessao; quem tiver serie sem estar na
  // lista (dado antigo ou importado) entra no fim.
  const order = [...(workout.exerciseIds || [])];
  for (const s of sets) if (!order.includes(s.exerciseId)) order.push(s.exerciseId);

  if (!sets.length) {
    root.append(node(`<div class="card"><div class="empty small"><p>${t('history.noSets')}</p></div></div>`));
  }

  for (const exId of order) {
    const exerciseSets = sets.filter((s) => s.exerciseId === exId);
    if (!exerciseSets.length) continue;

    const ex = byId.get(exId);
    const prIds = prSetIds(allSets.filter((s) => s.exerciseId === exId));

    const rows = exerciseSets.map((s, i) => {
      const timeBased = isDurationSet(s);
      return html`
      <li class="list__item">
        <div class="setlist__item" style="cursor:default">
          <span class="setlist__num">${i + 1}</span>
          <span class="setlist__val">${fmtSetWithUnit(s, unit)}</span>
          ${s.warmup ? raw(`<span class="setlist__warm">${t('history.warmup')}</span>`) : ''}
          ${prIds.has(s.id) ? raw('<span class="badge badge--pr">🏆 PR</span>') : ''}
          <span class="grow"></span>
          ${(!s.warmup && !timeBased) ? raw(`<span class="muted small tnum">1RM ${fmtNum(setE1rm(s), 0)}</span>`) : ''}
        </div>
      </li>
    `;
    });
    const exerciseIsTimeBased = isDurationSet(exerciseSets[0]);

    root.append(node(html`
      <div class="card">
        <div class="exercise__head">
          ${ex ? raw(thumbHtml(ex)) : ''}
          <div class="grow">
            <h2 class="exercise__name">${ex?.name || t('history.removedExercise')}</h2>
            <div class="exercise__meta">
              ${tn('common.set', exerciseSets.length)} ·
              ${exerciseIsTimeBased ? fmtTempoSerie(totalDuration(exerciseSets)) : `${fmtNum(totalVolume(exerciseSets), 0)} ${unit}`}
            </div>
          </div>
          ${ex ? raw(`<a class="icon-btn" href="#/exercicios/${ex.id}" aria-label="${t('history.seeProgress')}">${ICON.chevron}</a>`) : ''}
        </div>
        <ul class="list">${raw(rows.join(''))}</ul>
      </div>
    `));
  }

  view.append(root);
}
