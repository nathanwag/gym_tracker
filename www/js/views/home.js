/* Tela inicial: comecar ou retomar um treino, resumo da semana e ultimos treinos. */

import * as db from '../db.js';
import {
  workoutSummary, weekMuscleGroupSummary, weeklyTrend, progressPct, segundaFeira,
} from '../models.js';
import { lineChart } from '../charts.js';
import { t, tn } from '../i18n.js';
import { grupoLabel } from '../seed.js';
import {
  setTop, html, raw, node, ICON, ICON_GRUPO, refresh, wireSegmented,
  fmtNum, fmtRelativeDay, fmtDateRange, fmtDateShort,
} from '../ui.js';

export async function render(view) {
  setTop({ title: 'Treino', barra: false });

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

  if (!ativo && treinos.length === 0) container.append(cardPrimeiraVez());

  const primeiraSemana = treinos.length
    ? segundaFeira(treinos.reduce((min, t) => (t.iniciadoEm < min ? t.iniciadoEm : min), treinos[0].iniciadoEm))
    : null;
  container.append(cardSemana(series, treinosPorId, exerciciosPorId, unidade, primeiraSemana));

  if (treinos.length) container.append(cardTendencia(series, treinosPorId, unidade));

  const finalizados = treinos.filter((w) => w.finalizadoEm);
  if (finalizados.length) {
    container.append(node(`<h2 class="section-title">${t('home.ultimosTreinos')}</h2>`));
    container.append(listaRecentes(finalizados.slice(0, 5), seriesPorTreino, unidade));
  }

  view.append(container);
}

/* ---------- Treino ---------- */

function cardPrimeiraVez() {
  return node(html`
    <div class="card card__pad" style="text-align:center">
      <p class="muted small" style="margin:0">${t('home.primeiraVez')}</p>
    </div>
  `);
}

/* ---------- Resumo da semana ---------- */

function tituloSemana(offset) {
  if (offset === 0) return t('home.semana.essa');
  if (offset === 1) return t('home.semana.passada');
  return tn('common.semanasAtras', offset);
}

// Series por grupo muscular, nao so volume total: e a metrica que a
// literatura de dose-resposta usa (Schoenfeld/Baz-Valle), e o app ja tinha
// o dado (grupoMuscular por exercicio) sem expor essa leitura.
//
// Card com estado proprio (offset de semanas), no molde de createStepper em
// ui.js: navegar entre semanas so troca o referenceDate passado pra
// weekMuscleGroupSummary e redesenha o card — series/treinos/exercicios ja
// estao todos em memoria, sem consulta nova ao banco por clique.
function cardSemana(series, treinosPorId, exerciciosPorId, unidade, primeiraSemana) {
  let offset = 0; // semanas para tras; 0 = semana atual
  const el = node('<div class="card"></div>');

  function desenhar() {
    const ref = new Date();
    ref.setDate(ref.getDate() - offset * 7);
    const { inicio, fim, treinos, series: totalSeries, volume, porGrupo } =
      weekMuscleGroupSummary(series, treinosPorId, exerciciosPorId, ref);

    const podeVoltar = primeiraSemana != null && inicio > primeiraSemana;
    const podeAvancar = offset > 0;
    const maxSeries = porGrupo.reduce((m, g) => Math.max(m, g.series), 0);

    const linhasGrupo = porGrupo.map((g) => html`
      <div class="mgrupo__linha">
        <span class="mgrupo__icone" aria-hidden="true">${raw(ICON_GRUPO[g.grupo] || '')}</span>
        <span class="mgrupo__nome">${grupoLabel(g.grupo)}</span>
        <span class="mgrupo__track"><span class="mgrupo__fill" style="width:${maxSeries ? (g.series / maxSeries) * 100 : 0}%"></span></span>
        <span class="mgrupo__series">${g.series}</span>
      </div>
    `).join('');

    el.innerHTML = html`
      <div class="card__pad row row--between" style="${porGrupo.length ? 'padding-bottom:10px' : ''}">
        <button class="icon-btn semana-nav__voltar" data-voltar aria-label="${t('home.semana.anterior')}" ${podeVoltar ? '' : 'disabled'}>${raw(ICON.chevron)}</button>
        <div style="text-align:center">
          <h2 style="font-size:1rem">${tituloSemana(offset)}</h2>
          <p class="muted small" style="margin:2px 0 0">${fmtDateRange(inicio, fim)}</p>
        </div>
        <button class="icon-btn" data-avancar aria-label="${t('home.semana.proxima')}" ${podeAvancar ? '' : 'disabled'}>${raw(ICON.chevron)}</button>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat__val">${treinos}</div>
          <div class="stat__label">${t('home.stat.treinos')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${totalSeries}</div>
          <div class="stat__label">${t('home.stat.series')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(volume, 0)}</div>
          <div class="stat__label">${t('home.stat.volume', { unidade })}</div>
        </div>
      </div>
      ${porGrupo.length ? raw(`<div class="mgrupo card__pad">${linhasGrupo}</div>`) : ''}
    `;

    el.querySelector('[data-voltar]').onclick = () => { offset += 1; desenhar(); };
    el.querySelector('[data-avancar]').onclick = () => { offset -= 1; desenhar(); };
  }

  desenhar();
  return el;
}

