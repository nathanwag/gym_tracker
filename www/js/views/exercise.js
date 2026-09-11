/* Biblioteca de exercicios e, para cada um, a tela de evolucao: recordes,
 * grafico e historico de todas as sessoes. */

import * as db from '../db.js';
import {
  bests, prSetIds, sessionSummaries, bestSessionVolume, bestSessionDuration, progressPct,
  exerciseProgressRows,
} from '../models.js';
import {
  groupLabel, usesDuration,
} from '../seed.js';
import { groupSlugFor } from '../groups.js';
import { lineChart } from '../charts.js';
import * as catalog from '../catalog.js';
import { byEquipment, sectionsByEquipment } from '../equipment.js';
import {
  thumbHtml, createAnimation, prefetchPhotos, fullUrl,
  preloadCustomThumbs, invalidateCustomThumbs, compressImage,
} from '../media.js';
import { t, tn, language } from '../i18n.js';
import { cleanSteps, sameSteps, normalizeName } from '../text.js';
import {
  setTop, html, raw, node, esc, ICON, toast, openSheet, closeSheet, confirmSheet, goBack,
  fmtNum, fmtRelativeDay, fmtDateShort, fmtDayNum, fmtMonthShort, fmtTempoSerie,
  fmtSet, fmtSetWithUnit, stripAccents, refresh, wireSegmented, infoRow,
  listInCard, groupColor, groupIcon, groupField, lastDoneLabel,
} from '../ui.js';

/* ==========================================================================
   Lista
   ========================================================================== */

// Lembra o texto buscado entre visitas nesta sessao: sem isso, voltar de um
// exercicio reabria a busca do zero. Escopo de modulo, nao da funcao.
let search = '';

// Teto de resultados do catalogo. Renderizar 873 linhas trava a rolagem no
// celular, e quem precisa de mais de 40 precisa mesmo e refinar a busca.
const CATALOG_SHOWN = 40;

/* Achar exercicio: 17 linhas de grupo, e a lista so dentro de uma delas.
 *
 * A biblioteca inteira numa lista achatada, com os 873 do catalogo embaixo,
 * funcionava com 12 exercicios e desmontava com 60: rolar era a unica forma de
 * achar. O indice por grupo nao cresce — sao as mesmas 17 linhas com 12
 * exercicios ou com 300, e cada uma diz quantos sao seus e quantos ainda tem
 * no catalogo.
 *
 * A busca continua achatada de proposito: digitar e o atalho de quem ja sabe o
 * nome, e ai o corte por grupo so atrapalharia. O indice e o estado de repouso.
 *
 * Precedente: Strong e Hevy abrem a biblioteca por musculo.
 */
export async function renderList(view) {
  // Sem `back`: esta tela virou a raiz da aba Exercicios.
  setTop({ title: t('exercise.listTitle') });

  const [lib, templates] = await Promise.all([libraryData(), db.listTemplates()]);
  const { exercises, unit, progress } = lib;

  const root = node(html`
    <div class="stack">
      <input class="input" data-search type="search" placeholder="${t('exercise.searchPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off" value="${search}">
      <div data-body></div>
      <a class="srow" href="#/grupos">
        <span class="srow__mid">
          <span class="srow__day">${t('groups.title')}</span>
          <span class="srow__detail">${t('groups.rowHint')}</span>
        </span>
        <span class="srow__go">${raw(ICON.chevron)}</span>
      </a>
    </div>
  `);
  const body = root.querySelector('[data-body]');

  // Quem ja esta na biblioteca sai do resultado do catalogo: ele apareceu logo
  // acima, em "Meus", e la com o historico junto.
  const mineSlugs = new Set(exercises.map((e) => e.slug).filter(Boolean));
  let catalogItems = null;
  let catalogByGroup = new Map();

  // Criar so aparece com busca digitada: no indice, criar acontece DENTRO de um
  // grupo, e ali o exercicio ja nasce classificado.
  const createButton = node('<button class="btn btn--block" data-create></button>');
  createButton.onclick = () => exerciseForm(search.trim());

  const drawIndex = () => {
    body.append(templateRow(templates));

    const mineByGroup = countBy(exercises, (ex) => groupSlugFor(ex.muscleGroup));
    body.append(node(`<h2 class="section-title">${t('exercise.groups.section')}</h2>`));
    // Ordem anatomica, inclusive os vazios: empurrar grupo sem exercicio pro
    // fim faria a lista se reordenar sozinha a cada exercicio criado, e a
    // posicao fixa de "Costas" e metade do que faz achar sem ler.
    body.append(listInCard(db.groups().map((g) => groupItem(
      g, mineByGroup.get(g.slug) || 0, catalogByGroup.get(g.slug) || 0,
    ))));
  };

  const drawSearch = (q) => {
    const term = stripAccents(q);

    const mine = exercises.filter((e) => stripAccents(e.name).includes(term)
      || stripAccents(groupLabel(e.muscleGroup)).includes(term));
    if (mine.length) {
      body.append(node(`<h2 class="section-title">${t('exercise.mine')}</h2>`));
      body.append(listInCard(mine.map((ex) => mineItem(ex, progress, unit))));
    }

    let matches = [];
    if (catalogItems) {
      const needle = normalizeName(q);
      matches = catalogItems.filter((i) => i.searchKey.includes(needle) && !mineSlugs.has(i.slug));
      const shown = matches.slice(0, CATALOG_SHOWN);
      if (shown.length) {
        body.append(node(`<h2 class="section-title">${t('exercise.catalogSection', { total: matches.length })}</h2>`));
        body.append(listInCard(shown.map(catalogRow)));
        if (matches.length > shown.length) {
          body.append(node(html`
            <p class="muted small" style="text-align:center;margin-top:10px">
              ${t('catalog.showingOf', { shown: shown.length, total: matches.length })}
            </p>
          `));
        }
      }
    }

    if (!mine.length && !matches.length) {
      body.append(node(html`
        <div class="card"><div class="empty">
          ${raw(ICON.dumbbell)}
          <p>${t('exercise.noneFound')}</p>
        </div></div>
      `));
    }

    createButton.innerHTML = html`${raw(ICON.plus)} ${t('exercise.createNamed', { q })}`;
    body.append(createButton);
  };

  const draw = () => {
    const q = search.trim();
    body.innerHTML = '';
    if (q) drawSearch(q);
    else drawIndex();
  };

  root.querySelector('[data-search]').addEventListener('input', (e) => {
    search = e.target.value;
    draw();
  });

  draw();
  // O catalogo e um JSON de 873 itens: carregar antes da primeira pintura
  // atrasaria a tela. Ate ele chegar, a linha do grupo mostra so o que e seu.
  catalog.load().then((items) => {
    catalogItems = items;
    catalogByGroup = countBy(items, (i) => groupSlugFor(i.grupo));
    if (body.isConnected) draw();
  }).catch(() => {});
  // Miniaturas personalizadas nao atrasam a primeira pintura: desenha de novo
  // so quando (e se) o cache terminar de carregar.
  preloadCustomThumbs().then(() => { if (body.isConnected) draw(); }).catch(() => {});
  view.append(root);
}

