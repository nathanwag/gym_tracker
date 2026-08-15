/* Sessao de treino — a tela principal do app.
 *
 * Prioridade de design: registrar uma serie de pe, entre uma e outra, com o
 * minimo de toques. Por isso o compositor ja vem preenchido com a serie
 * anterior, os ajustes sao por botoes de +/- e a referencia do ultimo treino
 * fica visivel no cabecalho de cada exercicio — e o que responde na hora
 * "estou evoluindo ou nao?".
 */

import * as db from '../db.js';
import { evaluatePR, prSetIds, setE1rm, workoutSummary } from '../models.js';
import { GRUPOS } from '../seed.js';
import * as catalogo from '../catalog.js';
import { thumbHtml, prefetchFotos } from '../media.js';
import {
  setTop, html, raw, node, ICON, createStepper, toast, openSheet, closeSheet,
  confirmSheet, fmtNum, fmtRelativeDay, fmtDuration, buzz, semAcento,
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
    treinos: new Map(treinos.map((t) => [t.id, t])),
    // Fonte unica de verdade: todas as series do banco. As da sessao e o
    // historico de cada exercicio sao derivados daqui por filtro.
    todasSeries,
    editando: new Map(),
    colapsados: new Set(),
  };

  const top = setTop({
    title: 'Treino em andamento',
    back: '#/',
    actions: `
      <button class="icon-btn" data-descartar aria-label="Descartar treino">${ICON.trash}</button>
      <button class="btn btn--sm btn--primary" data-finalizar>Finalizar</button>
    `,
  });
  top.querySelector('[data-finalizar]').onclick = finalizar;
  top.querySelector('[data-descartar]').onclick = async () => {
    const ok = await confirmSheet({
      title: 'Descartar este treino?',
      message: 'As séries registradas nele serão apagadas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    toast('Treino descartado.');
    location.hash = '#/';
  };

  const root = node('<div class="stack"></div>');
  root.append(resumoEl());

  const lista = node('<div class="stack" data-lista></div>');
  for (const id of workout.exerciseIds || []) lista.append(cardExercicio(id));
  root.append(lista);

  const add = node(html`
    <button class="btn btn--block" data-add-ex style="margin-top:12px">
      ${raw(ICON.plus)} Adicionar exercício
    </button>
  `);
  add.onclick = abrirSeletor;
  root.append(add);

  view.append(root);
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
  const el = node(html`
    <div class="card" data-resumo>
      <div class="stats">
        <div class="stat">
          <div class="stat__val" data-duracao>${fmtDuration(ctx.workout.iniciadoEm, new Date().toISOString()) || '0min'}</div>
          <div class="stat__label">duração</div>
        </div>
        <div class="stat">
          <div class="stat__val">${resumo.series}</div>
          <div class="stat__label">séries</div>
        </div>
        <div class="stat">
          <div class="stat__val">${fmtNum(resumo.volume, 0)}</div>
          <div class="stat__label">volume (${ctx.unidade})</div>
        </div>
      </div>
    </div>
  `);

  // O cronometro se cancela sozinho quando a tela sai do DOM.
  const timer = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(timer); return; }
    el.querySelector('[data-duracao]').textContent =
      fmtDuration(ctx.workout.iniciadoEm, new Date().toISOString()) || '0min';
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
  const colapsado = ctx.colapsados.has(exId);

  const card = node(html`<section class="card" data-ex="${exId}"></section>`);

  const cabecalho = node(html`
    <div class="exercise__head">
      ${raw(thumbHtml(ex))}
      <div class="grow">
        <h2 class="exercise__name">${ex.nome}</h2>
        <div class="exercise__meta">${raw(colapsado ? textoResumoSessao(aqui) : textoAnterior(anterior))}</div>
      </div>
      <button class="icon-btn" data-colapsar aria-pressed="${colapsado}" aria-label="${colapsado ? `Reabrir ${ex.nome}` : `Concluir ${ex.nome}`}">${raw(ICON.check)}</button>
      <button class="icon-btn" data-detalhe aria-label="Ver evolução de ${ex.nome}">${raw(ICON.chevron)}</button>
      <button class="icon-btn" data-remover aria-label="Remover ${ex.nome} do treino">${raw(ICON.trash)}</button>
    </div>
  `);
  cabecalho.querySelector('[data-colapsar]').onclick = () => {
    if (colapsado) ctx.colapsados.delete(exId);
    else ctx.colapsados.add(exId);
    rebuildCard(exId);
  };
  cabecalho.querySelector('[data-detalhe]').onclick = () => { location.hash = `#/exercicios/${exId}`; };
  cabecalho.querySelector('[data-remover]').onclick = () => removerExercicio(exId, ex.nome);
  card.append(cabecalho);

  if (!colapsado) {
    if (aqui.length) {
      const ul = node('<ul class="setlist"></ul>');
      aqui.forEach((s, i) => ul.append(itemSerie(s, i + 1, prIds.has(s.id), s.id === editandoId)));
      card.append(ul);
    }
    card.append(compositor(exId, emEdicao, aqui, anterior));
  }
  return card;
}