/* ---------- Tendencia semanal ---------- */

// Funcao, nao const de modulo: precisa reavaliar t() a cada render, ja que o
// idioma pode mudar em runtime (ver idioma:mudou em app.js).
function metricasTendencia() {
  return {
    series: { curto: t('home.tendencia.metricaSeries'), rotulo: t('home.tendencia.rotuloSeries') },
    volume: { curto: t('home.tendencia.metricaVolume'), rotulo: t('home.tendencia.rotuloVolume') },
  };
}

function cardTendencia(series, treinosPorId, unidade) {
  const tendencia = weeklyTrend(series, treinosPorId, 8);
  const metricas = metricasTendencia();

  const card = node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:6px">
        <h2 style="font-size:1rem">${t('home.tendencia.titulo')}</h2>
        <p class="muted small" data-variacao style="margin:2px 0 10px"></p>
        <div class="segmented" data-metricas>
          ${raw(Object.entries(metricas)
            .map(([chave, m], i) => `<button class="segmented__btn" data-m="${chave}" aria-pressed="${i === 0}">${m.curto}</button>`)
            .join(''))}
        </div>
      </div>
      <div data-grafico style="padding:6px 8px 12px"></div>
    </div>
  `);

  const areaGrafico = card.querySelector('[data-grafico]');
  const textoVariacao = card.querySelector('[data-variacao]');

  const desenhar = (chave) => {
    const m = metricas[chave];
    areaGrafico.innerHTML = '';

    if (!tendencia.some((p) => p.series > 0)) {
      areaGrafico.append(node(html`
        <div class="empty small">
          ${raw(ICON.dumbbell)}
          <p>${t('home.tendencia.vazio')}</p>
        </div>
      `));
      textoVariacao.textContent = '';
      return;
    }

    const pontos = tendencia.map((p) => ({
      quando: p.inicio.toISOString(),
      valor: p[chave],
      rotulo: t('home.tendencia.rotuloPonto', { treinos: p.treinos, series: fmtNum(p.series, 0), volume: fmtNum(p.volume, 0), unidade }),
    }));

    areaGrafico.append(lineChart({
      pontos,
      sufixo: chave === 'series' ? '' : ` ${unidade}`,
      decimais: 0,
    }));

    const variacao = progressPct(tendencia, chave);
    textoVariacao.textContent = variacao == null ? '' :
      t('home.tendencia.variacao', {
        sinal: variacao >= 0 ? '+' : '',
        valor: fmtNum(variacao, 1),
        rotulo: m.rotulo,
        data: fmtDateShort(tendencia[0].inicio),
      });
  };

  wireSegmented(card, (botao) => desenhar(botao.dataset.m));
  desenhar('series');
  return card;
}

/* ---------- Ultimos treinos ---------- */

function listaRecentes(treinos, seriesPorTreino, unidade) {
  const itens = treinos.map((w) => {
    const r = workoutSummary(seriesPorTreino.get(w.id) || []);
    return html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${w.id}">
          <div class="grow">
            <div style="font-weight:650">${fmtRelativeDay(w.iniciadoEm)}</div>
            <div class="muted small">
              ${tn('common.exercicio', r.exercicios)} ·
              ${tn('common.serie', r.series)} ·
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
