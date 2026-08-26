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
  evaluatePR, prSetIds, setE1rm, isTempoSet, workoutSummary,
} from '../models.js';
import { thumbHtml } from '../media.js';
import { openExercisePicker } from './exercise-picker.js';
import { usaTempo } from '../seed.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, createStepper, createDuracaoStepper, toast,
  confirmSheet, fmtNum, fmtRelativeDay, fmtDuration, fmtTempoSerie, buzz,
} from '../ui.js';

/** Estado da tela. Recriado a cada render; as telas nao compartilham estado. */
let ctx = null;

export async function render(view) {
  const workout = await db.getActiveWorkout();
  if (!workout) { location.hash = '#/'; return; }

  const [exercicios, todasSeries, treinos] = await Promise.all([
    db.listExercises(),
    db.listAllSets(),
    db.listWorkouts(),
  ]);

  const cfg = db.settings();
  ctx = {
    workout,
    unidade: cfg.unidade,
    incPeso: Number(cfg.incrementoPeso) || 2.5,
    incReps: Number(cfg.incrementoReps) || 1,
    exercicios: new Map(exercicios.map((e) => [e.id, e])),
    lista: exercicios,
    treinos: new Map(treinos.map((w) => [w.id, w])),
    // Fonte unica de verdade: todas as series do banco. As da sessao e o
    // historico de cada exercicio sao derivados daqui por filtro.
    todasSeries,
    editando: new Map(),
    // Persistido no treino (concluidoIds) pra sobreviver a sair e voltar pra
    // sessao — sem isso todo exercicio reabria ao trocar de tela.
    colapsados: new Set(workout.concluidoIds || []),
  };

  const top = setTop({
    title: t('session.titulo'),
    back: '#/',
    actions: `
      <button class="icon-btn" data-descartar aria-label="${t('session.descartarTreino')}">${ICON.trash}</button>
      <button class="btn btn--sm btn--primary" data-finalizar>${t('session.finalizar')}</button>
    `,
  });
  top.querySelector('[data-finalizar]').onclick = finalizar;
  top.querySelector('[data-descartar]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('session.confirmarDescartar.titulo'),
      message: t('session.confirmarDescartar.mensagem'),
      confirmLabel: t('session.confirmarDescartar.label'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    toast(t('session.toastDescartado'));
    location.hash = '#/';
  };

  const root = node('<div class="stack"></div>');
  root.append(resumoEl());
  root.append(node('<div class="stack" data-lista></div>'));

  const add = node(html`
    <button class="btn btn--block" data-add-ex style="margin-top:12px">
      ${raw(ICON.plus)} ${t('session.adicionarExercicio')}
    </button>
  `);
  add.onclick = abrirSeletor;
  root.append(add);

  root.append(node('<div data-concluidos-wrap></div>'));

  view.append(root);
  renderLista();
}

/** Redesenha as duas listas (ativos e concluidos) a partir do zero — chamada
 *  sempre que um exercicio muda de lado (colapsa/reabre) ou e adicionado/
 *  removido, porque isso move o item entre dois containers diferentes, e nao
 *  da pra fazer isso com um replaceWith pontual como o rebuildCard faz. */
/** Grava quais exercicios estao concluidos no proprio treino, em segundo
 *  plano — a lista na tela ja foi redesenhada, isto so garante que sair e
 *  voltar pra sessao (ou reabrir o app) preserva o estado. */
function persistColapsados() {
  ctx.workout.concluidoIds = [...ctx.colapsados];
  db.updateWorkout(ctx.workout.id, { concluidoIds: ctx.workout.concluidoIds });
}

/** Marca (ou desmarca) um exercicio como concluido: atualiza o set em
 *  memoria, redesenha as duas listas e persiste — os tres passos que toda
 *  mudanca de lado precisa, num lugar so. */
function definirColapso(exId, colapsado) {
  if (colapsado) ctx.colapsados.add(exId);
  else ctx.colapsados.delete(exId);
  renderLista();
  persistColapsados();
}

function renderLista() {
  const listaEl = document.querySelector('[data-lista]');
  const concluidosWrap = document.querySelector('[data-concluidos-wrap]');
  if (!listaEl || !concluidosWrap) return;

  const ids = ctx.workout.exerciseIds || [];
  const ativos = ids.filter((id) => !ctx.colapsados.has(id));
  const concluidos = ids.filter((id) => ctx.colapsados.has(id));

  listaEl.innerHTML = '';
  for (const id of ativos) listaEl.append(cardExercicio(id));

  concluidosWrap.innerHTML = '';
  if (concluidos.length) {
    concluidosWrap.append(node(`<h2 class="section-title">${t('session.concluidos')}</h2>`));
    const card = node('<div class="card"><ul class="list" data-concluidos></ul></div>');
    const ul = card.querySelector('ul');
    for (const id of concluidos) ul.append(itemConcluido(id));
    concluidosWrap.append(card);
  }
}

/* ---------- Consultas derivadas ---------- */

const seriesDoTreino = () => ctx.todasSeries.filter((s) => s.workoutId === ctx.workout.id);
const seriesDoExercicio = (exId) => ctx.todasSeries.filter((s) => s.exerciseId === exId);
const seriesAqui = (exId) => ctx.todasSeries.filter((s) => s.workoutId === ctx.workout.id && s.exerciseId === exId);

/** Series do exercicio no treino anterior mais recente (ignorando o atual). */
function sessaoAnterior(exId) {
  const outras = ctx.todasSeries.filter((s) => s.exerciseId === exId && s.workoutId !== ctx.workout.id);
  if (!outras.length) return null;
  // Ids de treino sao autoincremento: o maior e sempre o mais recente.
  const ultimoId = outras.reduce((max, s) => Math.max(max, s.workoutId), 0);
  const series = outras.filter((s) => s.workoutId === ultimoId);
  // A data vem do treino, nao da serie: editar uma serie depois nao deve
  // mudar a data em que aquele treino aconteceu.
  const quando = ctx.treinos.get(ultimoId)?.iniciadoEm || series[0].criadoEm;
  return { workoutId: ultimoId, series, quando };
}

/* ---------- Resumo do topo ---------- */

function resumoEl() {
  const resumo = workoutSummary(seriesDoTreino());
  const zeroMin = `0${t('common.min')}`;
  const el = node(html`
    <div class="card" data-resumo>
      <div class="stats">
        <div class="stat">
          <div class="stat__val" data-duracao>${fmtDuration(ctx.workout.iniciadoEm, new Date().toISOString()) || zeroMin}</div>
          <div class="stat__label">${t('session.resumo.duracao')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${resumo.series}</div>
          <div class="stat__label">${t('session.resumo.series')}</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(resumo.volume, 0)}</div>
          <div class="stat__label">${t('session.resumo.volume', { unidade: ctx.unidade })}</div>
        </div>
      </div>
    </div>
  `);

  // O cronometro se cancela sozinho quando a tela sai do DOM.
  const timer = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(timer); return; }
    el.querySelector('[data-duracao]').textContent =
      fmtDuration(ctx.workout.iniciadoEm, new Date().toISOString()) || zeroMin;
  }, 30000);

  return el;
}

