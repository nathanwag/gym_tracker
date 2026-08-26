/* Biblioteca de exercicios e, para cada um, a tela de evolucao: recordes,
 * grafico e historico de todas as sessoes. */

import * as db from '../db.js';
import {
  bests, prSetIds, sessionSummaries, bestSessionVolume, bestSessionDuracao, progressPct,
} from '../models.js';
import { GRUPOS, agruparPorGrupo, grupoLabel, usaTempo } from '../seed.js';
import { lineChart } from '../charts.js';
import * as catalogo from '../catalog.js';
import { thumbHtml, criarAnimacao, prefetchFotos } from '../media.js';
import { t, tn, idioma } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, ICON_GRUPO, toast, openSheet, closeSheet, confirmSheet,
  fmtNum, fmtRelativeDay, fmtDate, fmtTempoSerie, fmtSerie, semAcento, refresh, wireSegmented,
} from '../ui.js';

/* ==========================================================================
   Lista
   ========================================================================== */

// Lembram o filtro (meus/todos) e o texto buscado da biblioteca entre
// visitas nesta sessao — mesmo motivo do catalogo (catalog.js): sem isso,
// voltar de um exercicio sempre reabria a lista filtrada do zero.
// `modoLembrado` nao pode nascer com valor fixo porque seu padrao depende de
// `temHistorico`, so conhecido em runtime — null = ainda nao decidido.
let modoLembrado = null;
let busca = '';

export async function renderList(view) {
  const [exercicios, series] = await Promise.all([db.listExercises(), db.listAllSets()]);
  const unidade = db.settings().unidade;

  // Resumo por exercicio numa unica passada pelas series.
  const resumos = new Map();
  for (const s of series) {
    let r = resumos.get(s.exerciseId);
    if (!r) { r = { total: 0, ultimoId: 0, ultimo: null, melhorPeso: 0 }; resumos.set(s.exerciseId, r); }
    r.total += 1;
    if (s.id > r.ultimoId) { r.ultimoId = s.id; r.ultimo = s.criadoEm; }
    if (!s.aquecimento && s.peso > r.melhorPeso) r.melhorPeso = s.peso;
  }

  const temHistorico = resumos.size > 0;
  if (modoLembrado === null) modoLembrado = temHistorico ? 'meus' : 'todos';

  setTop({ title: t('exercise.listaTitulo'), barra: false });

  const root = node(html`
    <div class="stack">
      <input class="input" data-busca type="search" placeholder="${t('exercise.buscarPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off" value="${busca}">
      <div class="segmented" ${raw(temHistorico ? '' : 'hidden')}>
        <button class="segmented__btn" data-modo="meus" aria-pressed="${String(modoLembrado === 'meus')}">${t('exercise.filtro.comRegistro')}</button>
        <button class="segmented__btn" data-modo="todos" aria-pressed="${String(modoLembrado === 'todos')}">${t('exercise.filtro.todos')}</button>
      </div>
      <a class="btn btn--block btn--ghost" href="#/catalogo">
        ${raw(ICON.plus)} ${t('exercise.buscarCatalogo')}
      </a>
      <button class="btn btn--block btn--ghost" data-novo>
        ${raw(ICON.plus)} ${t('exercise.criarExercicio')}
      </button>
      <div data-lista></div>
    </div>
  `);
  root.querySelector('[data-novo]').onclick = () => formularioExercicio();

  const lista = root.querySelector('[data-lista]');

  const desenhar = () => {
    const q = semAcento(busca.trim());
    let itens = exercicios;
    if (modoLembrado === 'meus') itens = itens.filter((e) => resumos.has(e.id));
    if (q) itens = itens.filter((e) => semAcento(e.nome).includes(q) || semAcento(e.grupoMuscular).includes(q));

    lista.innerHTML = '';
    if (!itens.length) {
      lista.append(node(html`
        <div class="card"><div class="empty">
          ${raw(ICON.dumbbell)}
          <p>${modoLembrado === 'meus' && !q ? t('exercise.semRegistroVazio') : t('exercise.nenhumEncontrado')}</p>
        </div></div>
      `));
      return;
    }

    // Agrupado por musculo, na ordem anatomica de GRUPOS (nao alfabetica).
    for (const { grupo, itens: doGrupo } of agruparPorGrupo(itens, (ex) => ex.grupoMuscular)) {
      lista.append(node(html`
        <h2 class="section-title section-title--icone">
          <span class="section-title__icone" aria-hidden="true">${raw(ICON_GRUPO[grupo] || '')}</span>
          ${grupoLabel(grupo)}
        </h2>
      `));
      const itensHtml = doGrupo.map((ex) => {
        const r = resumos.get(ex.id);
        const detalhe = r
          ? `${fmtRelativeDay(r.ultimo)} · ${t('exercise.melhorPeso', { peso: fmtNum(r.melhorPeso, 2), unidade })}`
          : t('exercise.semRegistro');
        return html`
          <li class="list__item">
            <a class="list__link" href="#/exercicios/${ex.id}">
              ${raw(thumbHtml(ex))}
              <div class="grow">
                <div style="font-weight:600">${ex.nome}</div>
                <div class="muted small">${detalhe}</div>
              </div>
              <span class="list__chev">${raw(ICON.chevron)}</span>
            </a>
          </li>
        `;
      });
      lista.append(node(html`<div class="card"><ul class="list">${raw(itensHtml.join(''))}</ul></div>`));
    }
  };

  root.querySelector('[data-busca]').addEventListener('input', (e) => {
    busca = e.target.value;
    desenhar();
  });

  wireSegmented(root, (botao) => {
    modoLembrado = botao.dataset.modo;
    desenhar();
  });

  desenhar();
  view.append(root);
}

