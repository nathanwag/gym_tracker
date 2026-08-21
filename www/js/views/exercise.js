/* Biblioteca de exercicios e, para cada um, a tela de evolucao: recordes,
 * grafico e historico de todas as sessoes. */

import * as db from '../db.js';
import {
  bests, prSetIds, sessionSummaries, bestSessionVolume, progressPct,
} from '../models.js';
import { GRUPOS, agruparPorGrupo } from '../seed.js';
import { lineChart } from '../charts.js';
import * as catalogo from '../catalog.js';
import { thumbHtml, criarAnimacao } from '../media.js';
import {
  setTop, html, raw, node, ICON, ICON_GRUPO, toast, openSheet, closeSheet, confirmSheet,
  fmtNum, fmtRelativeDay, fmtDate, semAcento, refresh, wireSegmented,
} from '../ui.js';

/* ==========================================================================
   Lista
   ========================================================================== */

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
  let modo = temHistorico ? 'meus' : 'todos';
  let busca = '';

  setTop({ title: 'Exercícios', barra: false });

  const root = node(html`
    <div class="stack">
      <input class="input" data-busca type="search" placeholder="Buscar exercício"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div class="segmented" ${raw(temHistorico ? '' : 'hidden')}>
        <button class="segmented__btn" data-modo="meus" aria-pressed="true">Com registro</button>
        <button class="segmented__btn" data-modo="todos" aria-pressed="false">Todos</button>
      </div>
      <a class="btn btn--block btn--ghost" href="#/catalogo">
        ${raw(ICON.plus)} Buscar no catálogo (873 exercícios)
      </a>
      <button class="btn btn--block btn--ghost" data-novo>
        ${raw(ICON.plus)} Criar exercício
      </button>
      <div data-lista></div>
    </div>
  `);
  root.querySelector('[data-novo]').onclick = () => formularioExercicio();

  const lista = root.querySelector('[data-lista]');

  const desenhar = () => {
    const q = semAcento(busca.trim());
    let itens = exercicios;
    if (modo === 'meus') itens = itens.filter((e) => resumos.has(e.id));
    if (q) itens = itens.filter((e) => semAcento(e.nome).includes(q) || semAcento(e.grupoMuscular).includes(q));

    lista.innerHTML = '';
    if (!itens.length) {
      lista.append(node(html`
        <div class="card"><div class="empty">
          ${raw(ICON.dumbbell)}
          <p>${modo === 'meus' && !q
            ? 'Você ainda não registrou nenhuma série.'
            : 'Nenhum exercício encontrado.'}</p>
        </div></div>
      `));
      return;
    }

    // Agrupado por musculo, na ordem anatomica de GRUPOS (nao alfabetica).
    for (const { grupo, itens: doGrupo } of agruparPorGrupo(itens, (ex) => ex.grupoMuscular)) {
      lista.append(node(html`
        <h2 class="section-title section-title--icone">
          <span class="section-title__icone" aria-hidden="true">${raw(ICON_GRUPO[grupo] || '')}</span>
          ${grupo}
        </h2>
      `));
      const itensHtml = doGrupo.map((ex) => {
        const r = resumos.get(ex.id);
        const detalhe = r
          ? `${fmtRelativeDay(r.ultimo)} · melhor ${fmtNum(r.melhorPeso, 2)} ${unidade}`
          : 'sem registro';
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
    modo = botao.dataset.modo;
    desenhar();
  });

  desenhar();
  view.append(root);
}

/* ==========================================================================
   Detalhe / evolucao
   ========================================================================== */

// `curto` vai no botão (senão quebra em duas linhas na tela do celular) e
// `rotulo` na frase de variação, onde cabe o nome inteiro.
const METRICAS = {
  e1rm: { curto: '1RM', rotulo: '1RM estimado', campo: 'melhor1rm', decimais: 0 },
  peso: { curto: 'Carga', rotulo: 'carga máxima', campo: 'maxPeso', decimais: 1 },
  volume: { curto: 'Volume', rotulo: 'volume', campo: 'volume', decimais: 0 },
};

export async function renderDetail(view, exId) {
  const [exercicio, series, treinos, ativo] = await Promise.all([
    db.getExercise(exId),
    db.listSetsByExercise(exId),
    db.listWorkouts(),
    db.getActiveWorkout(),
  ]);

  if (!exercicio) {
    view.append(node('<div class="card card__pad">Exercício não encontrado.</div>'));
    return;
  }

  const unidade = db.settings().unidade;
  const treinosPorId = new Map(treinos.map((t) => [t.id, t]));
  const resumos = sessionSummaries(series, treinosPorId);
  const recordes = bests(series);
  const melhorVolume = bestSessionVolume(resumos);
  const prIds = prSetIds(series);

  setTop({
    title: exercicio.nome,
    back: '#/exercicios',
    actions: '<button class="btn btn--sm btn--ghost" data-menu aria-label="Opções">···</button>',
  });
  document.querySelector('[data-menu]').onclick = () => menuExercicio(exercicio, series.length);

  const root = node('<div class="stack"></div>');

  // As duas fotos alternando mostram o movimento. Fica antes dos numeros: quem
  // abre esta tela no meio da serie quer conferir a execucao primeiro.
  if (exercicio.slug) root.append(criarAnimacao(exercicio.slug, { nome: exercicio.nome }));

  root.append(node(html`
    <div class="card">
      <div class="stats">
        <div class="stat stat--pr">
          <div class="stat__val">${recordes.peso ? fmtNum(recordes.peso, 2) : '—'}</div>
          <div class="stat__label">recorde de carga (${unidade})</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${recordes.e1rm ? fmtNum(recordes.e1rm, 0) : '—'}</div>
          <div class="stat__label">1RM estimado</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${melhorVolume ? fmtNum(melhorVolume, 0) : '—'}</div>
          <div class="stat__label">melhor volume</div>
        </div>
      </div>
    </div>
  `));

  if (ativo && !(ativo.exerciseIds || []).includes(exercicio.id)) {
    const botao = node(html`
      <button class="btn btn--block" data-add-treino>${raw(ICON.plus)} Adicionar ao treino em andamento</button>
    `);
    botao.onclick = async () => {
      await db.addExerciseToWorkout(ativo.id, exercicio.id);
      toast('Adicionado ao treino.');
      location.hash = '#/sessao';
    };
    root.append(botao);
  }

  root.append(secaoGrafico(resumos, unidade));
  root.append(secaoHistorico(resumos, prIds, unidade));

  view.append(root);

  // Depois do append: o passo a passo vem de um arquivo separado e nao deve
  // atrasar o resto da tela, que e o motivo principal de estar aqui.
  if (exercicio.slug) {
    catalogo.instrucoes(exercicio.slug)
      .then((info) => {
        if (!info?.passos?.length || !root.isConnected) return;
        root.append(node(html`
          <div class="card card__pad">
            <h2 class="section-title" style="margin-top:0">
              Como fazer
              ${info.idioma === 'en'
                ? raw('<span class="badge badge--en" title="ainda sem tradução">EN</span>')
                : ''}
            </h2>
            <ol class="passos">${raw(info.passos.map((p) => html`<li>${p}</li>`).join(''))}</ol>
          </div>
        `));
      })
      .catch(() => { /* offline e sem o arquivo em cache: a tela segue util */ });
  }
}

function secaoGrafico(resumos, unidade) {
  const card = node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:6px">
        <h2 style="font-size:1rem">Evolução</h2>
        <p class="muted small" data-variacao style="margin:2px 0 10px"></p>
        <div class="segmented" data-metricas>
          ${raw(Object.entries(METRICAS)
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
    const m = METRICAS[chave];
    areaGrafico.innerHTML = '';

    if (resumos.length < 2) {
      areaGrafico.append(node(html`
        <div class="empty small">
          ${raw(ICON.dumbbell)}
          <p>${resumos.length === 0
            ? 'Nenhuma série registrada ainda.'
            : 'Registre este exercício em pelo menos dois treinos para ver a linha de evolução.'}</p>
        </div>
      `));
      textoVariacao.textContent = '';
      return;
    }

    const pontos = resumos.map((r) => ({
      quando: r.quando,
      valor: r[m.campo],
      rotulo: `${r.series.length} série(s) · melhor ${fmtNum(r.maxPeso, 2)} ${unidade}`,
    }));

    areaGrafico.append(lineChart({
      pontos,
      sufixo: chave === 'e1rm' ? '' : ` ${unidade}`,
      decimais: m.decimais,
    }));

    const variacao = progressPct(resumos, m.campo);
    if (variacao == null) {
      textoVariacao.textContent = '';
    } else {
      const sinal = variacao >= 0 ? '+' : '';
      textoVariacao.textContent =
        `${sinal}${fmtNum(variacao, 1)}% em ${m.rotulo} desde a primeira sessão (${fmtDate(resumos[0].quando)}).`;
    }
  };

  wireSegmented(card, (botao) => desenhar(botao.dataset.m));

  desenhar('e1rm');
  return card;
}

function secaoHistorico(resumos, prIds, unidade) {
  const wrap = node('<div></div>');
  wrap.append(node('<h2 class="section-title">Histórico</h2>'));

  if (!resumos.length) {
    wrap.append(node('<div class="card"><div class="empty small"><p>Sem sessões registradas.</p></div></div>'));
    return wrap;
  }

  const itens = [...resumos].reverse().map((r) => {
    const series = r.series
      .map((s) => `<span class="tnum">${fmtNum(s.peso, 2)}×${s.reps}</span>${prIds.has(s.id) ? ' 🏆' : ''}`)
      .join('<span class="muted"> · </span>');
    return html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${r.workoutId}">
          <div class="grow">
            <div style="font-weight:650">${fmtRelativeDay(r.quando)}</div>
            <div class="small" style="margin-top:2px">${raw(series)}</div>
            <div class="muted small">volume ${fmtNum(r.volume, 0)} ${unidade} · 1RM ${fmtNum(r.melhor1rm, 0)}</div>
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
      <button class="btn btn--block" data-renomear>Renomear / mudar grupo</button>
      <button class="btn btn--block" data-figura>
        ${exercicio.slug ? 'Trocar figura' : 'Escolher figura do catálogo'}
      </button>
      <button class="btn btn--block btn--danger" data-apagar>Apagar exercício</button>
      <p class="muted small" style="margin:0">
        ${totalSeries
          ? `Este exercício tem ${totalSeries} série(s) registradas. Para apagá-lo, apague antes os treinos em que ele aparece.`
          : 'Sem séries registradas.'}
      </p>
    </div>
  `);
  openSheet(exercicio.nome, corpo);

  corpo.querySelector('[data-renomear]').onclick = () => formularioExercicio(exercicio);
  corpo.querySelector('[data-figura]').onclick = () => escolherFigura(exercicio);
  corpo.querySelector('[data-apagar]').onclick = async () => {
    closeSheet();
    const ok = await confirmSheet({
      title: `Apagar ${exercicio.nome}?`,
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteExercise(exercicio.id);
      toast('Exercício apagado.');
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
             placeholder="Buscar figura" autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-resultados><p class="muted small">Carregando catálogo…</p></div>
      ${exercicio.slug ? raw('<button class="btn btn--block btn--ghost" data-limpar>Remover figura</button>') : ''}
    </div>
  `);
  openSheet('Figura do exercício', corpo);

  const busca = corpo.querySelector('[data-busca]');
  const resultados = corpo.querySelector('[data-resultados]');

  const aplicar = async (slug) => {
    await db.definirFiguraExercicio(exercicio.id, slug);
    closeSheet();
    toast(slug ? 'Figura atualizada.' : 'Figura removida.');
    refresh();
  };

  corpo.querySelector('[data-limpar]')?.addEventListener('click', () => aplicar(null));

  const desenhar = async () => {
    const { itens } = await catalogo.buscar(busca.value, { limite: 12 });
    resultados.innerHTML = '';

    if (!itens.length) {
      resultados.append(node('<p class="muted small">Nenhum exercício encontrado.</p>'));
      return;
    }

    const card = node(html`<div class="card"><ul class="list">${raw(itens.map((item) => html`
      <li class="list__item">
        <button class="list__link" data-slug="${item.slug}">
          ${raw(thumbHtml(item))}
          <div class="grow">
            <div style="font-weight:600">${item.nome}</div>
            <div class="muted small">${item.nomeEn}</div>
          </div>
          ${item.slug === exercicio.slug ? raw(`<span class="badge">atual</span>`) : ''}
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
    resultados.innerHTML = '<p class="muted small">Não consegui carregar o catálogo.</p>';
  });
}

function formularioExercicio(exercicio = null) {
  const corpo = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">Nome</span>
        <input class="input" data-nome value="${exercicio?.nome || ''}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">Grupo muscular</span>
        <select class="select" data-grupo>
          ${raw(GRUPOS.map((g) =>
            `<option value="${g}"${g === exercicio?.grupoMuscular ? ' selected' : ''}>${g}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-salvar>${exercicio ? 'Salvar' : 'Criar exercício'}</button>
    </div>
  `);
  openSheet(exercicio ? 'Editar exercício' : 'Novo exercício', corpo);

  corpo.querySelector('[data-salvar]').onclick = async () => {
    const nome = corpo.querySelector('[data-nome]').value.trim();
    const grupoMuscular = corpo.querySelector('[data-grupo]').value;
    if (!nome) { toast('Dê um nome ao exercício.'); return; }

    if (exercicio) await db.updateExercise(exercicio.id, { nome, grupoMuscular });
    else await db.addExercise({ nome, grupoMuscular });

    closeSheet();
    toast(exercicio ? 'Exercício atualizado.' : 'Exercício criado.');
    refresh();
  };
}