function atualizarResumo() {
  const antigo = document.querySelector('[data-resumo]');
  if (antigo) antigo.replaceWith(resumoEl());
}

/* ---------- Cartao de exercicio ---------- */

function rebuildCard(exId) {
  const antigo = document.querySelector(`[data-ex="${exId}"]`);
  if (antigo) antigo.replaceWith(cardExercicio(exId));
}

function cardExercicio(exId) {
  const ex = ctx.exercicios.get(exId);
  if (!ex) return node('<div hidden></div>');

  const aqui = seriesAqui(exId);
  const prIds = prSetIds(seriesDoExercicio(exId));
  const anterior = sessaoAnterior(exId);
  const editandoId = ctx.editando.get(exId) ?? null;
  const emEdicao = aqui.find((s) => s.id === editandoId) || null;

  const card = node(html`<section class="card" data-ex="${exId}"></section>`);

  const cabecalho = node(html`
    <div class="exercise__head">
      ${raw(thumbHtml(ex))}
      <div class="grow">
        <h2 class="exercise__name">${ex.nome}</h2>
        <div class="exercise__meta">${raw(textoAnterior(anterior))}</div>
      </div>
      <button class="icon-btn" data-colapsar aria-label="${t('session.concluir', { nome: ex.nome })}">${raw(ICON.check)}</button>
      <button class="icon-btn" data-detalhe aria-label="${t('session.verEvolucaoDe', { nome: ex.nome })}">${raw(ICON.chevron)}</button>
      <button class="icon-btn" data-remover aria-label="${t('session.removerDoTreino', { nome: ex.nome })}">${raw(ICON.trash)}</button>
    </div>
  `);
  cabecalho.querySelector('[data-colapsar]').onclick = () => definirColapso(exId, true);
  cabecalho.querySelector('[data-detalhe]').onclick = () => { location.hash = `#/exercicios/${exId}`; };
  cabecalho.querySelector('[data-remover]').onclick = () => removerExercicio(exId, ex.nome);
  card.append(cabecalho);

  if (aqui.length) {
    const ul = node('<ul class="setlist"></ul>');
    aqui.forEach((s, i) => ul.append(itemSerie(s, i + 1, prIds.has(s.id), s.id === editandoId)));
    card.append(ul);
  }
  card.append(compositor(exId, emEdicao, aqui, anterior));
  return card;
}

