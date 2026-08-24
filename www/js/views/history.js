/* Historico: lista de treinos e o detalhe de um treino. */

import * as db from '../db.js';
import { workoutSummary, prSetIds, setE1rm, totalVolume } from '../models.js';
import { thumbHtml } from '../media.js';
import { t, tn, locale } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, toast, confirmSheet,
  fmtNum, fmtDate, fmtRelativeDay, fmtWeekday, fmtDuration,
} from '../ui.js';

const mesAno = (iso) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(iso));

/* ==========================================================================
   Lista de treinos
   ========================================================================== */

export async function render(view) {
  setTop({ title: t('history.titulo'), barra: false });

  const [treinos, series] = await Promise.all([db.listWorkouts(), db.listAllSets()]);
  const unidade = db.settings().unidade;

  if (!treinos.length) {
    view.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('history.vazio.mensagem')}</p>
        <a class="btn btn--primary" href="#/">${t('history.vazio.comecar')}</a>
      </div></div>
    `));
    return;
  }

  const porTreino = new Map();
  for (const s of series) {
    if (!porTreino.has(s.workoutId)) porTreino.set(s.workoutId, []);
    porTreino.get(s.workoutId).push(s);
  }

  const root = node('<div></div>');
  let mesAtual = null;

  for (const treino of treinos) {
    const mes = mesAno(treino.iniciadoEm);
    if (mes !== mesAtual) {
      mesAtual = mes;
      root.append(node(html`<h2 class="section-title">${mes}</h2>`));
      root.append(node('<div class="card"><ul class="list"></ul></div>'));
    }

    const r = workoutSummary(porTreino.get(treino.id) || []);
    const ul = root.lastElementChild.querySelector('ul');
    ul.append(node(html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${treino.id}">
          <div class="grow">
            <div class="row" style="gap:6px">
              <span style="font-weight:650">${fmtRelativeDay(treino.iniciadoEm)}</span>
              ${treino.finalizadoEm ? '' : raw(`<span class="badge badge--accent">${t('history.emAndamento')}</span>`)}
            </div>
            <div class="muted small">
              ${tn('common.exercicio', r.exercicios)} ·
              ${tn('common.serie', r.series)} ·
              ${fmtNum(r.volume, 0)} ${unidade}
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
  const [treino, series, exercicios, todasSeries] = await Promise.all([
    db.getWorkout(workoutId),
    db.listSetsByWorkout(workoutId),
    db.listExercises(),
    db.listAllSets(),
  ]);

  if (!treino) {
    setTop({ title: t('history.tituloGenerico'), back: '#/historico' });
    view.append(node(`<div class="card card__pad">${t('history.naoEncontrado')}</div>`));
    return;
  }

  const unidade = db.settings().unidade;
  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const resumo = workoutSummary(series);

  setTop({
    title: fmtDate(treino.iniciadoEm),
    back: '#/historico',
    actions: `<button class="btn btn--sm btn--ghost" data-apagar aria-label="${t('history.apagar')}">${t('common.apagar')}</button>`,
  });
  document.querySelector('[data-apagar]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('history.confirmarApagar.titulo'),
      message: t('history.confirmarApagar.mensagem'),
      confirmLabel: t('common.apagar'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(treino.id);
    toast(t('history.toastApagado'));
    location.hash = '#/historico';
  };

  const root = node('<div class="stack"></div>');

  root.append(node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:10px">
        <div class="row" style="gap:8px">
          <h2 style="font-size:1rem">${fmtWeekday(treino.iniciadoEm)}</h2>
          ${treino.finalizadoEm ? '' : raw(`<span class="badge badge--accent">${t('history.emAndamento')}</span>`)}
        </div>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat__val">${fmtDuration(treino.iniciadoEm, treino.finalizadoEm) || '—'}</div>
          <div class="stat__label">${t('history.stat.duracao')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${resumo.series}</div>
          <div class="stat__label">${t('history.stat.series')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(resumo.volume, 0)}</div>
          <div class="stat__label">${t('history.stat.volume', { unidade })}</div>
        </div>
      </div>
    </div>
  `));

  if (!treino.finalizadoEm) {
    const retomar = node(`<button class="btn btn--primary btn--block">${t('history.retomar')}</button>`);
    retomar.onclick = () => { location.hash = '#/sessao'; };
    root.append(retomar);
  }

  // Ordem dos exercicios: a mesma da sessao; quem tiver serie sem estar na
  // lista (dado antigo ou importado) entra no fim.
  const ordem = [...(treino.exerciseIds || [])];
  for (const s of series) if (!ordem.includes(s.exerciseId)) ordem.push(s.exerciseId);

  if (!series.length) {
    root.append(node(`<div class="card"><div class="empty small"><p>${t('history.semSeries')}</p></div></div>`));
  }

  for (const exId of ordem) {
    const doExercicio = series.filter((s) => s.exerciseId === exId);
    if (!doExercicio.length) continue;

    const ex = porId.get(exId);
    const prIds = prSetIds(todasSeries.filter((s) => s.exerciseId === exId));

    const linhas = doExercicio.map((s, i) => html`
      <li class="list__item">
        <div class="setlist__item" style="cursor:default">
          <span class="setlist__num">${i + 1}</span>
          <span class="setlist__val">${fmtNum(s.peso, 2)} ${unidade} × ${s.reps}</span>
          ${s.aquecimento ? raw(`<span class="setlist__warm">${t('history.aquec')}</span>`) : ''}
          ${prIds.has(s.id) ? raw('<span class="badge badge--pr">🏆 PR</span>') : ''}
          <span class="grow"></span>
          ${s.aquecimento ? '' : raw(`<span class="muted small tnum">1RM ${fmtNum(setE1rm(s), 0)}</span>`)}
        </div>
      </li>
    `);

    root.append(node(html`
      <div class="card">
        <div class="exercise__head">
          ${ex ? raw(thumbHtml(ex)) : ''}
          <div class="grow">
            <h2 class="exercise__name">${ex?.nome || t('history.exercicioRemovido')}</h2>
            <div class="exercise__meta">
              ${tn('common.serie', doExercicio.length)} ·
              ${fmtNum(totalVolume(doExercicio), 0)} ${unidade}
            </div>
          </div>
          ${ex ? raw(`<a class="icon-btn" href="#/exercicios/${ex.id}" aria-label="${t('history.verEvolucao')}">${ICON.chevron}</a>`) : ''}
        </div>
        <ul class="list">${raw(linhas.join(''))}</ul>
      </div>
    `));
  }

  view.append(root);
}
