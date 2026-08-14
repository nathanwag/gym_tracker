/* Tela inicial: comecar ou retomar um treino, resumo da semana e ultimos treinos. */

import * as db from '../db.js';
import { workoutSummary, weekMuscleGroupSummary } from '../models.js';
import {
  setTop, html, raw, node, ICON, ICON_GRUPO, refresh,
  fmtNum, fmtRelativeDay, fmtDateRange, isIOS, isStandalone,
} from '../ui.js';

export async function render(view) {
  setTop({ title: 'Treino' });

  const [ativo, treinos, series, exercicios] = await Promise.all([
    db.getActiveWorkout(),
    db.listWorkouts(),
    db.listAllSets(),
    db.listExercises(),
  ]);

  const unidade = db.settings().unidade;
  const seriesPorTreino = new Map();
  for (const s of series) {
    if (!seriesPorTreino.has(s.workoutId)) seriesPorTreino.set(s.workoutId, []);
    seriesPorTreino.get(s.workoutId).push(s);
  }
  const treinosPorId = new Map(treinos.map((t) => [t.id, t]));
  const exerciciosPorId = new Map(exercicios.map((e) => [e.id, e]));

  const container = node('<div class="stack"></div>');

  const aviso = cardInstalacao();
  if (aviso) container.append(aviso);

  if (!ativo && treinos.length === 0) container.append(cardPrimeiraVez());

  container.append(cardSemana(weekMuscleGroupSummary(series, treinosPorId, exerciciosPorId), unidade));

  const finalizados = treinos.filter((t) => t.finalizadoEm);
  if (finalizados.length) {
    container.append(node('<h2 class="section-title">Últimos treinos</h2>'));
    container.append(listaRecentes(finalizados.slice(0, 5), seriesPorTreino, unidade));
  }

  view.append(container);
}

/* ---------- Instalacao na tela de inicio ----------
 * No iPhone isso nao e cosmetico: o Safari descarta os dados de sites comuns
 * depois de ~7 dias sem uso, e apps adicionados a tela de inicio sao isentos
 * dessa limpeza. Por isso o aviso insiste ate o app estar instalado. */

function cardInstalacao() {
  if (isStandalone() || db.settings().instalarOculto) return null;

  const passos = isIOS()
    ? 'Toque em <b>Compartilhar</b> na barra do Safari e escolha <b>Adicionar à Tela de Início</b>.'
    : 'Abra o menu do navegador e escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.';

  const el = node(html`
    <div class="card card__pad">
      <div class="row row--between" style="align-items:flex-start">
        <h2 style="font-size:1rem">Instale na tela de início</h2>
        <button class="btn btn--sm btn--ghost" data-ocultar>Depois</button>
      </div>
      <p class="muted small" style="margin-top:6px">${raw(passos)}</p>
      <p class="muted small" style="margin-bottom:0">
        Instalado, o app abre em tela cheia, funciona sem internet e seus treinos ficam
        protegidos da limpeza automática de dados do navegador.
      </p>
    </div>
  `);

  el.querySelector('[data-ocultar]').onclick = async () => {
    await db.setSetting('instalarOculto', true);
    refresh();
  };
  return el;
}

/* ---------- Treino ---------- */

function cardPrimeiraVez() {
  return node(html`
    <div class="card card__pad" style="text-align:center">
      <p class="muted small" style="margin:0">
        Toque no + na barra de baixo pra começar. Cada série que você registrar
        vira um ponto no gráfico de evolução.
      </p>
    </div>
  `);
}

/* ---------- Resumo da semana ---------- */

// Series por grupo muscular, nao so volume total: e a metrica que a
// literatura de dose-resposta usa (Schoenfeld/Baz-Valle), e o app ja tinha
// o dado (grupoMuscular por exercicio) sem expor essa leitura.
function cardSemana(resumoSemana, unidade) {
  const { inicio, fim, treinos, series, volume, porGrupo } = resumoSemana;
  const maxSeries = porGrupo.reduce((m, g) => Math.max(m, g.series), 0);

  const linhasGrupo = porGrupo.map((g) => html`
    <div class="mgrupo__linha">
      <span class="mgrupo__icone" aria-hidden="true">${raw(ICON_GRUPO[g.grupo] || '')}</span>
      <span class="mgrupo__nome">${g.grupo}</span>
      <span class="mgrupo__track"><span class="mgrupo__fill" style="width:${maxSeries ? (g.series / maxSeries) * 100 : 0}%"></span></span>
      <span class="mgrupo__series">${g.series}</span>
    </div>
  `).join('');

  return node(html`
    <div class="card">
      <div class="card__pad" style="${porGrupo.length ? 'padding-bottom:10px' : ''}">
        <h2 style="font-size:1rem">Essa semana</h2>
        <p class="muted small" style="margin:2px 0 0">${fmtDateRange(inicio, fim)}</p>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat__val">${treinos}</div>
          <div class="stat__label">treinos</div>
        </div>
        <div class="stat">
          <div class="stat__val">${series}</div>
          <div class="stat__label">séries</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(volume, 0)}</div>
          <div class="stat__label">volume (${unidade})</div>
        </div>
      </div>
      ${porGrupo.length ? raw(`<div class="mgrupo card__pad">${linhasGrupo}</div>`) : ''}
    </div>
  `);
}

/* ---------- Ultimos treinos ---------- */

function listaRecentes(treinos, seriesPorTreino, unidade) {
  const itens = treinos.map((t) => {
    const r = workoutSummary(seriesPorTreino.get(t.id) || []);
    return html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${t.id}">
          <div class="grow">
            <div style="font-weight:650">${fmtRelativeDay(t.iniciadoEm)}</div>
            <div class="muted small">
              ${r.exercicios} ${r.exercicios === 1 ? 'exercício' : 'exercícios'} ·
              ${r.series} ${r.series === 1 ? 'série' : 'séries'} ·
              ${fmtNum(r.volume, 0)} ${unidade}
            </div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </a>
      </li>
    `;
  });

  return node(html`
    <div class="card">
      <ul class="list">${raw(itens.join(''))}</ul>
    </div>
  `);
}