/** Linha compacta pra um exercicio marcado como concluido — sem thumb e sem
 *  os tres botoes de acao grandes do cabecalho ativo, so nome + resumo do
 *  que foi feito. Reabrir (e so entao excluir/ver evolucao) e um toque. */
function itemConcluido(exId) {
  const ex = ctx.exercicios.get(exId);
  if (!ex) return node('<li hidden></li>');

  const aqui = seriesAqui(exId);
  const li = node(html`
    <li class="list__item">
      <button class="list__link" data-reabrir aria-label="${t('session.reabrir', { nome: ex.nome })}">
        <div class="grow">
          <div style="font-weight:600">${ex.nome}</div>
          <div class="muted small">${raw(textoResumoSessao(aqui))}</div>
        </div>
        <span class="list__done">${raw(ICON.check)}</span>
      </button>
    </li>
  `);
  li.querySelector('[data-reabrir]').onclick = () => definirColapso(exId, false);
  return li;
}

/** Texto de uma serie na comparacao/resumo: duracao pra Cardio/Alongamento,
 *  peso×reps pro resto — decidido pela propria serie, sem precisar olhar o
 *  exercicio (uma serie so grava um dos dois pares, nunca os dois). */
function textoSerie(s) {
  return `${isTempoSet(s) ? fmtTempoSerie(s.duracaoSeg) : `${fmtNum(s.peso, 2)}×${s.reps}`}${s.aquecimento ? '*' : ''}`;
}

function textoAnterior(anterior) {
  if (!anterior) return html`<span class="muted">${t('session.primeiraVez')}</span>`;
  const resumo = anterior.series.map(textoSerie).join('   ');
  return html`${t('session.ultimaVez', { data: fmtRelativeDay(anterior.quando) })} <b class="tnum">${resumo}</b>`;
}

/** Resumo do que ja foi feito aqui, usado no cabecalho quando o exercicio
 *  esta colapsado — nesse ponto o que importa e o que a pessoa acabou de
 *  registrar, nao mais a comparacao com o treino anterior. */
function textoResumoSessao(aqui) {
  if (!aqui.length) return html`<span class="muted">${t('session.nenhumaSerieRegistrada')}</span>`;
  const resumo = aqui.map(textoSerie).join('   ');
  return html`${tn('common.serie', aqui.length)}: <b class="tnum">${resumo}</b>`;
}