/* ==========================================================================
   Detalhe / evolucao
   ========================================================================== */

// `curto` vai no botão (senão quebra em duas linhas na tela do celular) e
// `rotulo` na frase de variação, onde cabe o nome inteiro. Funcao, nao const
// de modulo: precisa reavaliar t() a cada render (idioma pode mudar em runtime).
function metricas(tempo) {
  if (tempo) {
    return {
      duracao: { curto: t('exercise.metrica.duracaoCurto'), rotulo: t('exercise.metrica.duracaoRotulo'), campo: 'melhorDuracao', decimais: 1 },
      tempoTotal: { curto: t('exercise.metrica.tempoTotalCurto'), rotulo: t('exercise.metrica.tempoTotalRotulo'), campo: 'duracaoTotal', decimais: 1 },
    };
  }
  return {
    e1rm: { curto: t('exercise.metrica.e1rmCurto'), rotulo: t('exercise.metrica.e1rmRotulo'), campo: 'melhor1rm', decimais: 0 },
    peso: { curto: t('exercise.metrica.pesoCurto'), rotulo: t('exercise.metrica.pesoRotulo'), campo: 'maxPeso', decimais: 1 },
    volume: { curto: t('exercise.metrica.volumeCurto'), rotulo: t('exercise.metrica.volumeRotulo'), campo: 'volume', decimais: 0 },
  };
}

