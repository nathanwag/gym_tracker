/* Sessao de treino — a tela principal do app.
 *
 * Prioridade de design: registrar uma serie de pe, entre uma e outra, com o
 * minimo de toques. Por isso o compositor ja vem preenchido com a serie
 * anterior, os ajustes sao por botoes de +/- e a referencia do ultimo treino
 * fica visivel no cabecalho de cada exercicio — e o que responde na hora
 * "estou evoluindo ou nao?".
 */

import * as db from '../db.js';
import {
  evaluatePR, prSetIds, setE1rm, isDurationSet, workoutSummary,
} from '../models.js';
import { thumbHtml } from '../media.js';
import { takeLastAdded } from './exercise-picker.js';
import { openShareSheet } from '../share-image.js';
import { createSetComposer, isEmptySet } from '../set-composer.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, toast,
  confirmSheet, fmtNum, fmtRelativeDay, fmtDuration, fmtSet, fmtSetWithUnit, buzz,
} from '../ui.js';

/** Estado da tela. Recriado a cada render; as telas nao compartilham estado. */
let ctx = null;

export async function render(view) {
  const workout = await db.getActiveWorkout();
  if (!workout) { location.hash = '#/'; return; }

  const [exercises, allSets, workouts] = await Promise.all([
    db.listExercises(),
    db.listAllSets(),
    db.listWorkouts(),
  ]);

  const cfg = db.settings();
  ctx = {
    workout,
    unit: cfg.unit,
    weightStep: Number(cfg.weightIncrement) || 2.5,
    repsStep: Number(cfg.repsIncrement) || 1,
    exercises: new Map(exercises.map((e) => [e.id, e])),
    list: exercises,
    workouts: new Map(workouts.map((w) => [w.id, w])),
    // Fonte unica de verdade: todas as series do banco. As da sessao e o
    // historico de cada exercicio sao derivados daqui por filtro.
    allSets,
    editing: new Map(),
    // Persistido no treino (completedIds) pra sobreviver a sair e voltar pra
    // sessao — sem isso todo exercicio reabria ao trocar de tela.
    collapsed: new Set(workout.completedIds || []),
  };

  const top = setTop({
    title: t('session.title'),
    back: '#/',
    actions: `
      <button class="icon-btn" data-discard aria-label="${t('session.discardWorkout')}">${ICON.trash}</button>
      <button class="btn btn--sm btn--primary" data-finish>${t('session.finish')}</button>
    `,
  });
  top.querySelector('[data-finish]').onclick = finish;
  top.querySelector('[data-discard]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('session.confirmDiscard.title'),
      message: t('session.confirmDiscard.message'),
      confirmLabel: t('session.confirmDiscard.label'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    toast(t('session.toastDiscarded'));
    location.hash = '#/';
  };

  const root = node('<div class="stack"></div>');
  root.append(summaryCard());
  root.append(node('<div class="stack" data-list></div>'));

  const add = node(html`
    <button class="btn btn--block" data-add-ex style="margin-top:12px">
      ${raw(ICON.plus)} ${t('session.addExercise')}
    </button>
  `);
  add.onclick = openPicker;
  root.append(add);

  root.append(node('<div data-completed-wrap></div>'));

  view.append(root);
  renderList();

  // Voltando do seletor: rola ate o exercicio que acabou de entrar, que fica
  // no fim da lista e pode estar fora da tela.
  const added = takeLastAdded();
  if (added) {
    document.querySelector(`[data-ex="${added}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/** Redesenha as duas listas (ativos e concluidos) a partir do zero — chamada
 *  sempre que um exercicio muda de lado (colapsa/reabre) ou e adicionado/
 *  removido, porque isso move o item entre dois containers diferentes, e nao
 *  da pra fazer isso com um replaceWith pontual como o rebuildCard faz. */
/** Grava quais exercicios estao concluidos no proprio treino, em segundo
 *  plano — a lista na tela ja foi redesenhada, isto so garante que sair e
 *  voltar pra sessao (ou reabrir o app) preserva o estado. */
function persistCollapsed() {
  ctx.workout.completedIds = [...ctx.collapsed];
  db.updateWorkout(ctx.workout.id, { completedIds: ctx.workout.completedIds });
}

/** Marca (ou desmarca) um exercicio como concluido: atualiza o set em
 *  memoria, redesenha as duas listas e persiste — os tres passos que toda
 *  mudanca de lado precisa, num lugar so. */
function setCollapsed(exId, collapsed) {
  if (collapsed) ctx.collapsed.add(exId);
  else ctx.collapsed.delete(exId);
  renderList();
  persistCollapsed();
}

function renderList() {
  const listEl = document.querySelector('[data-list]');
  const completedWrap = document.querySelector('[data-completed-wrap]');
  if (!listEl || !completedWrap) return;

  const ids = ctx.workout.exerciseIds || [];
  const active = ids.filter((id) => !ctx.collapsed.has(id));
  const completed = ids.filter((id) => ctx.collapsed.has(id));

  listEl.innerHTML = '';
  for (const id of active) listEl.append(exerciseCard(id));

  completedWrap.innerHTML = '';
  if (completed.length) {
    completedWrap.append(node(`<h2 class="section-title">${t('session.done')}</h2>`));
    const card = node('<div class="card"><ul class="list" data-completed></ul></div>');
    const ul = card.querySelector('ul');
    for (const id of completed) ul.append(completedItem(id));
    completedWrap.append(card);
  }
}

/* ---------- Consultas derivadas ---------- */

const setsInWorkout = () => ctx.allSets.filter((s) => s.workoutId === ctx.workout.id);
const setsForExercise = (exId) => ctx.allSets.filter((s) => s.exerciseId === exId);
const setsHere = (exId) => ctx.allSets.filter((s) => s.workoutId === ctx.workout.id && s.exerciseId === exId);

/** Series do exercicio no treino anterior mais recente (ignorando o atual). */
function previousSession(exId) {
  const others = ctx.allSets.filter((s) => s.exerciseId === exId && s.workoutId !== ctx.workout.id);
  if (!others.length) return null;
  // Ids de treino sao autoincremento: o maior e sempre o mais recente.
  const lastWorkoutId = others.reduce((max, s) => Math.max(max, s.workoutId), 0);
  const sets = others.filter((s) => s.workoutId === lastWorkoutId);
  // A data vem do treino, nao da serie: editar uma serie depois nao deve
  // mudar a data em que aquele treino aconteceu.
  const when = ctx.workouts.get(lastWorkoutId)?.startedAt || sets[0].createdAt;
  return { workoutId: lastWorkoutId, sets, when };
}

/* ---------- Resumo do topo ---------- */

function summaryCard() {
  const summary = workoutSummary(setsInWorkout());
  const zeroMin = `0${t('common.min')}`;
  const el = node(html`
    <div class="card" data-summary>
      <div class="stats">
        <div class="stat">
          <div class="stat__val" data-duration>${fmtDuration(ctx.workout.startedAt, new Date().toISOString()) || zeroMin}</div>
          <div class="stat__label">${t('session.summary.duration')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${summary.sets}</div>
          <div class="stat__label">${t('session.summary.sets')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(summary.volume, 0)}</div>
          <div class="stat__label">${t('session.summary.volume', { unit: ctx.unit })}</div>
        </div>
      </div>
    </div>
  `);

  // O cronometro se cancela sozinho quando a tela sai do DOM.
  const timer = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(timer); return; }
    el.querySelector('[data-duration]').textContent =
      fmtDuration(ctx.workout.startedAt, new Date().toISOString()) || zeroMin;
  }, 30000);

  return el;
}

function updateSummary() {
  const old = document.querySelector('[data-summary]');
  if (old) old.replaceWith(summaryCard());
}

/* ---------- Cartao de exercicio ---------- */

function rebuildCard(exId) {
  const old = document.querySelector(`[data-ex="${exId}"]`);
  if (old) old.replaceWith(exerciseCard(exId));
}

function exerciseCard(exId) {
  const ex = ctx.exercises.get(exId);
  if (!ex) return node('<div hidden></div>');

  const here = setsHere(exId);
  const prIds = prSetIds(setsForExercise(exId));
  const previous = previousSession(exId);
  const editingId = ctx.editing.get(exId) ?? null;
  const editing = here.find((s) => s.id === editingId) || null;

  const card = node(html`<section class="card" data-ex="${exId}"></section>`);

  const header = node(html`
    <div class="exercise__head">
      ${raw(thumbHtml(ex))}
      <div class="grow">
        <h2 class="exercise__name">${ex.name}</h2>
        <div class="exercise__meta">${raw(previousText(previous))}</div>
      </div>
      <button class="icon-btn" data-collapse aria-label="${t('session.markDone', { name: ex.name })}">${raw(ICON.check)}</button>
      <button class="icon-btn" data-detail aria-label="${t('session.seeProgressFor', { name: ex.name })}">${raw(ICON.chevron)}</button>
      <button class="icon-btn" data-remove aria-label="${t('session.removeFromWorkout', { name: ex.name })}">${raw(ICON.trash)}</button>
    </div>
  `);
  header.querySelector('[data-collapse]').onclick = () => setCollapsed(exId, true);
  header.querySelector('[data-detail]').onclick = () => { location.hash = `#/exercicios/${exId}`; };
  header.querySelector('[data-remove]').onclick = () => removeExercise(exId, ex.name);
  card.append(header);

  if (here.length) {
    const ul = node('<ul class="setlist"></ul>');
    here.forEach((s, i) => ul.append(setItem(s, i + 1, prIds.has(s.id), s.id === editingId)));
    card.append(ul);
  }
  card.append(createSetComposer({
    exercise: ex,
    unit: ctx.unit,
    weightStep: ctx.weightStep,
    repsStep: ctx.repsStep,
    editing,
    // Pre-preenchimento, em ordem de preferencia: a serie sendo editada, a
    // ultima serie deste treino, a primeira serie do treino anterior.
    base: editing || here[here.length - 1] || previous?.sets?.[0] || null,
    onAdd: (values, warmup) => addSet(exId, values, warmup),
    onSave: (values) => saveEdit(exId, editing, values),
    onDelete: () => deleteSet(exId, editing),
    // So no modo edicao a sessao mostra Cancelar; ao adicionar, o compositor
    // fica sempre visivel e nao ha o que cancelar.
    onCancel: editing ? () => { ctx.editing.delete(exId); rebuildCard(exId); } : undefined,
  }));
  return card;
}

/** Linha compacta pra um exercicio marcado como concluido — sem thumb e sem
 *  os tres botoes de acao grandes do cabecalho ativo, so nome + resumo do
 *  que foi feito. Reabrir (e so entao excluir/ver evolucao) e um toque. */
function completedItem(exId) {
  const ex = ctx.exercises.get(exId);
  if (!ex) return node('<li hidden></li>');

  const here = setsHere(exId);
  const li = node(html`
    <li class="list__item">
      <button class="list__link" data-reopen aria-label="${t('session.reopen', { name: ex.name })}">
        <div class="grow">
          <div style="font-weight:600">${ex.name}</div>
          <div class="muted small">${raw(sessionSummaryText(here))}</div>
        </div>
        <span class="list__done">${raw(ICON.check)}</span>
      </button>
    </li>
  `);
  li.querySelector('[data-reopen]').onclick = () => setCollapsed(exId, false);
  return li;
}

/** Texto de uma serie na comparacao/resumo, com asterisco de aquecimento —
 *  o valor em si (duracao ou peso×reps) vem de fmtSet (ui.js). */
function setText(s) {
  return `${fmtSet(s)}${s.warmup ? '*' : ''}`;
}

function previousText(previous) {
  if (!previous) return html`<span class="muted">${t('session.firstTime')}</span>`;
  const summary = previous.sets.map(setText).join('   ');
  return html`${t('session.lastTime', { date: fmtRelativeDay(previous.when) })} <b class="tnum">${summary}</b>`;
}

/** Resumo do que ja foi feito aqui, usado no cabecalho quando o exercicio
 *  esta colapsado — nesse ponto o que importa e o que a pessoa acabou de
 *  registrar, nao mais a comparacao com o treino anterior. */
function sessionSummaryText(here) {
  if (!here.length) return html`<span class="muted">${t('session.noSetsLogged')}</span>`;
  const summary = here.map(setText).join('   ');
  return html`${tn('common.set', here.length)}: <b class="tnum">${summary}</b>`;
}

function setItem(set, number, isPR, active) {
  const timeBased = isDurationSet(set);
  const li = node(html`
    <li>
      <button class="setlist__item" data-set="${set.id}" aria-current="${active}">
        <span class="setlist__num">${number}</span>
        <span class="setlist__val">${fmtSetWithUnit(set, ctx.unit)}</span>
        ${set.warmup ? raw(`<span class="setlist__warm">${t('history.warmup')}</span>`) : ''}
        ${isPR ? raw('<span class="badge badge--pr">🏆 PR</span>') : ''}
        <span class="grow"></span>
        ${(!set.warmup && !timeBased) ? raw(`<span class="muted small tnum">1RM ${fmtNum(setE1rm(set), 0)}</span>`) : ''}
      </button>
    </li>
  `);

  li.querySelector('button').onclick = () => {
    const current = ctx.editing.get(set.exerciseId);
    if (current === set.id) ctx.editing.delete(set.exerciseId);
    else ctx.editing.set(set.exerciseId, set.id);
    rebuildCard(set.exerciseId);
  };
  return li;
}

/* ---------- Mutacoes ---------- */

async function addSet(exId, values, warmup) {
  if (isEmptySet(values)) {
    toast('durationSec' in values ? t('session.enterDuration') : t('session.enterReps'));
    return;
  }

  const newSet = await db.addSet({
    workoutId: ctx.workout.id,
    exerciseId: exId,
    ...values,
    warmup,
  });
  ctx.allSets.push(newSet);

  const pr = evaluatePR(newSet, setsForExercise(exId));
  rebuildCard(exId);
  updateSummary();
  buzz(18);

  if (pr.duration) toast(t('session.timeRecord'));
  else if (pr.weight) toast(t('session.weightRecord'));
  else if (pr.e1rm) toast(t('session.strengthRecord'));
}

async function saveEdit(exId, set, values) {
  if (isEmptySet(values)) {
    toast('durationSec' in values ? t('session.enterDuration') : t('session.enterReps'));
    return;
  }
  await db.updateSet(set.id, values);
  Object.assign(set, values);
  ctx.editing.delete(exId);
  rebuildCard(exId);
  updateSummary();
  toast(t('session.setUpdated'));
}

async function deleteSet(exId, set) {
  await db.deleteSet(set.id);
  const i = ctx.allSets.findIndex((s) => s.id === set.id);
  if (i >= 0) ctx.allSets.splice(i, 1);
  ctx.editing.delete(exId);
  rebuildCard(exId);
  updateSummary();
  toast(t('session.setDeleted'));
}

async function removeExercise(exId, name) {
  const hasSets = setsHere(exId).length;
  const ok = await confirmSheet({
    title: t('session.confirmRemove.title', { name }),
    message: hasSets ? t('session.confirmRemove.messageWithSets', { sets: tn('common.set', hasSets) }) : '',
    confirmLabel: t('session.confirmRemove.label'),
    danger: true,
  });
  if (!ok) return;

  await db.removeExerciseFromWorkout(ctx.workout.id, exId);
  ctx.workout.exerciseIds = (ctx.workout.exerciseIds || []).filter((id) => id !== exId);
  ctx.allSets = ctx.allSets.filter((s) => !(s.workoutId === ctx.workout.id && s.exerciseId === exId));
  setCollapsed(exId, false);
  updateSummary();
}

async function finish() {
  const sets = setsInWorkout();

  if (!sets.length) {
    const ok = await confirmSheet({
      title: t('session.confirmFinishNoSets.title'),
      message: t('session.confirmFinishNoSets.message'),
      confirmLabel: t('session.confirmFinishNoSets.label'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    location.hash = '#/';
    return;
  }

  const summary = workoutSummary(sets);
  const ok = await confirmSheet({
    title: t('session.confirmFinish.title'),
    message: t('session.confirmFinish.message', {
      sets: tn('common.set', summary.sets),
      exercises: tn('common.exercise', summary.exercises),
      volume: fmtNum(summary.volume, 0),
      unit: ctx.unit,
    }),
    confirmLabel: t('session.finish'),
  });
  if (!ok) return;

  await db.finishWorkout(ctx.workout.id);
  toast(t('session.toastFinished'));
  const workout = await db.getWorkout(ctx.workout.id);
  // O historico completo e o que permite o cartao marcar recorde.
  const allSets = await db.listAllSets();
  await openShareSheet(workout, sets, ctx.exercises, ctx.unit, allSets);
  location.hash = `#/historico/${ctx.workout.id}`;
}

/* ---------- Seletor de exercicios ---------- */

function openPicker() {
  location.hash = `#/treino/${ctx.workout.id}/adicionar`;
}
