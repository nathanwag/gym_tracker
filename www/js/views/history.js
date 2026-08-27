/* Historico: lista de treinos e o detalhe de um treino. */

import * as db from '../db.js';
import {
  workoutSummary, prSetIds, setE1rm, totalVolume, totalDuration, isDurationSet,
  orderedWorkoutExercises,
} from '../models.js';
import { thumbHtml } from '../media.js';
import { openShareSheet } from '../share-image.js';
import { openExercisePicker } from './exercise-picker.js';
import { createSetComposer, isEmptySet } from '../set-composer.js';
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
   Detalhe / edicao de um treino
   ========================================================================== */

// Estado da tela, recriado a cada render. `editMode` e a serie em edicao
// sobrevivem a um refresh-in-place (mesmo padrao de rememberedMode em
// exercise.js), mas nao a trocar de treino.
let ctx = null;
let editMode = false;
let editingSetId = null;
let addingSetFor = null;
let lastWorkoutId = null;

export async function renderWorkout(view, workoutId) {
  if (workoutId !== lastWorkoutId) {
    editMode = false;
    editingSetId = null;
    addingSetFor = null;
    lastWorkoutId = workoutId;
  }

  const cfg = db.settings();
  ctx = {
    workoutId,
    unit: cfg.unit,
    weightStep: Number(cfg.weightIncrement) || 2.5,
    repsStep: Number(cfg.repsIncrement) || 1,
    root: node('<div class="stack"></div>'),
  };

  await reloadWorkout();

  if (!ctx.workout) {
    setTop({ title: t('history.genericTitle'), back: '#/historico' });
    view.append(node(`<div class="card card__pad">${t('history.notFound')}</div>`));
    return;
  }

  workoutTopbar();
  view.append(ctx.root);
  paintWorkout();
}

async function reloadWorkout() {
  const [workout, sets, exercises, allSets] = await Promise.all([
    db.getWorkout(ctx.workoutId),
    db.listSetsByWorkout(ctx.workoutId),
    db.listExercises(),
    db.listAllSets(),
  ]);
  ctx.workout = workout;
  ctx.sets = sets;
  ctx.exercises = exercises;
  ctx.allSets = allSets;
  ctx.byId = new Map(exercises.map((e) => [e.id, e]));
}

/** Topbar do detalhe: compartilhar e Editar/Concluir so em treino finalizado,
 *  apagar sempre. Refeita a cada troca de modo porque o rotulo do botao muda. */