export async function renderDetail(view, exId) {
  const [exercicio, series, treinos, ativo] = await Promise.all([
    db.getExercise(exId),
    db.listSetsByExercise(exId),
    db.listWorkouts(),
    db.getActiveWorkout(),
  ]);

  if (!exercicio) {
    view.append(node(`<div class="card card__pad">${t('exercise.naoEncontrado')}</div>`));
    return;
  }

  const unidade = db.settings().unidade;
  const tempo = usaTempo(exercicio.grupoMuscular);
  const treinosPorId = new Map(treinos.map((w) => [w.id, w]));
  const resumos = sessionSummaries(series, treinosPorId);
  const recordes = bests(series);
  const melhorVolume = bestSessionVolume(resumos);
  const melhorTempoTotal = bestSessionDuracao(resumos);
  const prIds = prSetIds(series);

  setTop({
    title: exercicio.nome,
    back: '#/exercicios',
    actions: `<button class="btn btn--sm btn--ghost" data-menu aria-label="${t('exercise.opcoes')}">···</button>`,
  });
  document.querySelector('[data-menu]').onclick = () => menuExercicio(exercicio, series.length);

  const root = node('<div class="stack"></div>');

  // As duas fotos alternando mostram o movimento. Fica antes dos numeros: quem
  // abre esta tela no meio da serie quer conferir a execucao primeiro.
  if (exercicio.slug) root.append(criarAnimacao(exercicio.slug, { nome: exercicio.nome }));

  root.append(node(tempo ? html`
    <div class="card">
      <div class="stats">
        <div class="stat stat--pr">
          <div class="stat__val">${recordes.duracao ? fmtTempoSerie(recordes.duracao) : '—'}</div>
          <div class="stat__label">${t('exercise.recordeTempo')}</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${melhorTempoTotal ? fmtTempoSerie(melhorTempoTotal) : '—'}</div>
          <div class="stat__label">${t('exercise.tempoTotalSessao')}</div>
        </div>
      </div>
    </div>
  ` : html`
    <div class="card">
      <div class="stats">
        <div class="stat stat--pr">
          <div class="stat__val">${recordes.peso ? fmtNum(recordes.peso, 2) : '—'}</div>
          <div class="stat__label">${t('exercise.recordeCarga', { unidade })}</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${recordes.e1rm ? fmtNum(recordes.e1rm, 0) : '—'}</div>
          <div class="stat__label">${t('exercise.metrica.e1rmRotulo')}</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${melhorVolume ? fmtNum(melhorVolume, 0) : '—'}</div>
          <div class="stat__label">${t('exercise.melhorVolume')}</div>
        </div>
      </div>
    </div>
  `));

  if (ativo && !(ativo.exerciseIds || []).includes(exercicio.id)) {
    const botao = node(html`
      <button class="btn btn--block" data-add-treino>${raw(ICON.plus)} ${t('exercise.adicionarAoTreino')}</button>
    `);
    botao.onclick = async () => {
      await db.addExerciseToWorkout(ativo.id, exercicio.id);
      toast(t('exercise.toastAdicionadoAoTreino'));
      location.hash = '#/sessao';
    };
    root.append(botao);
  }

  root.append(secaoGrafico(resumos, unidade, tempo));
  root.append(secaoHistorico(resumos, prIds, unidade, tempo));

  view.append(root);

  // Depois do append: o passo a passo vem de um arquivo separado e nao deve
  // atrasar o resto da tela, que e o motivo principal de estar aqui.
  if (exercicio.slug) {
    catalogo.instrucoes(exercicio.slug)
      .then((info) => {
        const passos = info?.[idioma()];
        if (!passos?.length || !root.isConnected) return;
        root.append(node(html`
          <div class="card card__pad">
            <h2 class="section-title" style="margin-top:0">${t('exercise.comoFazer')}</h2>
            <ol class="passos">${raw(passos.map((p) => html`<li>${p}</li>`).join(''))}</ol>
          </div>
        `));
      })
      .catch(() => { /* offline e sem o arquivo em cache: a tela segue util */ });
  }
}

