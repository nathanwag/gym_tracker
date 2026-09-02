/* Historico: lista de treinos e o detalhe de um treino. */

import * as db from '../db.js';
import {
  workoutSummary, workoutGroupBreakdown, prSetIds, allPrIds, orderedWorkoutExercises, moveInOrder,
} from '../models.js';
import { exerciseBanner } from '../media.js';
import { openShareSheet } from '../share-image.js';
import { takeLastAdded } from './exercise-picker.js';
import { createSetComposer, isEmptySet } from '../set-composer.js';
import { t, tn, locale } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, toast, confirmSheet, workoutRow, setLedger, signatureHtml,
  fmtNum, fmtDate, fmtWeekday, fmtDuration,
} from '../ui.js';

// So o nome do mes; o ano entra so quando nao e o corrente. "AGOSTO DE 2026"
// em caixa alta no tamanho do cabecalho nao cabe ao lado do total.
const monthName = (iso) => new Intl.DateTimeFormat(locale(), { month: 'long' }).format(new Date(iso));
const monthKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

/* ==========================================================================
   Lista de treinos
   ========================================================================== */

export async function render(view) {
  setTop({ title: t('history.title') });

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

  const exercises = await db.listExercises();
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));

  const byWorkout = new Map();
  for (const s of sets) {
    if (!byWorkout.has(s.workoutId)) byWorkout.set(s.workoutId, []);
    byWorkout.get(s.workoutId).push(s);
  }

  // Uma passada so pelo historico inteiro; cada linha depois so pergunta
  // quantas das suas series estao no conjunto.
  const prIds = allPrIds(sets);
  const thisYear = new Date().getFullYear();

  const root = node('<div></div>');
  let currentMonth = null;

  for (const workout of workouts) {
    const key = monthKey(workout.startedAt);
    if (key !== currentMonth) {
      currentMonth = key;
      root.append(monthHeader(workout.startedAt, workouts, byWorkout, unit, thisYear));
    }

    const workoutSets = byWorkout.get(workout.id) || [];
    root.append(workoutRow(workout, workoutSets, exercisesById, {
      unit,
      prCount: workoutSets.filter((s) => prIds.has(s.id)).length,
      badge: workout.finishedAt ? '' : `<span class="badge badge--accent">${t('history.inProgress')}</span>`,
    }));
  }

  view.append(root);
}

/** Cabecalho de mes com o total movido no periodo — o numero que responde
 *  "esse mes rendeu?" sem abrir treino nenhum. */