function textoAnterior(anterior) {
  if (!anterior) return html`<span class="muted">Primeira vez neste exercício</span>`;
  const resumo = anterior.series
    .map((s) => `${fmtNum(s.peso, 2)}×${s.reps}${s.aquecimento ? '*' : ''}`)
    .join('   ');
  return html`Última vez (${fmtRelativeDay(anterior.quando)}): <b class="tnum">${resumo}</b>`;
}

/** Resumo do que ja foi feito aqui, usado no cabecalho quando o exercicio
 *  esta colapsado — nesse ponto o que importa e o que a pessoa acabou de
 *  registrar, nao mais a comparacao com o treino anterior. */
function textoResumoSessao(aqui) {
  if (!aqui.length) return html`<span class="muted">Nenhuma série registrada</span>`;
  const n = aqui.length;
  const resumo = aqui.map((s) => `${fmtNum(s.peso, 2)}×${s.reps}${s.aquecimento ? '*' : ''}`).join('   ');
  return html`${n} ${n === 1 ? 'série' : 'séries'}: <b class="tnum">${resumo}</b>`;
}

function itemSerie(serie, numero, isPR, ativo) {
  const li = node(html`
    <li>
      <button class="setlist__item" data-set="${serie.id}" aria-current="${ativo}">
        <span class="setlist__num">${numero}</span>
        <span class="setlist__val">${fmtNum(serie.peso, 2)} ${ctx.unidade} × ${serie.reps}</span>
        ${serie.aquecimento ? raw('<span class="setlist__warm">aquec.</span>') : ''}
        ${isPR ? raw('<span class="badge badge--pr">🏆 PR</span>') : ''}
        <span class="grow"></span>
        ${serie.aquecimento ? '' : raw(`<span class="muted small tnum">1RM ${fmtNum(setE1rm(serie), 0)}</span>`)}
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
  // Pre-preenchimento, em ordem de preferencia: a serie sendo editada, a
  // ultima serie deste treino, a primeira serie do treino anterior.
  const base = emEdicao
    || aqui[aqui.length - 1]
    || anterior?.series?.[0]
    || { peso: 20, reps: 10, aquecimento: false };

  const peso = createStepper({
    label: 'Peso', suffix: ctx.unidade, value: base.peso,
    step: ctx.incPeso, min: 0, max: 1000, decimals: 1,
  });
  const reps = createStepper({
    label: 'Repetições', value: base.reps,
    step: ctx.incReps, min: 0, max: 300, decimals: 0,
  });

  const wrap = node('<div class="composer"></div>');
  wrap.append(peso.el, reps.el);

  let aquecimento = Boolean(base.aquecimento);
  const acoes = node('<div class="composer__actions"></div>');

  if (emEdicao) {
    const excluir = node(html`<button class="btn btn--sm btn--chip btn--danger" data-excluir aria-label="Excluir série">${raw(ICON.trash)}</button>`);
    const cancelar = node(html`<button class="btn btn--ghost" data-cancelar>Cancelar</button>`);
    const salvar = node(html`<button class="btn btn--primary" data-salvar>Salvar</button>`);

    cancelar.onclick = () => {
      ctx.editando.delete(exId);
      rebuildCard(exId);
    };
    salvar.onclick = () => salvarEdicao(exId, emEdicao, peso.get(), reps.get());
    excluir.onclick = () => excluirSerie(exId, emEdicao);

    acoes.append(excluir, cancelar, salvar);
  } else {
    const chip = node(html`
      <button class="btn btn--sm btn--chip btn--ghost" data-aquecimento aria-pressed="${aquecimento}">Aquec.</button>
    `);
    const addBtn = node(html`<button class="btn btn--primary" data-adicionar>Adicionar série</button>`);

    chip.onclick = () => {
      aquecimento = !aquecimento;
      chip.setAttribute('aria-pressed', String(aquecimento));
      chip.classList.toggle('btn--ghost', !aquecimento);
    };
    addBtn.onclick = () => adicionarSerie(exId, peso.get(), reps.get(), aquecimento);

    acoes.append(chip, addBtn);
  }

  wrap.append(acoes);
  return wrap;
}

/* ---------- Mutacoes ---------- */

async function adicionarSerie(exId, pesoValor, repsValor, aquecimento) {
  if (repsValor <= 0) { toast('Informe quantas repetições você fez.'); return; }

  const serie = await db.addSet({
    workoutId: ctx.workout.id,
    exerciseId: exId,
    peso: pesoValor,
    reps: repsValor,
    aquecimento,
  });
  ctx.todasSeries.push(serie);

  const pr = evaluatePR(serie, seriesDoExercicio(exId));
  rebuildCard(exId);
  atualizarResumo();
  buzz(18);

  if (pr.peso) toast('🏆 Recorde de carga neste exercício!');
  else if (pr.e1rm) toast('🏆 Recorde de força estimada!');
}

async function salvarEdicao(exId, serie, pesoValor, repsValor) {
  if (repsValor <= 0) { toast('Informe quantas repetições você fez.'); return; }
  await db.updateSet(serie.id, { peso: pesoValor, reps: repsValor });
  serie.peso = pesoValor;
  serie.reps = repsValor;
  ctx.editando.delete(exId);
  rebuildCard(exId);
  atualizarResumo();
  toast('Série atualizada.');
}

async function excluirSerie(exId, serie) {
  await db.deleteSet(serie.id);
  const i = ctx.todasSeries.findIndex((s) => s.id === serie.id);
  if (i >= 0) ctx.todasSeries.splice(i, 1);
  ctx.editando.delete(exId);
  rebuildCard(exId);
  atualizarResumo();
  toast('Série excluída.');
}

async function removerExercicio(exId, nome) {
  const temSeries = seriesAqui(exId).length;
  const ok = await confirmSheet({
    title: `Tirar ${nome} do treino?`,
    message: temSeries ? `As ${temSeries} série(s) registradas hoje neste exercício serão apagadas.` : '',
    confirmLabel: 'Remover',
    danger: true,
  });
  if (!ok) return;

  await db.removeExerciseFromWorkout(ctx.workout.id, exId);
  ctx.workout.exerciseIds = (ctx.workout.exerciseIds || []).filter((id) => id !== exId);
  ctx.todasSeries = ctx.todasSeries.filter((s) => !(s.workoutId === ctx.workout.id && s.exerciseId === exId));
  document.querySelector(`[data-ex="${exId}"]`)?.remove();
  atualizarResumo();
}

async function finalizar() {
  const series = seriesDoTreino();

  if (!series.length) {
    const ok = await confirmSheet({
      title: 'Nenhuma série registrada',
      message: 'Sem séries não há o que salvar — o treino será descartado.',
      confirmLabel: 'Descartar treino',
      danger: true,
    });
    if (!ok) return;
    await db.deleteWorkout(ctx.workout.id);
    location.hash = '#/';
    return;
  }

  const resumo = workoutSummary(series);
  const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;
  const ok = await confirmSheet({
    title: 'Finalizar treino?',
    message: `${plural(resumo.series, 'série', 'séries')} em `
      + `${plural(resumo.exercicios, 'exercício', 'exercícios')} · `
      + `${fmtNum(resumo.volume, 0)} ${ctx.unidade} de volume.`,
    confirmLabel: 'Finalizar',
  });
  if (!ok) return;

  await db.finishWorkout(ctx.workout.id);
  toast('Treino finalizado!');
  location.hash = `#/historico/${ctx.workout.id}`;
}

/* ---------- Seletor de exercicios ---------- */

function abrirSeletor() {
  const jaNoTreino = new Set(ctx.workout.exerciseIds || []);

  // Mais usados recentemente primeiro: na pratica sao sempre os mesmos 10-15
  // exercicios, e rolar a lista inteira toda vez seria trabalhoso.
  const usoRecente = new Map();
  for (const s of ctx.todasSeries) usoRecente.set(s.exerciseId, Math.max(usoRecente.get(s.exerciseId) || 0, s.id));
  const recentes = [...usoRecente.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ctx.exercicios.get(id))
    .filter((e) => e && !jaNoTreino.has(e.id))
    .slice(0, 6);

  const corpo = node(html`
    <div>
      <input class="input" data-busca type="search" placeholder="Buscar exercício"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-resultados style="margin-top:12px"></div>
    </div>
  `);
  openSheet('Adicionar exercício', corpo);

  const busca = corpo.querySelector('[data-busca]');
  const resultados = corpo.querySelector('[data-resultados]');

  const desenhar = () => {
    const q = semAcento(busca.value.trim());
    resultados.innerHTML = '';

    if (!q && recentes.length) {
      resultados.append(node('<h3 class="section-title" style="margin-top:0">Recentes</h3>'));
      resultados.append(listaSelecao(recentes, jaNoTreino));
      resultados.append(node('<h3 class="section-title">Todos os exercícios</h3>'));
    }

    const filtrados = q
      ? ctx.lista.filter((e) => semAcento(e.nome).includes(q) || semAcento(e.grupoMuscular).includes(q))
      : ctx.lista;

    if (!filtrados.length) {
      resultados.append(node(html`<p class="muted small">Nenhum exercício encontrado.</p>`));
    } else {
      resultados.append(listaSelecao(filtrados, jaNoTreino));
    }

    const nomeNovo = busca.value.trim();
    if (nomeNovo && !ctx.lista.some((e) => semAcento(e.nome) === q)) {
      // Do catalogo: e aqui que o app deixa de ter uma lista fixa. Quem esta em
      // pe no meio do treino precisa de um exercicio que nao tem — antes a
      // unica saida era digitar tudo a mao.
      const doCatalogo = node('<div data-catalogo></div>');
      resultados.append(doCatalogo);
      mostrarCatalogo(doCatalogo, nomeNovo);

      const btn = node(html`
        <button class="btn btn--block" style="margin-top:12px" data-criar>
          ${raw(ICON.plus)} Criar &laquo;${nomeNovo}&raquo;
        </button>
      `);
      btn.onclick = () => formularioNovoExercicio(nomeNovo);
      resultados.append(btn);
    }
  };

  busca.addEventListener('input', desenhar);
  desenhar();
}

/** Sugestoes do catalogo dentro do seletor.
 *
 *  O catalogo so e carregado quando o usuario ja digitou algo, para o sheet
 *  abrir instantaneo. O arquivo esta em cache do service worker, entao mesmo
 *  offline isto e leitura local. */
async function mostrarCatalogo(alvo, termo) {
  let itens;
  try {
    ({ itens } = await catalogo.buscar(termo, { limite: 6 }));
  } catch {
    return; // sem catalogo o seletor segue funcionando como antes
  }

  // Ja na biblioteca? Entao ja apareceu na lista de cima.
  const meus = new Set(ctx.lista.map((e) => e.slug).filter(Boolean));
  const novos = itens.filter((i) => !meus.has(i.slug));
  if (!novos.length || !alvo.isConnected) return;

  alvo.append(node('<h3 class="section-title">Do catálogo</h3>'));

  const card = node(html`<div class="card"><ul class="list">${raw(novos.map((item) => html`
    <li class="list__item">
      <button class="list__link" data-slug="${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div style="font-weight:600">${item.nome}</div>
          <div class="muted small">${item.grupo} · ${item.equipamento}</div>
        </div>
        ${raw(ICON.plus)}
      </button>
    </li>
  `).join(''))}</ul></div>`);

  for (const botao of card.querySelectorAll('[data-slug]')) {
    botao.onclick = async () => {
      const item = novos.find((i) => i.slug === botao.dataset.slug);
      // Um toque faz tudo: entra na biblioteca, entra no treino e ja busca as
      // fotos com a rede que houver agora.
      const criado = await db.addExercise({
        nome: item.nome,
        grupoMuscular: item.grupo,
        slug: item.slug,
        personalizado: false,
      });
      prefetchFotos(item.slug);
      ctx.lista = await db.listExercises();
      ctx.exercicios = new Map(ctx.lista.map((e) => [e.id, e]));
      await adicionarExercicio(criado.id);
    };
  }
  alvo.append(card);
}

function listaSelecao(exercicios, jaNoTreino) {
  const card = node('<div class="card"><ul class="list"></ul></div>');
  const ul = card.querySelector('ul');

  for (const ex of exercicios) {
    const dentro = jaNoTreino.has(ex.id);
    const li = node(html`
      <li class="list__item">
        <button class="list__link" data-id="${ex.id}" ${raw(dentro ? 'disabled' : '')}>
          ${raw(thumbHtml(ex))}
          <div class="grow">
            <div style="font-weight:600">${ex.nome}</div>
            <div class="muted small">${ex.grupoMuscular}</div>
          </div>
          ${dentro ? raw('<span class="badge">no treino</span>') : raw(ICON.plus)}
        </button>
      </li>
    `);
    if (!dentro) li.querySelector('button').onclick = () => adicionarExercicio(ex.id);
    else li.querySelector('button').style.opacity = '.5';
    ul.append(li);
  }
  return card;
}

async function adicionarExercicio(exId) {
  await db.addExerciseToWorkout(ctx.workout.id, exId);
  ctx.workout.exerciseIds = [...(ctx.workout.exerciseIds || []), exId];
  closeSheet();

  const card = cardExercicio(exId);
  document.querySelector('[data-lista]').append(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function formularioNovoExercicio(nomeSugerido) {
  const corpo = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">Nome</span>
        <input class="input" data-nome value="${nomeSugerido}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">Grupo muscular</span>
        <select class="select" data-grupo>
          ${raw(GRUPOS.map((g) => `<option value="${g}">${g}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-salvar>Criar e adicionar ao treino</button>
    </div>
  `);
  openSheet('Novo exercício', corpo);

  corpo.querySelector('[data-salvar]').onclick = async () => {
    const nome = corpo.querySelector('[data-nome]').value.trim();
    if (!nome) { toast('Dê um nome ao exercício.'); return; }

    const novo = await db.addExercise({ nome, grupoMuscular: corpo.querySelector('[data-grupo]').value });
    ctx.lista = await db.listExercises();
    ctx.exercicios = new Map(ctx.lista.map((e) => [e.id, e]));
    await adicionarExercicio(novo.id);
    toast('Exercício criado.');
  };
}