function secaoGrafico(resumos, unidade, tempo) {
  const m = metricas(tempo);
  const card = node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:6px">
        <h2 style="font-size:1rem">${t('exercise.evolucao')}</h2>
        <p class="muted small" data-variacao style="margin:2px 0 10px"></p>
        <div class="segmented" data-metricas>
          ${raw(Object.entries(m)
            .map(([chave, mm], i) => `<button class="segmented__btn" data-m="${chave}" aria-pressed="${i === 0}">${mm.curto}</button>`)
            .join(''))}
        </div>
      </div>
      <div data-grafico style="padding:6px 8px 12px"></div>
    </div>
  `);

  const areaGrafico = card.querySelector('[data-grafico]');
  const textoVariacao = card.querySelector('[data-variacao]');

  const desenhar = (chave) => {
    const mm = m[chave];
    areaGrafico.innerHTML = '';

    if (resumos.length < 2) {
      areaGrafico.append(node(html`
        <div class="empty small">
          ${raw(ICON.dumbbell)}
          <p>${resumos.length === 0 ? t('exercise.grafico.vazioSemSeries') : t('exercise.grafico.vazioPoucosTreinos')}</p>
        </div>
      `));
      textoVariacao.textContent = '';
      return;
    }

    const pontos = resumos.map((r) => ({
      quando: r.quando,
      // Duracao e guardada em segundos; o grafico mostra em minutos (mais
      // legivel numa serie de sessoes) — nao afeta progressPct, que so olha razao.
      valor: tempo ? r[mm.campo] / 60 : r[mm.campo],
      rotulo: tempo
        ? `${tn('common.serie', r.series.length)} · ${t('exercise.melhorDuracaoRotulo', { duracao: fmtTempoSerie(r.melhorDuracao) })}`
        : `${tn('common.serie', r.series.length)} · ${t('exercise.melhorPeso', { peso: fmtNum(r.maxPeso, 2), unidade })}`,
    }));

    areaGrafico.append(lineChart({
      pontos,
      sufixo: tempo ? ` ${t('common.min')}` : (chave === 'e1rm' ? '' : ` ${unidade}`),
      decimais: mm.decimais,
    }));

    const variacao = progressPct(resumos, mm.campo);
    if (variacao == null) {
      textoVariacao.textContent = '';
    } else {
      textoVariacao.textContent = t('exercise.grafico.variacao', {
        sinal: variacao >= 0 ? '+' : '',
        valor: fmtNum(variacao, 1),
        rotulo: mm.rotulo,
        data: fmtDate(resumos[0].quando),
      });
    }
  };

  wireSegmented(card, (botao) => desenhar(botao.dataset.m));

  desenhar(Object.keys(m)[0]);
  return card;
}

function secaoHistorico(resumos, prIds, unidade, tempo) {
  const wrap = node('<div></div>');
  wrap.append(node(`<h2 class="section-title">${t('exercise.historico.titulo')}</h2>`));

  if (!resumos.length) {
    wrap.append(node(`<div class="card"><div class="empty small"><p>${t('exercise.historico.vazio')}</p></div></div>`));
    return wrap;
  }

  const itens = [...resumos].reverse().map((r) => {
    const series = r.series
      .map((s) => `<span class="tnum">${fmtSerie(s)}</span>${prIds.has(s.id) ? ' 🏆' : ''}`)
      .join('<span class="muted"> · </span>');
    const resumoLinha = tempo
      ? t('exercise.historico.tempoTotal', { tempo: fmtTempoSerie(r.duracaoTotal) })
      : t('exercise.historico.volumeRm', { volume: fmtNum(r.volume, 0), unidade, rm: fmtNum(r.melhor1rm, 0) });
    return html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${r.workoutId}">
          <div class="grow">
            <div style="font-weight:650">${fmtRelativeDay(r.quando)}</div>
            <div class="small" style="margin-top:2px">${raw(series)}</div>
            <div class="muted small">${resumoLinha}</div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </a>
      </li>
    `;
  });

  wrap.append(node(html`<div class="card"><ul class="list">${raw(itens.join(''))}</ul></div>`));
  return wrap;
}

/* ---------- Criar / editar / apagar ---------- */