function monthHeader(iso, workouts, byWorkout, unit, thisYear) {
  const key = monthKey(iso);
  const total = workouts
    .filter((w) => monthKey(w.startedAt) === key)
    .reduce((acc, w) => acc + workoutSummary(byWorkout.get(w.id) || []).volume, 0);

  const year = new Date(iso).getFullYear();
  const name = year === thisYear ? monthName(iso) : `${monthName(iso)} ${year}`;

  return node(html`
    <div class="mo">
      <h2 class="mo__name">${name}</h2>
      <span class="mo__total">${fmtNum(total, 0)} ${unit}</span>
    </div>
  `);
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

  // Voltando do seletor: avisa e rola ate o exercicio recem-adicionado.
  const added = takeLastAdded();
  if (added) {
    toast(t('history.toastExerciseAdded'));
    document.querySelector(`[data-ex="${added}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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

/** Topbar do detalhe. Em leitura: compartilhar + Editar. Em edicao: so
 *  Concluir — nao se compartilha no meio de uma edicao.
 *
 *  "Apagar treino" NAO fica aqui: desce pro fim da tela (ver paintWorkout).
 *  Tres acoes disputavam espaco com a data, e a destrutiva ficava a um toque
 *  de distancia no modo leitura. Mesma decisao da tela de editar exercicio.
 *  Refeita a cada troca de modo porque as acoes mudam. */
function workoutTopbar() {
  const { workout } = ctx;

  setTop({
    title: fmtDate(workout.startedAt),
    back: '#/historico',
    actions: editMode
      ? `<button class="btn btn--sm btn--primary" data-edit>${t('history.doneEditing')}</button>`
      : (workout.finishedAt ? `
          <button class="icon-btn" data-share aria-label="${t('history.share')}">${ICON.image}</button>
          <button class="btn btn--sm btn--ghost" data-edit>${t('history.edit')}</button>
        ` : ''),
  });

  document.querySelector('[data-share]')?.addEventListener('click', () => {
    // ctx.allSets vai junto: o cartao marca recorde, e pra isso precisa do
    // historico do exercicio, nao so das series deste treino.
    openShareSheet(ctx.workout, ctx.sets, ctx.byId, ctx.unit, ctx.allSets);
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

}

/** "Apagar treino" no fim da tela. Aparece no modo de edicao (onde se mexe no
 *  treino) e em treino ainda aberto, que nao tem modo de edicao pra entrar. */
function deleteWorkoutButton() {
  const button = node(html`<button class="btn btn--block btn--danger">${t('history.delete')}</button>`);
  button.onclick = async () => {
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
  return button;
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

  // Treino em aberto nao tem modo de edicao pra entrar, entao o apagar precisa
  // aparecer nele tambem.
  if (editMode || !workout.finishedAt) root.append(deleteWorkoutButton());

  window.scrollTo(0, y);
}

/** Cabecalho do treino, no mesmo molde do resumo da semana: o volume e o
 *  assunto, sem cartao em volta. A assinatura de cor logo abaixo e a mesma que
 *  identificou este treino na lista — abrir um treino continua a leitura de
 *  onde ela parou, em vez de trocar de linguagem. */
function statsCard() {
  const { workout, unit } = ctx;
  const summary = workoutSummary(ctx.sets);
  const breakdown = workoutGroupBreakdown(ctx.sets, ctx.byId);
  const duration = fmtDuration(workout.startedAt, workout.finishedAt);

  return node(html`
    <div>
      <div class="row" style="gap:8px">
        <span class="tag">${fmtWeekday(workout.startedAt)}</span>
        ${workout.finishedAt ? '' : raw(`<span class="badge badge--accent">${t('history.inProgress')}</span>`)}
      </div>
      <div class="week__big week__big--sm">
        <span class="data">${fmtNum(summary.volume, 0)}</span>
        <span class="week__unit">${unit}</span>
      </div>
      <div class="week__sub">
        ${duration ? raw(`<span><span class="data">${duration}</span> ${t('history.trainingTime')}</span>`) : ''}
        <span><span class="data">${summary.sets}</span> ${tn('home.stat.sets', summary.sets)}</span>
        <span><span class="data">${summary.exercises}</span> ${tn('history.stat.exercises', summary.exercises)}</span>
      </div>
      ${breakdown.length ? raw(`<div style="padding-top:8px">${signatureHtml(breakdown)}</div>`) : ''}
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

  const head = exerciseBanner({
    exercise: ex,
    name,
    // Faixa baixa: aqui a foto identifica o exercicio; conferir execucao no
    // meio da serie e trabalho da sessao, que usa a faixa cheia.
    small: true,
    actions: editMode
      ? `
        <button class="icon-btn" data-up aria-label="${t('history.moveUp')}" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
        <button class="icon-btn" data-down aria-label="${t('history.moveDown')}" ${i === order.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        <button class="icon-btn" data-remove aria-label="${t('history.removeExercise', { name })}">${ICON.trash}</button>
      `
      : (ex ? `<a class="icon-btn" href="#/exercicios/${ex.id}" aria-label="${t('history.seeProgress')}">${ICON.chevron}</a>` : ''),
  });

  if (editMode) {
    head.querySelector('[data-up]').onclick = () => moveWorkoutExercise(order, i, -1);
    head.querySelector('[data-down]').onclick = () => moveWorkoutExercise(order, i, 1);
    head.querySelector('[data-remove]').onclick = () => removeWorkoutExercise(exId, name);
  }
  card.append(head);

  // O resumo do exercicio (4 series · 1.553 kg) some: o livro-razao logo
  // abaixo mostra as quatro series, e somar quatro numeros a vista nao paga
  // uma linha de texto.
  if (exSets.length) {
    card.append(setLedger({
      sets: exSets,
      prIds,
      editingId: editMode ? editingSetId : null,
      // Leitura deixa as linhas inertes; so no modo de edicao elas abrem o
      // compositor.
      onPick: editMode
        ? (s) => {
          editingSetId = editingSetId === s.id ? null : s.id;
          addingSetFor = null;
          paintWorkout();
        }
        : null,
    }));
  }

  if (!editMode) return card;

  // ---- Modo de edicao ----
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
  await db.updateWorkout(ctx.workout.id, { exerciseIds: moveInOrder(order, i, dir) });
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
  location.hash = `#/treino/${ctx.workout.id}/adicionar`;
}
