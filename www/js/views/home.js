/* Tela inicial: comecar ou retomar um treino, resumo da semana e ultimos treinos. */

import * as db from '../db.js';
import { workoutSummary } from '../models.js';
import {
  setTop, html, raw, node, ICON, toast, confirmSheet, refresh,
  fmtNum, fmtRelativeDay, fmtWeekday, fmtDuration, isIOS, isStandalone,
} from '../ui.js';

export async function render(view) {
  setTop({ title: 'Treino' });

  const [ativo, treinos, series] = await Promise.all([
    db.getActiveWorkout(),
    db.listWorkouts(),
    db.listAllSets(),
  ]);

  const unidade = db.settings().unidade;
  const seriesPorTreino = new Map();
  for (const s of series) {
    if (!seriesPorTreino.has(s.workoutId)) seriesPorTreino.set(s.workoutId, []);
    seriesPorTreino.get(s.workoutId).push(s);
  }

  const container = node('<div class="stack"></div>');

  const aviso = cardInstalacao();
  if (aviso) container.append(aviso);

  container.append(ativo
    ? cardTreinoAtivo(ativo, seriesPorTreino.get(ativo.id) || [])
    : cardIniciar(treinos.length === 0));

  container.append(cardSemana(treinos, seriesPorTreino, unidade));

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

function cardIniciar(primeiraVez) {
  const el = node(html`
    <div class="card card__pad" style="text-align:center">
      ${raw(primeiraVez
        ? '<p class="muted small">Cada série que você registrar vira um ponto no gráfico de evolução.</p>'
        : '')}
      <button class="btn btn--primary btn--lg btn--block" data-iniciar>
        ${raw(ICON.plus)} Iniciar treino
      </button>
    </div>
  `);

  el.querySelector('[data-iniciar]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    await db.startWorkout();
    location.hash = '#/sessao';
  };
  return el;
}

function cardTreinoAtivo(treino, series) {
  const resumo = workoutSummary(series);
  const el = node(html`
    <div class="card">
      <div class="card__pad">
        <span class="badge badge--accent">Em andamento</span>
        <h2 style="margin-top:8px">Treino de ${fmtWeekday(treino.iniciadoEm)}</h2>
        <p class="muted small" style="margin-bottom:12px">
          Começou há ${fmtDuration(treino.iniciadoEm, new Date().toISOString()) || 'pouco'} ·
          ${resumo.series} ${resumo.series === 1 ? 'série' : 'séries'} em
          ${resumo.exercicios} ${resumo.exercicios === 1 ? 'exercício' : 'exercícios'}
        </p>
        <button class="btn btn--primary btn--lg btn--block" data-retomar>Retomar treino</button>
        <button class="btn btn--block btn--ghost btn--sm" style="margin-top:8px" data-descartar>
          Descartar treino
        </button>
      </div>
    </div>
  `);

  el.querySelector('[data-retomar]').onclick = () => { location.hash = '#/sessao'; };
  el.querySelector('[data-descartar]').onclick = async () => {
    const ok = await confirmSheet({
      title: 'Descartar este treino?',
      message: 'As séries registradas nele serão apagadas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(treino.id);
    toast('Treino descartado.');
    refresh();
  };
  return el;
}

/* ---------- Resumo dos ultimos 7 dias ---------- */

function cardSemana(treinos, seriesPorTreino, unidade) {
  const limite = Date.now() - 7 * 86400000;
  const daSemana = treinos.filter((t) => new Date(t.iniciadoEm).getTime() >= limite);

  let series = 0;
  let volume = 0;
  for (const t of daSemana) {
    const resumo = workoutSummary(seriesPorTreino.get(t.id) || []);
    series += resumo.series;
    volume += resumo.volume;
  }

  return node(html`
    <div class="card">
      <div class="stats">
        <div class="stat">
          <div class="stat__val">${daSemana.length}</div>
          <div class="stat__label">treinos · 7 dias</div>
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