/* ---------- Um grupo ----------
 * A unica lista de exercicio do app. O catalogo daquele grupo vem junto, logo
 * abaixo dos seus: adicionar "Supino declinado" acontece de dentro de Peito, e
 * nao numa busca a parte que exige saber o nome antes.
 *
 * O texto buscado e lembrado por grupo, como `search` e na lista: sair num
 * exercicio e voltar nao pode limpar o filtro. Guardar o slug junto zera o
 * campo ao trocar de grupo, que e o que se espera de outra tela. */
let groupSearch = { slug: null, q: '' };

export async function renderGroup(view, slug) {
  const group = db.groups().find((g) => g.slug === slug);
  if (!group) {
    setTop({ title: t('exercise.listTitle'), back: '#/exercicios' });
    view.append(node(`<div class="card card__pad">${t('exercise.groups.notFound')}</div>`));
    return;
  }

  const label = groupLabel(group.slug);
  setTop({ title: label, back: '#/exercicios' });

  if (groupSearch.slug !== slug) groupSearch = { slug, q: '' };

  const { exercises, unit, progress } = await libraryData();
  const mine = exercises.filter((e) => groupSlugFor(e.muscleGroup) === slug);
  const mineSlugs = new Set(mine.map((e) => e.slug).filter(Boolean));

  const root = node(html`
    <div class="stack">
      <input class="input" data-search type="search" placeholder="${t('exercise.groups.searchIn', { group: label })}"
             autocomplete="off" autocapitalize="none" autocorrect="off" value="${groupSearch.q}">
      <div data-body></div>
    </div>
  `);
  const body = root.querySelector('[data-body]');
  let catalogItems = null;

  const createButton = node('<button class="btn btn--block" data-create></button>');
  createButton.onclick = () => exerciseForm(groupSearch.q.trim(), slug);

  const draw = () => {
    const q = groupSearch.q.trim();
    const term = stripAccents(q);
    body.innerHTML = '';

    const shown = term ? mine.filter((e) => stripAccents(e.name).includes(term)) : mine;
    if (shown.length) {
      body.append(node(`<h2 class="section-title">${t('exercise.groups.mineSection', { n: shown.length })}</h2>`));
      body.append(listInCard(shown.map((ex) => mineItem(ex, progress, unit))));
    }

    createButton.innerHTML = q
      ? html`${raw(ICON.plus)} ${t('exercise.createNamed', { q })}`
      : html`${raw(ICON.plus)} ${t('exercise.createInGroup', { group: label })}`;
    body.append(createButton);

    let matches = [];
    if (catalogItems) {
      const needle = normalizeName(q);
      matches = catalogItems.filter((i) => groupSlugFor(i.grupo) === slug
        && !mineSlugs.has(i.slug)
        && (!q || i.searchKey.includes(needle)));
      // Ordem por equipamento, nao alfabetica (ver equipment.js). Tem que vir
      // ANTES do slice: senao os 40 exibidos continuam sendo os 40 primeiros do
      // alfabeto, que e exatamente o problema — em Peito isso dava "Arrasto de
      // trenó" e cinco arremessos de bola medicinal antes de qualquer supino.
      if (!q) matches = [...matches].sort(byEquipment);
      const page = matches.slice(0, CATALOG_SHOWN);
      if (page.length) {
        body.append(node(`<h2 class="section-title">${t('exercise.catalogSection', { total: matches.length })}</h2>`));
        // Busca achata: quem digitou o nome nao quer navegar por secao. Mesmo
        // principio que faz a busca desligar o corte por grupo na raiz da aba.
        const sections = q ? [] : sectionsByEquipment(page);
        body.append(listInCard(sections.length > 1
          ? sections.flatMap((sec) => [equipmentDivider(sec), ...sec.items.map(catalogRow)])
          : page.map(catalogRow)));
        if (matches.length > page.length) {
          body.append(node(html`
            <p class="muted small" style="text-align:center;margin-top:10px">
              ${t('catalog.showingOf', { shown: page.length, total: matches.length })}
            </p>
          `));
        }
      }
    }

    if (!shown.length && !matches.length) {
      body.append(node(html`
        <div class="card"><div class="empty">
          ${raw(ICON.dumbbell)}
          <p>${q ? t('exercise.noneFound') : t('exercise.groups.emptyGroup', { group: label })}</p>
        </div></div>
      `));
    }
  };

  root.querySelector('[data-search]').addEventListener('input', (e) => {
    groupSearch.q = e.target.value;
    draw();
  });

  draw();
  catalog.load().then((items) => {
    catalogItems = items;
    if (body.isConnected) draw();
  }).catch(() => {});
  preloadCustomThumbs().then(() => { if (body.isConnected) draw(); }).catch(() => {});
  view.append(root);
}

/* ---------- Pecas compartilhadas pelas duas telas ---------- */

/** O que as duas listas precisam do banco. A mesma fonte que o Progresso usa
 *  pra dizer "ultima vez": a data do TREINO, nao o createdAt da linha de serie
 *  — os dois divergem em backup importado, e as telas mostrariam dias
 *  diferentes pro mesmo exercicio. */