function menuExercicio(exercicio, totalSeries) {
  const corpo = node(html`
    <div class="stack">
      <button class="btn btn--block" data-renomear>${t('exercise.menu.renomear')}</button>
      <button class="btn btn--block" data-figura>
        ${exercicio.slug ? t('exercise.menu.trocarFigura') : t('exercise.menu.escolherFigura')}
      </button>
      <button class="btn btn--block btn--danger" data-apagar>${t('exercise.menu.apagar')}</button>
      <p class="muted small" style="margin:0">
        ${totalSeries ? t('exercise.menu.temSeries', { series: tn('common.serie', totalSeries) }) : t('exercise.menu.semSeries')}
      </p>
    </div>
  `);
  openSheet(exercicio.nome, corpo);

  corpo.querySelector('[data-renomear]').onclick = () => formularioExercicio(exercicio);
  corpo.querySelector('[data-figura]').onclick = () => escolherFigura(exercicio);
  corpo.querySelector('[data-apagar]').onclick = async () => {
    closeSheet();
    const ok = await confirmSheet({
      title: t('exercise.menu.confirmarApagar.titulo', { nome: exercicio.nome }),
      confirmLabel: t('common.apagar'),
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteExercise(exercicio.id);
      toast(t('exercise.menu.toastApagado'));
      location.hash = '#/exercicios';
    } catch (err) {
      toast(err.message);
    }
  };
}

/** Liga um exercicio a uma figura do catalogo.
 *
 *  Saida para os dois casos que a migracao automatica nao cobre: exercicio
 *  renomeado (o nome deixou de casar) e exercicio criado a mao. */
function escolherFigura(exercicio) {
  const corpo = node(html`
    <div class="stack">
      <input class="input" data-busca type="search" value="${exercicio.nome}"
             placeholder="${t('exercise.figura.buscarPlaceholder')}" autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-resultados><p class="muted small">${t('exercise.figura.carregandoCatalogo')}</p></div>
      ${exercicio.slug ? raw(`<button class="btn btn--block btn--ghost" data-limpar>${t('exercise.figura.removerFigura')}</button>`) : ''}
    </div>
  `);
  openSheet(t('exercise.figura.tituloSheet'), corpo);

  const busca = corpo.querySelector('[data-busca]');
  const resultados = corpo.querySelector('[data-resultados]');

  const aplicar = async (slug) => {
    await db.definirFiguraExercicio(exercicio.id, slug);
    if (slug) prefetchFotos(slug);
    closeSheet();
    toast(slug ? t('exercise.figura.toastAtualizada') : t('exercise.figura.toastRemovida'));
    refresh();
  };

  corpo.querySelector('[data-limpar]')?.addEventListener('click', () => aplicar(null));

  const desenhar = async () => {
    const { itens } = await catalogo.buscar(busca.value, { limite: 12 });
    resultados.innerHTML = '';

    if (!itens.length) {
      resultados.append(node(`<p class="muted small">${t('exercise.figura.nenhumEncontrado')}</p>`));
      return;
    }

    const card = node(html`<div class="card"><ul class="list">${raw(itens.map((item) => html`
      <li class="list__item">
        <button class="list__link" data-slug="${item.slug}">
          ${raw(thumbHtml(item))}
          <div class="grow">
            <div style="font-weight:600">${catalogo.nomeExibicao(item)}</div>
            <div class="muted small">${item.nomeEn}</div>
          </div>
          ${item.slug === exercicio.slug ? raw(`<span class="badge">${t('exercise.figura.atual')}</span>`) : ''}
        </button>
      </li>
    `).join(''))}</ul></div>`);

    for (const botao of card.querySelectorAll('[data-slug]')) {
      botao.onclick = () => aplicar(botao.dataset.slug);
    }
    resultados.append(card);
  };

  busca.addEventListener('input', () => { desenhar().catch(() => {}); });
  desenhar().catch(() => {
    resultados.innerHTML = `<p class="muted small">${t('exercise.figura.erroCarregar')}</p>`;
  });
}

function formularioExercicio(exercicio = null) {
  const corpo = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('exercise.form.nome')}</span>
        <input class="input" data-nome value="${exercicio?.nome || ''}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('exercise.form.grupoMuscular')}</span>
        <select class="select" data-grupo>
          ${raw(GRUPOS.map((g) =>
            `<option value="${g}"${g === exercicio?.grupoMuscular ? ' selected' : ''}>${grupoLabel(g)}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-salvar>${exercicio ? t('exercise.form.salvar') : t('exercise.form.criar')}</button>
    </div>
  `);
  openSheet(exercicio ? t('exercise.form.tituloEditar') : t('exercise.form.tituloNovo'), corpo);

  corpo.querySelector('[data-salvar]').onclick = async () => {
    const nome = corpo.querySelector('[data-nome]').value.trim();
    const grupoMuscular = corpo.querySelector('[data-grupo]').value;
    if (!nome) { toast(t('exercise.form.deNome')); return; }

    if (exercicio) await db.updateExercise(exercicio.id, { nome, grupoMuscular });
    else await db.addExercise({ nome, grupoMuscular });

    closeSheet();
    toast(exercicio ? t('exercise.form.toastAtualizado') : t('exercise.form.toastCriado'));
    refresh();
  };
}