function itemSerie(serie, numero, isPR, ativo) {
  const tempo = isTempoSet(serie);
  const li = node(html`
    <li>
      <button class="setlist__item" data-set="${serie.id}" aria-current="${ativo}">
        <span class="setlist__num">${numero}</span>
        <span class="setlist__val">${tempo ? fmtTempoSerie(serie.duracaoSeg) : `${fmtNum(serie.peso, 2)} ${ctx.unidade} × ${serie.reps}`}</span>
        ${serie.aquecimento ? raw(`<span class="setlist__warm">${t('history.aquec')}</span>`) : ''}
        ${isPR ? raw('<span class="badge badge--pr">🏆 PR</span>') : ''}
        <span class="grow"></span>
        ${(!serie.aquecimento && !tempo) ? raw(`<span class="muted small tnum">1RM ${fmtNum(setE1rm(serie), 0)}</span>`) : ''}
      </button>
    </li>
  `);

  li.querySelector('button').onclick = () => {
    const atual = ctx.editando.get(serie.exerciseId);
    if (atual === serie.id) ctx.editando.delete(serie.exerciseId);
    else ctx.editando.set(serie.exerciseId, serie.id);
    rebuildCard(serie.exerciseId);
  };
  return li;
}

/* ---------- Compositor: onde a serie e digitada ---------- */

function compositor(exId, emEdicao, aqui, anterior) {
  const tempo = usaTempo(ctx.exercicios.get(exId)?.grupoMuscular);

  // Pre-preenchimento, em ordem de preferencia: a serie sendo editada, a
  // ultima serie deste treino, a primeira serie do treino anterior.
  const base = emEdicao
    || aqui[aqui.length - 1]
    || anterior?.series?.[0]
    || (tempo ? { duracaoSeg: 60, aquecimento: false } : { peso: 20, reps: 10, aquecimento: false });

  const wrap = node('<div class="composer"></div>');

  let peso = null;
  let reps = null;
  let duracao = null;

  if (tempo) {
    duracao = createDuracaoStepper({ value: base.duracaoSeg || 0 });
    wrap.append(duracao.el);
  } else {
    peso = createStepper({
      label: t('session.peso'), suffix: ctx.unidade, value: base.peso,
      step: ctx.incPeso, min: 0, max: 1000, decimals: 1,
    });
    reps = createStepper({
      label: t('session.repeticoes'), value: base.reps,
      step: ctx.incReps, min: 0, max: 300, decimals: 0,
    });
    wrap.append(peso.el, reps.el);
  }

  const valores = () => (tempo ? { duracaoSeg: duracao.get() } : { peso: peso.get(), reps: reps.get() });

  let aquecimento = Boolean(base.aquecimento);
  const acoes = node('<div class="composer__actions"></div>');

  if (emEdicao) {
    const excluir = node(html`<button class="btn btn--sm btn--chip btn--danger" data-excluir aria-label="${t('session.excluirSerie')}">${raw(ICON.trash)}</button>`);
    const cancelar = node(html`<button class="btn btn--ghost" data-cancelar>${t('common.cancelar')}</button>`);
    const salvar = node(html`<button class="btn btn--primary" data-salvar>${t('common.salvar')}</button>`);

    cancelar.onclick = () => {
      ctx.editando.delete(exId);
      rebuildCard(exId);
    };
    salvar.onclick = () => salvarEdicao(exId, emEdicao, valores());
    excluir.onclick = () => excluirSerie(exId, emEdicao);

    acoes.append(excluir, cancelar, salvar);
  } else {
    const chip = node(html`
      <button class="btn btn--sm btn--chip btn--ghost" data-aquecimento aria-pressed="${aquecimento}">${t('session.aquecAbrev')}</button>
    `);
    const addBtn = node(html`<button class="btn btn--primary" data-adicionar>${t('session.adicionarSerie')}</button>`);

    chip.onclick = () => {
      aquecimento = !aquecimento;
      chip.setAttribute('aria-pressed', String(aquecimento));
      chip.classList.toggle('btn--ghost', !aquecimento);
    };
    addBtn.onclick = () => adicionarSerie(exId, valores(), aquecimento);

    acoes.append(chip, addBtn);
  }

  wrap.append(acoes);
  return wrap;
}

/* ---------- Mutacoes ---------- */

async function adicionarSerie(exId, valores, aquecimento) {
  const tempo = 'duracaoSeg' in valores;
  if (tempo ? valores.duracaoSeg <= 0 : valores.reps <= 0) {
    toast(tempo ? t('session.informeDuracao') : t('session.informeRepeticoes'));
    return;
  }

  const serie = await db.addSet({
    workoutId: ctx.workout.id,
    exerciseId: exId,
    ...valores,
    aquecimento,
  });
  ctx.todasSeries.push(serie);

  const pr = evaluatePR(serie, seriesDoExercicio(exId));
  rebuildCard(exId);
  atualizarResumo();
  buzz(18);

  if (pr.duracao) toast(t('session.recordeTempo'));
  else if (pr.peso) toast(t('session.recordeCarga'));
  else if (pr.e1rm) toast(t('session.recordeForca'));
}