async function libraryData() {
  const [exercises, sets, workouts] = await Promise.all([
    db.listExercises(), db.listAllSets(), db.listWorkouts(),
  ]);
  const progress = new Map(exerciseProgressRows(
    sets, new Map(workouts.map((w) => [w.id, w])), exercises,
    (ex) => (usesDuration(ex.muscleGroup) ? 'totalDuration' : 'bestE1rm'),
  ).map((r) => [r.exercise.id, r]));

  return { exercises, unit: db.settings().unit, progress };
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** Modelos entra pela aba Exercicios porque responde a pergunta dela — "o que
 *  eu tenho pra treinar?" — e porque e a lista mais curta e a que menos muda,
 *  entao pode ficar acima do indice sem empurrar nada util pra baixo. Os nomes
 *  na segunda linha sao o que faz a linha valer mais que um rotulo. */
function templateRow(templates) {
  return infoRow(
    t('templates.listTitle'),
    templates.length ? tn('common.template', templates.length) : t('templates.rowNone'),
    () => { location.hash = '#/modelos'; },
    {
      icon: ICON.steps,
      hint: templates.length
        ? templates.map((tpl) => tpl.name).join(' · ')
        : t('templates.rowHint'),
    },
  );
}

/** Linha do indice. Sem o numero do catalogo enquanto o JSON nao chegou: um
 *  "0 no catálogo" que vira "79" meio segundo depois e pior que nada. */
/* Divisor de equipamento DENTRO da lista, e nao um segundo `.section-title`:
 * dois niveis de rotulo em condensada e caixa alta empilhados sao a "lista de
 * listas" que o DESIGN.md manda evitar. O valor vem cru do catalogo, em
 * portugues, como a linha do exercicio ja faz. */
const equipmentDivider = (sec) => node(html`
  <li class="list__sec">${sec.equipment}<span class="list__sec__n">${sec.items.length}</span></li>
`);

function groupItem(group, mine, inCatalog) {
  const parts = [mine ? tn('exercise.groups.mine', mine) : t('exercise.groups.none')];
  if (inCatalog) parts.push(t('exercise.groups.catalog', { n: inCatalog }));

  return node(html`
    <li class="list__item">
      <a class="list__link" href="#/exercicios/grupo/${group.slug}">
        <span class="thumb" aria-hidden="true">${raw(groupIcon(group.slug))}</span>
        <div class="grow">
          <div style="font-weight:600">${groupLabel(group.slug)}</div>
          <div class="muted small">${parts.join(' · ')}</div>
        </div>
        <span class="list__chev">${raw(ICON.chevron)}</span>
      </a>
    </li>
  `);
}

function mineItem(ex, progress, unit) {
  const row = progress.get(ex.id);
  const detail = row ? lastDoneLabel(ex, row, unit) : t('exercise.notLogged');
  return node(html`
    <li class="list__item">
      <a class="list__link" href="#/exercicios/${ex.id}">
        ${raw(thumbHtml(ex))}
        <div class="grow">
          <div style="font-weight:600">${ex.name}</div>
          <div class="muted small">${detail}</div>
        </div>
        <span class="list__chev">${raw(ICON.chevron)}</span>
      </a>
    </li>
  `);
}

function catalogRow(item) {
  return node(html`
    <li class="list__item">
      <a class="list__link" href="#/catalogo/${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div class="catalog__name">${catalog.displayName(item)}</div>
          <div class="muted small">${item.equipamento}${item.nivel ? ` · ${item.nivel}` : ''}</div>
        </div>
        <span class="list__chev">${raw(ICON.chevron)}</span>
      </a>
    </li>
  `);
}

/* ==========================================================================
   Detalhe / evolucao
   ========================================================================== */

// `short` vai no botão (senão quebra em duas linhas na tela do celular) e
// `label` na frase de variação, onde cabe o nome inteiro. Funcao, nao const
// de modulo: precisa reavaliar t() a cada render (idioma pode mudar em runtime).
function metrics(timeBased) {
  if (timeBased) {
    return {
      duration: {
        short: t('exercise.metric.durationShort'), label: t('exercise.metric.durationLabel'), field: 'bestDuration', decimals: 1,
      },
      totalDuration: {
        short: t('exercise.metric.totalTimeShort'), label: t('exercise.metric.totalTimeLabel'), field: 'totalDuration', decimals: 1,
      },
    };
  }
  return {
    e1rm: {
      short: t('exercise.metric.e1rmShort'), label: t('exercise.metric.e1rmLabel'), field: 'bestE1rm', decimals: 0,
    },
    weight: {
      short: t('exercise.metric.weightShort'), label: t('exercise.metric.weightLabel'), field: 'maxWeight', decimals: 1,
    },
    volume: {
      short: t('exercise.metric.volumeShort'), label: t('exercise.metric.volumeLabel'), field: 'volume', decimals: 0,
    },
  };
}

export async function renderDetail(view, exId) {
  const [exercise, sets, workouts, active, images] = await Promise.all([
    db.getExercise(exId),
    db.listSetsByExercise(exId),
    db.listWorkouts(),
    db.getActiveWorkout(),
    db.getExerciseImages(exId),
  ]);

  if (!exercise) {
    view.append(node(`<div class="card card__pad">${t('exercise.notFound')}</div>`));
    return;
  }

  const unit = db.settings().unit;
  const timeBased = usesDuration(exercise.muscleGroup);
  const workoutsById = new Map(workouts.map((w) => [w.id, w]));
  const summaries = sessionSummaries(sets, workoutsById);
  const records = bests(sets);
  const bestVolume = bestSessionVolume(summaries);
  const bestTotalTime = bestSessionDuration(summaries);
  const prIds = prSetIds(sets);

  // Sem topbar: a foto sangra ate o topo da tela e o nome fica sobre ela.
  // Dentro de um cartao com margem, a unica imagem grande do app pedia
  // licenca — e o nome aparecia duas vezes, na barra e embaixo.
  setTop({ title: exercise.name, showBar: false });

  const root = node('<div class="stack"></div>');

  // As duas fotos alternando mostram o movimento. Fica antes dos numeros: quem
  // abre esta tela no meio da serie quer conferir a execucao primeiro.
  revokeDetailPhotoUrls();
  const photos = photoSection(exercise, images);
  if (photos) root.append(heroPhoto(exercise, photos));
  else root.append(heroTitle(exercise));

  root.append(node(timeBased ? html`
    <div class="recs" style="grid-template-columns:repeat(2, 1fr)">
      <div class="rec rec--pr">
        <span class="rec__val">${records.duration ? fmtTempoSerie(records.duration) : '—'}</span>
        <span class="rec__label">${t('exercise.timeRecord')}</span>
      </div>
      <div class="rec">
        <span class="rec__val">${bestTotalTime ? fmtTempoSerie(bestTotalTime) : '—'}</span>
        <span class="rec__label">${t('exercise.totalSessionTime')}</span>
      </div>
    </div>
  ` : html`
    <div class="recs">
      <div class="rec rec--pr">
        <span class="rec__val">${records.weight ? fmtNum(records.weight, 2) : '—'}</span>
        <span class="rec__label">${t('exercise.weightRecord', { unit })}</span>
      </div>
      <div class="rec">
        <span class="rec__val">${records.e1rm ? fmtNum(records.e1rm, 0) : '—'}</span>
        <span class="rec__label">${t('exercise.record.e1rm')}</span>
      </div>
      <div class="rec">
        <span class="rec__val">${bestVolume ? fmtNum(bestVolume, 0) : '—'}</span>
        <span class="rec__label">${t('exercise.bestVolume')}</span>
      </div>
    </div>
  `));

  if (active && !(active.exerciseIds || []).includes(exercise.id)) {
    const button = node(html`
      <button class="btn btn--block" data-add-workout>${raw(ICON.plus)} ${t('exercise.addToWorkout')}</button>
    `);
    button.onclick = async () => {
      await db.addExerciseToWorkout(active.id, exercise.id);
      toast(t('exercise.toastAddedToWorkout'));
      location.hash = '#/sessao';
    };
    root.append(button);
  }

  root.append(chartSection(summaries, unit, timeBased));
  root.append(historySection(summaries, prIds, unit, timeBased));

  view.append(root);

  // `exercise.steps` (personalizado pelo usuario) tem prioridade sobre o
  // passo a passo do catalogo. So cai no catalogo quando o campo nunca foi
  // salvo (`undefined`) — uma edicao resultando em lista vazia e um override
  // explicito de "sem passo a passo", nao volta a mostrar o do catalogo.
  if (Array.isArray(exercise.steps)) {
    if (exercise.steps.length) root.append(stepsCard(exercise.steps));
  } else if (exercise.slug) {
    // Depois do append: o passo a passo vem de um arquivo separado e nao deve
    // atrasar o resto da tela, que e o motivo principal de estar aqui.
    catalog.instructions(exercise.slug)
      .then((info) => {
        const steps = info?.[language()];
        if (!steps?.length || !root.isConnected) return;
        root.append(stepsCard(steps));
      })
      .catch(() => { /* offline e sem o arquivo em cache: a tela segue util */ });
  }
}

function stepsCard(steps) {
  return node(html`
    <div class="card card__pad">
      <h2 class="section-title" style="margin-top:0">${t('exercise.howTo')}</h2>
      <ol class="steps">${raw(steps.map((p) => html`<li>${p}</li>`).join(''))}</ol>
    </div>
  `);
}

/* ---------- Fotos personalizadas (posicao inicial/final) ---------- */

// URLs de objeto da tela de detalhe aberta no momento — revogadas na proxima
// abertura (ou troca de exercicio) para nao vazar memoria numa sessao longa.
let detailPhotoUrls = [];

function revokeDetailPhotoUrls() {
  for (const url of detailPhotoUrls) URL.revokeObjectURL(url);
  detailPhotoUrls = [];
}

// Mesma ideia de detailPhotoUrls, para a tela de edicao: as previas das fotos
// pendentes viram object URLs revogadas ao entrar, ao salvar e ao descartar.
let editPhotoUrls = [];

function revokeEditPhotoUrls() {
  for (const url of editPhotoUrls) URL.revokeObjectURL(url);
  editPhotoUrls = [];
}

/** Envolve a foto no cabecalho que sangra ate a borda: escurecimento por
 *  cima, nome do exercicio embaixo e os controles (voltar / editar) flutuando
 *  no topo, ja que a topbar sai de cena nesta tela. */
function heroPhoto(exercise, photos) {
  const wrap = node(html`
    <div class="hero-photo">
      <div data-photo></div>
      <div class="hero-photo__scrim"></div>
      <div class="exc__over" style="inset:auto auto auto 0;top:calc(var(--safe-top) + 8px);left:8px">
        <button class="icon-btn" data-back aria-label="${t('app.back')}">${raw(ICON.back)}</button>
      </div>
      <div class="exc__over" style="inset:auto 8px auto auto;top:calc(var(--safe-top) + 8px)">
        <a class="icon-btn" href="#/exercicios/${exercise.id}/editar" aria-label="${t('exercise.editScreen.action')}">${raw(ICON.pencil)}</a>
      </div>
      <div class="hero-photo__over">
        ${raw(groupChip(exercise))}
        <h1 class="hero-photo__name">${exercise.name}</h1>
      </div>
    </div>
  `);
  wrap.querySelector('[data-photo]').replaceWith(photos);
  wrap.querySelector('[data-back]').onclick = () => goBack('#/exercicios');
  return wrap;
}

/** Exercicio sem nenhuma foto: o nome sozinho, no mesmo tamanho, sem o
 *  retangulo cinza que uma foto ausente deixaria. */
function heroTitle(exercise) {
  const el = node(html`
    <div class="row" style="gap:6px;align-items:flex-start">
      <button class="icon-btn" data-back aria-label="${t('app.back')}" style="margin-left:-10px">${raw(ICON.back)}</button>
      <div class="grow">
        ${raw(groupChip(exercise, { onPhoto: false }))}
        <h1 class="hero-photo__name" style="color:var(--text);text-shadow:none">${exercise.name}</h1>
      </div>
      <a class="icon-btn" href="#/exercicios/${exercise.id}/editar" aria-label="${t('exercise.editScreen.action')}">${raw(ICON.pencil)}</a>
    </div>
  `);
  el.querySelector('[data-back]').onclick = () => goBack('#/exercicios');
  return el;
}

function groupChip(exercise, { onPhoto = true } = {}) {
  const group = exercise.muscleGroup || 'Outros';
  return html`
    <div class="exc__group" style="${onPhoto ? '' : 'color:var(--muted);text-shadow:none'}">
      <span class="exc__dot" style="background:${groupColor(group)}"></span>${groupLabel(group)}
    </div>
  `;
}

/** Decide o que mostrar no lugar da animacao flip: foto(s) personalizada(s)
 *  se houver alguma, senao a do catalogo (slug), senao nada.
 *
 *  Uma vez que existe QUALQUER foto personalizada, a tela para de misturar
 *  com a foto do catalogo no outro slot — evita uma animacao com dois
 *  enquadramentos/pessoas diferentes piscando junto. Slot que falta vira uma
 *  dica pra completar em vez de uma foto emprestada. */
function photoSection(exercise, [blob0, blob1]) {
  if (blob0 || blob1) {
    const url0 = blob0 ? URL.createObjectURL(blob0) : null;
    const url1 = blob1 ? URL.createObjectURL(blob1) : null;
    detailPhotoUrls.push(...[url0, url1].filter(Boolean));

    if (url0 && url1) return createAnimation({ frameA: url0, frameB: url1, name: exercise.name });

    const missing = url0 ? t('exercise.photos.endLabel') : t('exercise.photos.startLabel');
    return node(html`
      <div class="stack">
        <div class="photo-slot__preview"><img src="${url0 || url1}" alt=""></div>
        <p class="muted small" style="margin:0">${t('exercise.photos.missingHint', { slot: missing })}</p>
      </div>
    `);
  }

  if (exercise.slug) {
    return createAnimation({ frameA: fullUrl(exercise.slug, 0), frameB: fullUrl(exercise.slug, 1), name: exercise.name });
  }
  return null;
}

// Sem cartao, no mesmo molde da tendencia da home: rotulo com a metrica de um
// lado e a variacao do outro, e o grafico solto no fundo.
function chartSection(summaries, unit, timeBased) {
  const m = metrics(timeBased);
  const card = node(html`
    <div>
      <div class="lab">
        <span data-window></span>
        <span data-change></span>
      </div>
      <div class="segmented" data-metrics>
        ${raw(Object.entries(m)
          .map(([key, metric], i) => `<button class="segmented__btn" data-m="${key}" aria-pressed="${i === 0}">${metric.short}</button>`)
          .join(''))}
      </div>
      <div data-chart style="padding:10px 0 2px"></div>
    </div>
  `);

  const chartArea = card.querySelector('[data-chart]');
  const changeText = card.querySelector('[data-change]');
  const windowText = card.querySelector('[data-window]');

  const draw = (key) => {
    const metric = m[key];
    chartArea.innerHTML = '';
    windowText.textContent = summaries.length
      ? t('exercise.chart.window', { label: metric.short, date: fmtDateShort(summaries[0].when) })
      : t('exercise.progress');

    if (summaries.length < 2) {
      chartArea.append(node(html`
        <div class="empty small">
          ${raw(ICON.dumbbell)}
          <p>${summaries.length === 0 ? t('exercise.chart.emptyNoSets') : t('exercise.chart.emptyFewWorkouts')}</p>
        </div>
      `));
      changeText.textContent = '';
      return;
    }

    const points = summaries.map((r) => ({
      when: r.when,
      // Duracao e guardada em segundos; o grafico mostra em minutos (mais
      // legivel numa serie de sessoes) — nao afeta progressPct, que so olha razao.
      value: timeBased ? r[metric.field] / 60 : r[metric.field],
      label: timeBased
        ? `${tn('common.set', r.sets.length)} · ${t('exercise.bestDurationLabel', { duration: fmtTempoSerie(r.bestDuration) })}`
        : `${tn('common.set', r.sets.length)} · ${t('exercise.bestWeight', { weight: fmtNum(r.maxWeight, 2), unit })}`,
    }));

    chartArea.append(lineChart({
      points,
      suffix: timeBased ? ` ${t('common.min')}` : (key === 'e1rm' ? '' : ` ${unit}`),
      decimals: metric.decimals,
    }));

    const change = progressPct(summaries, metric.field);
    changeText.textContent = change == null ? '' :
      t('common.pct', { sign: change >= 0 ? '+' : '', value: fmtNum(change, 1) });
    changeText.style.color = change == null || change === 0 ? '' : `var(--${change > 0 ? 'success' : 'danger'})`;
  };

  wireSegmented(card, (button) => draw(button.dataset.m));

  draw(Object.keys(m)[0]);
  return card;
}

function historySection(summaries, prIds, unit, timeBased) {
  const wrap = node('<div></div>');
  wrap.append(node(`<h2 class="section-title">${t('exercise.history.title')}</h2>`));

  if (!summaries.length) {
    wrap.append(node(`<div class="empty small"><p>${t('exercise.history.empty')}</p></div>`));
    return wrap;
  }

  // Mesma linha da lista de treinos: bloco de data a esquerda, a leitura
  // principal no meio, o numero da sessao a direita. O que muda e o miolo —
  // la e a assinatura de grupos, aqui e a serie que mandou no dia.
  for (const r of [...summaries].reverse()) {
    const best = bests(r.sets);
    const topSet = best.setWeight || best.setDuration || r.sets[0];
    const rest = r.sets.filter((s) => s !== topSet);
    const isPR = r.sets.some((s) => prIds.has(s.id));

    wrap.append(node(html`
      <a class="hrow" href="#/historico/${r.workoutId}">
        <span class="hrow__day">
          <span class="hrow__num">${fmtDayNum(r.when)}</span>
          <span class="hrow__wd">${fmtMonthShort(r.when)}</span>
        </span>
        <span class="hrow__mid">
          <span class="hrow__set">
            ${fmtSetWithUnit(topSet, unit)}
            ${isPR ? raw(`<span class="led__star" aria-label="${t('session.led.pr')}">${ICON.star}</span>`) : ''}
          </span>
          ${rest.length ? raw(`<span class="hrow__groups">${rest.map((s) => esc(fmtSet(s))).join(' · ')}</span>`) : ''}
        </span>
        <span class="hrow__end">
          <span class="hrow__vol">${timeBased ? fmtTempoSerie(r.totalDuration) : fmtNum(r.volume, 0)}</span>
          <span class="hrow__meta">
            <span class="hrow__unit">${timeBased ? t('exercise.history.totalLabel') : unit}</span>
          </span>
        </span>
      </a>
    `));
  }
  return wrap;
}

/* ==========================================================================
   Editar: uma tela so para nome, grupo, unilateral, figura, fotos e passo a
   passo. Nada grava ate o "Salvar" — inclusive as fotos, que ficam como Blob
   em memoria (pendingPhotos) e sao aplicadas na ordem do handler.
   ========================================================================== */

export async function renderEdit(view, exId) {
  revokeEditPhotoUrls();

  const [exercise, images] = await Promise.all([
    db.getExercise(exId),
    db.getExerciseImages(exId),
  ]);

  if (!exercise) {
    setTop({ title: t('exercise.form.editTitle'), back: '#/exercicios' });
    view.append(node(`<div class="card card__pad">${t('exercise.notFound')}</div>`));
    return;
  }

  const totalSets = await db.countSetsByExercise(exId);
  const detailHash = `#/exercicios/${exId}`;

  // Prefill do passo a passo: override do usuario > passo a passo do catalogo
  // (se tem slug) > vazio. Mesmo criterio que renderDetail usa para exibir.
  const catalogSteps = Array.isArray(exercise.steps)
    ? null
    : (exercise.slug ? (await catalog.instructions(exercise.slug).catch(() => null))?.[language()] : null);
  const initialSteps = exercise.steps ?? catalogSteps ?? [];

  // ---- estado pendente ----
  const originalSlug = exercise.slug ?? null;
  let pendingSlug = originalSlug;
  const pendingPhotos = [undefined, undefined]; // undefined=manter, null=remover, Blob=nova
  const previewUrls = images.map((blob) => {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    editPhotoUrls.push(url);
    return url;
  });
  let dirty = false;
  const stepsEditor = createStepsEditor(initialSteps);
  const isDirty = () => dirty || stepsEditor.isDirty();

  setTop({
    title: t('exercise.form.editTitle'),
    back: detailHash,
    actions: `<button class="btn btn--sm btn--primary" data-save>${t('common.save')}</button>`,
  });

  const leave = () => { revokeEditPhotoUrls(); goBack(detailHash); };

  // Guarda de descarte: sobrescreve o handler que o setTop pos no botao voltar.
  // So cobre o botao <- ; troca de aba ou gesto do navegador descartam calado,
  // como no resto do app.
  const backBtn = document.querySelector('#topbar-back');
  if (backBtn) {
    backBtn.onclick = async () => {
      if (isDirty()) {
        const ok = await confirmSheet({
          title: t('exercise.editScreen.discardTitle'),
          message: t('exercise.editScreen.discardMessage'),
          confirmLabel: t('exercise.editScreen.discardConfirm'),
          danger: true,
        });
        if (!ok) return;
      }
      leave();
    };
  }

  const root = node('<div class="stack"></div>');

  /* --- Nome / grupo / unilateral: sempre visivel, e o que mais se edita --- */
  const basics = node(html`
    <div class="card card__pad stack--sm">
      <label class="field">
        <span class="field__label">${t('exercise.form.name')}</span>
        <input class="input" data-name value="${exercise.name}" autocapitalize="sentences">
      </label>
      <div class="row" style="align-items:flex-end">
        ${raw(groupField(exercise.muscleGroup, { grow: true }))}
        <label class="field--chip" title="${t('exercise.form.unilateral')}">
          <input type="checkbox" data-unilateral${exercise.unilateral ? ' checked' : ''}>
          <span>${t('exercise.editScreen.unilateralShort')}</span>
        </label>
      </div>
    </div>
  `);
  const nameInput = basics.querySelector('[data-name]');
  const groupSelect = basics.querySelector('[data-group]');
  const uniCheckbox = basics.querySelector('[data-unilateral]');
  nameInput.addEventListener('input', () => { dirty = true; });
  uniCheckbox.addEventListener('change', () => { dirty = true; });
  groupSelect.addEventListener('change', () => { dirty = true; drawFrames(); });

  /* --- Secao dobravel: cabecalho com resumo + corpo que abre no lugar.
         Nasce fechada — a tela inteira cabe numa altura so, independente de
         quantos passos o exercicio tenha. --- */
  function section(icon, name, body) {
    const el = node(html`
      <div class="card">
        <button class="editor-sec__head" type="button" aria-expanded="false">
          <span class="editor-sec__icon">${raw(icon)}</span>
          <span class="editor-sec__name">${name}</span>
          <span class="editor-sec__sum" data-sum></span>
          <span class="editor-sec__chev">${raw(ICON.chevron)}</span>
        </button>
      </div>
    `);
    const head = el.querySelector('.editor-sec__head');
    body.classList.add('editor-sec__body');
    body.hidden = true;
    el.append(body);
    head.onclick = () => {
      const open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', String(!open));
      body.hidden = open;
    };
    return { el, summary: el.querySelector('[data-sum]') };
  }

  /* --- Imagem: figura do catalogo e fotos proprias sao a MESMA coisa. A
         imagem sao dois quadros (inicial/final); o catalogo preenche os dois
         de uma vez, a camera troca um quadro so. --- */
  const framesGrid = node('<div class="frames"></div>');
  const imageBody = node('<div class="stack--sm"></div>');
  const catalogBtn = node(html`<button class="btn btn--block btn--ghost" data-catalog></button>`);
  imageBody.append(framesGrid, catalogBtn);
  const image = section(ICON.image, t('exercise.editScreen.imageSection'), imageBody);

  // Selo curto no quadro (o espaco e pequeno); o nome inteiro fica no
  // aria-label, que e quem o leitor de tela anuncia.
  const frameLabels = [t('exercise.photos.startLabel'), t('exercise.photos.endLabel')];
  const frameBadges = [t('exercise.editScreen.frameStart'), t('exercise.editScreen.frameEnd')];

  function drawFrame(slot) {
    const custom = previewUrls[slot];
    const removed = pendingPhotos[slot] === null;
    // Foto do catalogo entra esmaecida, como referencia: e o que aquele quadro
    // vai mostrar, mas nao e uma foto "sua" ate voce escolher uma.
    const reference = (!custom && !removed && pendingSlug) ? fullUrl(pendingSlug, slot) : null;
    const src = custom || reference;
    const el = node(html`
      <div class="frame">
        <button class="frame__pick" type="button" data-pick aria-label="${frameLabels[slot]}">
          ${raw(src ? `<img src="${src}" alt=""${custom ? '' : ' class="frame__ref"'}>` : '')}
          <span class="frame__label">${frameBadges[slot]}</span>
          <span class="frame__cam">${raw(ICON.camera)}</span>
        </button>
        <button class="btn btn--sm btn--ghost" data-remove ${raw(custom ? '' : 'hidden')}>${t('exercise.photos.remove')}</button>
        <input type="file" accept="image/*" capture="environment" hidden data-file>
      </div>
    `);
    const file = el.querySelector('[data-file]');
    el.querySelector('[data-pick]').onclick = () => file.click();
    file.addEventListener('change', async (e) => {
      const chosen = e.target.files[0];
      if (!chosen) return;
      try {
        const blob = await compressImage(chosen);
        if (previewUrls[slot]) URL.revokeObjectURL(previewUrls[slot]);
        pendingPhotos[slot] = blob;
        previewUrls[slot] = URL.createObjectURL(blob);
        editPhotoUrls.push(previewUrls[slot]);
        dirty = true;
        redrawFrame(slot);
      } catch {
        toast(t('exercise.photos.processError'));
      }
    });
    el.querySelector('[data-remove]').onclick = () => {
      if (previewUrls[slot]) URL.revokeObjectURL(previewUrls[slot]);
      previewUrls[slot] = null;
      pendingPhotos[slot] = null;
      dirty = true;
      redrawFrame(slot);
    };
    return el;
  }

  function redrawFrame(slot) {
    framesGrid.replaceChild(drawFrame(slot), framesGrid.children[slot]);
    drawImageSummary();
  }

  function drawFrames() {
    framesGrid.innerHTML = '';
    framesGrid.append(drawFrame(0), drawFrame(1));
    catalogBtn.textContent = pendingSlug
      ? t('exercise.menu.changePhoto')
      : t('exercise.menu.choosePhotoFromCatalog');
    drawImageSummary();
  }

  function drawImageSummary() {
    const hasCustom = previewUrls.some(Boolean);
    image.summary.textContent = hasCustom
      ? t('exercise.editScreen.imageCustom')
      : (pendingSlug ? t('exercise.editScreen.imageFromCatalog') : t('exercise.editScreen.imageNone'));
  }

  catalogBtn.onclick = () => openFigurePicker({
    name: nameInput.value,
    currentSlug: pendingSlug,
    onPick: (slug) => {
      pendingSlug = slug;
      dirty = true;
      drawFrames();
    },
  });

  /* --- Passo a passo --- */
  const stepsBody = node('<div></div>');
  stepsBody.append(stepsEditor.el);
  const steps = section(ICON.steps, t('exercise.steps.sheetTitle'), stepsBody);
  const drawStepsSummary = () => {
    const n = stepsEditor.getSteps().length;
    steps.summary.textContent = n ? tn('common.step', n) : t('exercise.editScreen.noSteps');
  };
  stepsEditor.onChange(drawStepsSummary);

  /* --- Apagar --- */
  const deleteZone = node(html`
    <div class="card card__pad stack--sm">
      <button class="btn btn--block btn--danger" data-delete>${t('exercise.menu.delete')}</button>
      <p class="muted small" style="margin:0">
        ${totalSets ? t('exercise.menu.hasSets', { sets: tn('common.set', totalSets) }) : t('exercise.menu.noSets')}
      </p>
    </div>
  `);
  deleteZone.querySelector('[data-delete]').onclick = async () => {
    const ok = await confirmSheet({
      title: t('exercise.menu.confirmDelete.title', { name: exercise.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteExercise(exId);
      toast(t('exercise.menu.toastDeleted'));
      location.hash = '#/exercicios';
    } catch (err) {
      toast(err.message);
    }
  };

  /* --- Salvar: uma gravacao so para tudo (inclusive as fotos pendentes) --- */
  document.querySelector('[data-save]').onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { toast(t('exercise.form.giveItAName')); nameInput.focus(); return; }

    const patch = {
      name,
      muscleGroup: groupSelect.value,
      unilateral: uniCheckbox.checked,
      slug: pendingSlug,
    };
    // So grava `steps` se o usuario mexeu: senao, renomear promoveria o passo a
    // passo do catalogo a um override congelado e sem idioma.
    if (stepsEditor.isDirty()) patch.steps = stepsEditor.getSteps();

    try {
      await db.updateExercise(exId, patch);

      let photosTouched = false;
      for (const slot of [0, 1]) {
        const p = pendingPhotos[slot];
        if (p === undefined) continue;
        photosTouched = true;
        if (p === null) await db.removeExerciseImage(exId, slot);
        else await db.saveExerciseImage(exId, slot, p);
      }

      if (patch.slug && patch.slug !== originalSlug) prefetchPhotos(patch.slug);
      if (photosTouched) invalidateCustomThumbs();

      revokeEditPhotoUrls();
      dirty = false;
      toast(t('exercise.form.toastUpdated'));
      goBack(detailHash);
    } catch (err) {
      toast(err.message);
    }
  };

  drawFrames();
  drawStepsSummary();

  root.append(basics, image.el, steps.el, deleteZone);
  view.append(root);
}

/* ---------- Criar / editar / apagar ---------- */

function createStepsEditor(initial) {
  // Copia `initial` (pode ser o array do exerciseCache) e guarda um baseline
  // para dizer se o usuario realmente mexeu — e o que decide, no Salvar, se
  // grava `steps` ou se o exercicio segue herdando o passo a passo do catalogo.
  const list = (initial || []).map((s) => String(s));
  const baseline = cleanSteps(list);
  // Quem monta a tela usa isto pra manter o resumo do cabecalho ("4 passos")
  // em dia sem precisar saber como o editor guarda a lista.
  let notify = () => {};

  const el = node('<div class="stack--sm"></div>');
  const rows = node('<div class="stack--sm" data-rows></div>');
  const addBtn = node(html`<button class="btn btn--block btn--ghost" data-add>${raw(ICON.plus)} ${t('exercise.steps.addStep')}</button>`);
  el.append(rows, addBtn);

  const drawRows = () => {
    rows.innerHTML = '';
    list.forEach((value, i) => {
      const row = node(html`
        <div class="step-row">
          <textarea class="input" rows="2" aria-label="${t('exercise.steps.stepLabel', { n: i + 1 })}">${value}</textarea>
          <div class="step-row__actions">
            <button class="icon-btn" type="button" data-up aria-label="${t('exercise.steps.moveUp')}" ${raw(i === 0 ? 'disabled' : '')}>${raw(ICON.up)}</button>
            <button class="icon-btn" type="button" data-down aria-label="${t('exercise.steps.moveDown')}" ${raw(i === list.length - 1 ? 'disabled' : '')}>${raw(ICON.down)}</button>
            <button class="icon-btn" type="button" data-remove aria-label="${t('exercise.steps.removeStep')}">${raw(ICON.trash)}</button>
          </div>
        </div>
      `);
      row.querySelector('textarea').addEventListener('input', (e) => { list[i] = e.target.value; notify(); });
      row.querySelector('[data-up]').onclick = () => {
        if (i === 0) return;
        [list[i - 1], list[i]] = [list[i], list[i - 1]];
        drawRows();
      };
      row.querySelector('[data-down]').onclick = () => {
        if (i === list.length - 1) return;
        [list[i + 1], list[i]] = [list[i], list[i + 1]];
        drawRows();
      };
      row.querySelector('[data-remove]').onclick = () => { list.splice(i, 1); drawRows(); notify(); };
      rows.append(row);
    });
  };
  drawRows();

  addBtn.onclick = () => {
    list.push('');
    drawRows();
    notify();
    rows.lastElementChild.querySelector('textarea').focus();
  };

  return {
    el,
    getSteps: () => cleanSteps(list),
    isDirty: () => !sameSteps(list, baseline),
    onChange: (fn) => { notify = fn; },
  };
}

/** Escolhe (ou remove) a figura do catalogo. Nao grava nada — devolve a escolha
 *  por callback; quem chama decide o que fazer com ela. */
function openFigurePicker({ name, currentSlug, onPick }) {
  const body = node(html`
    <div class="stack">
      <input class="input" data-search type="search" value="${name}"
             placeholder="${t('exercise.photo.searchPlaceholder')}" autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-results><p class="muted small">${t('exercise.photo.loadingCatalog')}</p></div>
      ${currentSlug ? raw(`<button class="btn btn--block btn--ghost" data-clear>${t('exercise.photo.remove')}</button>`) : ''}
    </div>
  `);
  openSheet(t('exercise.photo.sheetTitle'), body);

  const searchInput = body.querySelector('[data-search]');
  const results = body.querySelector('[data-results]');
  const pick = (slug) => { closeSheet(); onPick(slug); };

  body.querySelector('[data-clear]')?.addEventListener('click', () => pick(null));

  const draw = async () => {
    const { items } = await catalog.search(searchInput.value, { limit: 12 });
    results.innerHTML = '';

    if (!items.length) {
      results.append(node(`<p class="muted small">${t('exercise.photo.noneFound')}</p>`));
      return;
    }

    const card = node(html`<div class="card"><ul class="list">${raw(items.map((item) => html`
      <li class="list__item">
        <button class="list__link" data-slug="${item.slug}">
          ${raw(thumbHtml(item))}
          <div class="grow">
            <div style="font-weight:600">${catalog.displayName(item)}</div>
            <div class="muted small">${item.nomeEn}</div>
          </div>
          ${item.slug === currentSlug ? raw(`<span class="badge">${t('exercise.photo.current')}</span>`) : ''}
        </button>
      </li>
    `).join(''))}</ul></div>`);

    for (const button of card.querySelectorAll('[data-slug]')) {
      button.onclick = () => pick(button.dataset.slug);
    }
    results.append(card);
  };

  searchInput.addEventListener('input', () => { draw().catch(() => {}); });
  draw().catch(() => {
    results.innerHTML = `<p class="muted small">${t('exercise.photo.loadError')}</p>`;
  });
}

/** Sheet de criar exercicio (nome + grupo + unilateral). Editar um exercicio
 *  que ja existe e a tela cheia `renderEdit`.
 *
 *  Exportado porque o Progresso abre esta mesma folha: criar exercicio e a
 *  acao da biblioteca, e a biblioteca aparece la. Duas folhas diferentes pra
 *  mesma coisa divergiriam no primeiro campo novo. */
/* `group` vem preenchido quando o botao esta DENTRO de um grupo: criado de
 * la, o exercicio ja nasce classificado, e nao no fallback 'outros'. */
export function exerciseForm(name = '', group = null) {
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('exercise.form.name')}</span>
        <input class="input" data-name value="${name}" autocapitalize="sentences">
      </label>
      ${raw(groupField(group))}
      <label class="field field--check">
        <input type="checkbox" data-unilateral>
        <span>${t('exercise.form.unilateral')}</span>
      </label>
      <button class="btn btn--primary btn--block" data-save>${t('exercise.form.create')}</button>
    </div>
  `);
  openSheet(t('exercise.form.newTitle'), body);

  body.querySelector('[data-save]').onclick = async () => {
    const name = body.querySelector('[data-name]').value.trim();
    if (!name) { toast(t('exercise.form.giveItAName')); return; }

    await db.addExercise({
      name,
      muscleGroup: body.querySelector('[data-group]').value,
      unilateral: body.querySelector('[data-unilateral]').checked,
    });

    closeSheet();
    toast(t('exercise.form.toastCreated'));
    refresh();
  };
}