function workoutTopbar() {
  const { workout } = ctx;

  setTop({
    title: fmtDate(workout.startedAt),
    back: '#/historico',
    actions: `
      ${workout.finishedAt ? `<button class="icon-btn" data-share aria-label="${t('history.share')}">${ICON.image}</button>` : ''}
      ${workout.finishedAt ? `<button class="btn btn--sm btn--ghost" data-edit>${t(editMode ? 'history.doneEditing' : 'history.edit')}</button>` : ''}
      <button class="btn btn--sm btn--ghost" data-delete aria-label="${t('history.delete')}">${t('common.delete')}</button>
    `,
  });

  document.querySelector('[data-share]')?.addEventListener('click', () => {
    openShareSheet(ctx.workout, ctx.sets, ctx.byId, ctx.unit);
  });

  const editBtn = document.querySelector('[data-edit]');
  if (editBtn) {
    editBtn.onclick = () => {
      editMode = !editMode;
      editingSetId = null;
      addingSetFor = null;
      workoutTopbar();
      paintWorkout();
    };
  }

  document.querySelector('[data-delete]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('history.confirmDelete.title'),
      message: t('history.confirmDelete.message'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    toast(t('history.toastDeleted'));
    location.hash = '#/historico';
  };
}

/** Redesenha o corpo abaixo da topbar. Chamada a cada mutacao no modo de
 *  edicao; preserva a rolagem para editar a 5a serie nao pular pro topo. */
function paintWorkout() {
  const y = window.scrollY;
  const { workout, sets, root } = ctx;
  root.innerHTML = '';

  root.append(statsCard());

  if (!workout.finishedAt) {
    const resume = node(`<button class="btn btn--primary btn--block">${t('history.resume')}</button>`);
    resume.onclick = () => { location.hash = '#/sessao'; };
    root.append(resume);
  }

  const order = orderedWorkoutExercises(workout.exerciseIds, sets);
  const visible = order.filter((exId) => editMode || sets.some((s) => s.exerciseId === exId));

  if (!visible.length) {
    root.append(node(`<div class="card"><div class="empty small"><p>${t('history.noSets')}</p></div></div>`));
  } else {
    for (const exId of visible) root.append(workoutExerciseCard(exId, order));
  }

  if (editMode) {
    const addEx = node(html`
      <button class="btn btn--block" data-add-ex style="margin-top:12px">
        ${raw(ICON.plus)} ${t('history.addExercise')}
      </button>
    `);
    addEx.onclick = openWorkoutExercisePicker;
    root.append(addEx);
  }

  window.scrollTo(0, y);
}

function statsCard() {
  const { workout, unit } = ctx;
  const summary = workoutSummary(ctx.sets);
  return node(html`
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
  `);
}

function workoutExerciseCard(exId, order) {
  const {
    sets, allSets, byId, unit,
  } = ctx;
  const exSets = sets.filter((s) => s.exerciseId === exId);
  const ex = byId.get(exId);
  const prIds = prSetIds(allSets.filter((s) => s.exerciseId === exId));
  const name = ex?.name || t('history.removedExercise');
  const i = order.indexOf(exId);

  const card = node(html`<div class="card" data-ex="${exId}"></div>`);

  const meta = exSets.length
    ? html`${tn('common.set', exSets.length)} ·
        ${isDurationSet(exSets[0])
          ? fmtTempoSerie(totalDuration(exSets))
          : `${fmtNum(totalVolume(exSets), 0)} ${unit}`}`
    : tn('common.set', 0);

  const head = node(html`
    <div class="exercise__head">
      ${ex ? raw(thumbHtml(ex)) : ''}
      <div class="grow">
        <h2 class="exercise__name">${name}</h2>
        <div class="exercise__meta">${raw(meta)}</div>
      </div>
      ${editMode ? raw(`
        <button class="icon-btn" data-up aria-label="${t('history.moveUp')}" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
        <button class="icon-btn" data-down aria-label="${t('history.moveDown')}" ${i === order.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        <button class="icon-btn" data-remove aria-label="${t('history.removeExercise', { name })}">${ICON.trash}</button>
      `) : (ex ? raw(`<a class="icon-btn" href="#/exercicios/${ex.id}" aria-label="${t('history.seeProgress')}">${ICON.chevron}</a>`) : '')}
    </div>
  `);

  if (editMode) {
    head.querySelector('[data-up]').onclick = () => moveWorkoutExercise(order, i, -1);
    head.querySelector('[data-down]').onclick = () => moveWorkoutExercise(order, i, 1);
    head.querySelector('[data-remove]').onclick = () => removeWorkoutExercise(exId, name);
  }
  card.append(head);

  // Conteudo de uma linha de serie (num, valor, aquec., PR, 1RM). O involucro
  // muda por modo: <div> inerte na leitura, <button> tocavel na edicao.
  const setRowInner = (s, idx) => html`
    <span class="setlist__num">${idx + 1}</span>
    <span class="setlist__val">${fmtSetWithUnit(s, unit)}</span>
    ${s.warmup ? raw(`<span class="setlist__warm">${t('history.warmup')}</span>`) : ''}
    ${prIds.has(s.id) ? raw('<span class="badge badge--pr">🏆 PR</span>') : ''}
    <span class="grow"></span>
    ${(!s.warmup && !isDurationSet(s)) ? raw(`<span class="muted small tnum">1RM ${fmtNum(setE1rm(s), 0)}</span>`) : ''}
  `;

  if (!editMode) {
    if (exSets.length) {
      const rows = exSets.map((s, idx) => html`
        <li class="list__item">
          <div class="setlist__item" style="cursor:default">${raw(setRowInner(s, idx))}</div>
        </li>
      `);
      card.append(node(html`<ul class="list">${raw(rows.join(''))}</ul>`));
    }
    return card;
  }

  // ---- Modo de edicao ----
  const ul = node('<ul class="setlist"></ul>');
  exSets.forEach((s, idx) => {
    const li = node(html`
      <li>
        <button class="setlist__item" data-set="${s.id}" aria-current="${s.id === editingSetId}">${raw(setRowInner(s, idx))}</button>
      </li>
    `);
    li.querySelector('button').onclick = () => {
      editingSetId = editingSetId === s.id ? null : s.id;
      addingSetFor = null;
      paintWorkout();
    };
    ul.append(li);
  });
  card.append(ul);

  const editing = editingSetId != null && exSets.find((s) => s.id === editingSetId);
  if (editing) {
    card.append(createSetComposer({
      exercise: ex,
      unit,
      weightStep: ctx.weightStep,
      repsStep: ctx.repsStep,
      editing,
      base: editing,
      onSave: (values) => saveWorkoutSet(editing, values),
      onDelete: () => deleteWorkoutSet(editing),
      onCancel: () => { editingSetId = null; paintWorkout(); },
    }));
  } else if (addingSetFor === exId) {
    const anyForEx = allSets.filter((s) => s.exerciseId === exId);
    card.append(createSetComposer({
      exercise: ex,
      unit,
      weightStep: ctx.weightStep,
      repsStep: ctx.repsStep,
      editing: null,
      base: exSets[exSets.length - 1] || anyForEx[anyForEx.length - 1] || null,
      onAdd: (values, warmup) => addWorkoutSet(exId, values, warmup),
      onCancel: () => { addingSetFor = null; paintWorkout(); },
    }));
  } else {
    const wrap = node(html`
      <div style="padding:8px 14px 12px">
        <button class="btn btn--sm btn--ghost btn--block" data-add-set>${raw(ICON.plus)} ${t('history.addSet')}</button>
      </div>
    `);
    wrap.querySelector('button').onclick = () => {
      addingSetFor = exId;
      editingSetId = null;
      paintWorkout();
    };
    card.append(wrap);
  }

  return card;
}

async function moveWorkoutExercise(order, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= order.length) return;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  await db.updateWorkout(ctx.workout.id, { exerciseIds: next });
  await reloadWorkout();
  paintWorkout();
}

async function removeWorkoutExercise(exId, name) {
  const count = ctx.sets.filter((s) => s.exerciseId === exId).length;
  const ok = await confirmSheet({
    title: t('history.confirmRemoveExercise.title', { name }),
    message: count ? t('history.confirmRemoveExercise.message', { sets: tn('common.set', count) }) : '',
    confirmLabel: t('history.confirmRemoveExercise.label'),
    danger: true,
  });
  if (!ok) return;
  await db.removeExerciseFromWorkout(ctx.workout.id, exId);
  if (addingSetFor === exId) addingSetFor = null;
  editingSetId = null;
  await reloadWorkout();
  paintWorkout();
  toast(t('history.toastExerciseRemoved'));
}

async function saveWorkoutSet(set, values) {
  if (isEmptySet(values)) {
    toast('durationSec' in values ? t('session.enterDuration') : t('session.enterReps'));
    return;
  }
  await db.updateSet(set.id, values);
  editingSetId = null;
  await reloadWorkout();
  paintWorkout();
  toast(t('session.setUpdated'));
}

async function deleteWorkoutSet(set) {
  await db.deleteSet(set.id);
  editingSetId = null;
  await reloadWorkout();
  paintWorkout();
  toast(t('session.setDeleted'));
}

async function addWorkoutSet(exId, values, warmup) {
  if (isEmptySet(values)) {
    toast('durationSec' in values ? t('session.enterDuration') : t('session.enterReps'));
    return;
  }
  await db.addSet({
    workoutId: ctx.workout.id, exerciseId: exId, ...values, warmup,
  });
  addingSetFor = null;
  await reloadWorkout();
  paintWorkout();
}

function openWorkoutExercisePicker() {
  openExercisePicker({
    exercises: ctx.exercises,
    alreadyChosenIds: new Set(orderedWorkoutExercises(ctx.workout.exerciseIds, ctx.sets)),
    onChoose: async (exercise) => {
      await db.addExerciseToWorkout(ctx.workout.id, exercise.id);
      await reloadWorkout();
      paintWorkout();
      toast(t('history.toastExerciseAdded'));
      document.querySelector(`[data-ex="${exercise.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });
}