async function salvarEdicao(exId, serie, valores) {
  const tempo = 'duracaoSeg' in valores;
  if (tempo ? valores.duracaoSeg <= 0 : valores.reps <= 0) {
    toast(tempo ? t('session.informeDuracao') : t('session.informeRepeticoes'));
    return;
  }
  await db.updateSet(serie.id, valores);
  Object.assign(serie, valores);
  ctx.editando.delete(exId);
  rebuildCard(exId);
  atualizarResumo();
  toast(t('session.serieAtualizada'));
}

async function excluirSerie(exId, serie) {
  await db.deleteSet(serie.id);
  const i = ctx.todasSeries.findIndex((s) => s.id === serie.id);
  if (i >= 0) ctx.todasSeries.splice(i, 1);
  ctx.editando.delete(exId);
  rebuildCard(exId);
  atualizarResumo();
  toast(t('session.serieExcluida'));
}

async function removerExercicio(exId, nome) {
  const temSeries = seriesAqui(exId).length;
  const ok = await confirmSheet({
    title: t('session.confirmarRemover.titulo', { nome }),
    message: temSeries ? t('session.confirmarRemover.mensagemComSeries', { series: tn('common.serie', temSeries) }) : '',
    confirmLabel: t('session.confirmarRemover.label'),
    danger: true,
  });
  if (!ok) return;

  await db.removeExerciseFromWorkout(ctx.workout.id, exId);
  ctx.workout.exerciseIds = (ctx.workout.exerciseIds || []).filter((id) => id !== exId);
  ctx.todasSeries = ctx.todasSeries.filter((s) => !(s.workoutId === ctx.workout.id && s.exerciseId === exId));
  definirColapso(exId, false);
  atualizarResumo();
}

async function finalizar() {
  const series = seriesDoTreino();

  if (!series.length) {
    const ok = await confirmSheet({
      title: t('session.confirmarFinalizarSemSeries.titulo'),
      message: t('session.confirmarFinalizarSemSeries.mensagem'),
      confirmLabel: t('session.confirmarFinalizarSemSeries.label'),
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    location.hash = '#/';
    return;
  }

  const resumo = workoutSummary(series);
  const ok = await confirmSheet({
    title: t('session.confirmarFinalizar.titulo'),
    message: t('session.confirmarFinalizar.mensagem', {
      series: tn('common.serie', resumo.series),
      exercicios: tn('common.exercicio', resumo.exercicios),
      volume: fmtNum(resumo.volume, 0),
      unidade: ctx.unidade,
    }),
    confirmLabel: t('session.finalizar'),
  });
  if (!ok) return;

  await db.finishWorkout(ctx.workout.id);
  toast(t('session.toastFinalizado'));
  location.hash = `#/historico/${ctx.workout.id}`;
}

/* ---------- Seletor de exercicios ---------- */

function abrirSeletor() {
  openExercisePicker({
    exercicios: ctx.lista,
    jaEscolhidoIds: new Set(ctx.workout.exerciseIds || []),
    aoEscolher: adicionarExercicio,
  });
}

/** Chamado pelo seletor com o exercicio resolvido — existente, do catalogo, ou
 *  recem-criado. A lista local e recarregada sempre: e barato (db.js cacheia
 *  em memoria e so o invalida quando algo muda) e poupa o seletor de saber se
 *  criou algo novo. */
async function adicionarExercicio(exercicio) {
  ctx.lista = await db.listExercises();
  ctx.exercicios = new Map(ctx.lista.map((e) => [e.id, e]));

  await db.addExerciseToWorkout(ctx.workout.id, exercicio.id);
  ctx.workout.exerciseIds = [...(ctx.workout.exerciseIds || []), exercicio.id];

  renderLista();
  document.querySelector(`[data-ex="${exercicio.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
