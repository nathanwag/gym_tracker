/* Historico: lista de treinos e o detalhe de um treino. */

import * as db from '../db.js';
import { workoutSummary, prSetIds, setE1rm } from '../models.js';
import { thumbHtml } from '../media.js';
import {
  setTop, html, raw, node, ICON, toast, confirmSheet,
  fmtNum, fmtDate, fmtRelativeDay, fmtWeekday, fmtDuration,
} from '../ui.js';

const MES_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/* ==========================================================================
   Lista de treinos
   ========================================================================== */

export async function render(view) {
  setTop({ title: 'Histórico' });

  const [treinos, series] = await Promise.all([db.listWorkouts(), db.listAllSets()]);
  const unidade = db.settings().unidade;

  if (!treinos.length) {
    view.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>Nenhum treino registrado ainda.</p>
        <a class="btn btn--primary" href="#/">Começar o primeiro</a>
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
    const mes = MES_ANO.format(new Date(treino.iniciadoEm));
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
              ${treino.finalizadoEm ? '' : raw('<span class="badge badge--accent">em andamento</span>')}
            </div>
            <div class="muted small">
              ${r.exercicios} ${r.exercicios === 1 ? 'exercício' : 'exercícios'} ·
              ${r.series} ${r.series === 1 ? 'série' : 'séries'} ·
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
    setTop({ title: 'Treino', back: '#/historico' });
    view.append(node('<div class="card card__pad">Treino não encontrado.</div>'));
    return;
  }

  const unidade = db.settings().unidade;
  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const resumo = workoutSummary(series);

  setTop({
    title: fmtDate(treino.iniciadoEm),
    back: '#/historico',
    actions: '<button class="btn btn--sm btn--ghost" data-apagar aria-label="Apagar treino">Apagar</button>',
  });
  document.querySelector('[data-apagar]').onclick = async () => {
    const ok = await confirmSheet({
      title: 'Apagar este treino?',
      message: 'Todas as séries dele serão removidas do histórico e dos gráficos.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(treino.id);
    toast('Treino apagado.');
    location.hash = '#/historico';
  };

  const root = node('<div class="stack"></div>');

  root.append(node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:10px">
        <div class="row" style="gap:8px">
          <h2 style="font-size:1rem">${fmtWeekday(treino.iniciadoEm)}</h2>
          ${treino.finalizadoEm ? '' : raw('<span class="badge badge--accent">em andamento</span>')}
        </div>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat__val">${fmtDuration(treino.iniciadoEm, treino.finalizadoEm) || '—'}</div>
          <div class="stat__label">duração</div>
        </div>
        <div class="stat">
          <div class="stat__val">${resumo.series}</div>
          <div class="stat__label">séries</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(resumo.volume, 0)}</div>
          <div class="stat__label">volume (${unidade})</div>
        </div>
      </div>
    </div>
  `));

  if (!treino.finalizadoEm) {
    const retomar = node('<button class="btn btn--primary btn--block">Retomar este treino</button>');
    retomar.onclick = () => { location.hash = '#/sessao'; };
    root.append(retomar);
  }

  // Ordem dos exercicios: a mesma da sessao; quem tiver serie sem estar na
  // lista (dado antigo ou importado) entra no fim.
  const ordem = [...(treino.exerciseIds || [])];
  for (const s of series) if (!ordem.includes(s.exerciseId)) ordem.push(s.exerciseId);

  if (!series.length) {
    root.append(node('<div class="card"><div class="empty small"><p>Nenhuma série registrada neste treino.</p></div></div>'));
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
          ${s.aquecimento ? raw('<span class="setlist__warm">aquec.</span>') : ''}
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
            <h2 class="exercise__name">${ex?.nome || 'Exercício removido'}</h2>
            <div class="exercise__meta">
              ${doExercicio.length} ${doExercicio.length === 1 ? 'série' : 'séries'} ·
              ${fmtNum(doExercicio.reduce((a, s) => a + (s.aquecimento ? 0 : s.peso * s.reps), 0), 0)} ${unidade}
            </div>
          </div>
          ${ex ? raw(`<a class="icon-btn" href="#/exercicios/${ex.id}" aria-label="Ver evolução">${ICON.chevron}</a>`) : ''}
        </div>
        <ul class="list">${raw(linhas.join(''))}</ul>
      </div>
    `));
  }

  view.append(root);
}
