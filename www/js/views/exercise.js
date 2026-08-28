/* Biblioteca de exercicios e, para cada um, a tela de evolucao: recordes,
 * grafico e historico de todas as sessoes. */

import * as db from '../db.js';
import {
  bests, prSetIds, sessionSummaries, bestSessionVolume, bestSessionDuration, progressPct,
} from '../models.js';
import {
  MUSCLE_GROUPS, groupBy, groupLabel, usesDuration,
} from '../seed.js';
import { lineChart } from '../charts.js';
import * as catalog from '../catalog.js';
import {
  thumbHtml, createAnimation, prefetchPhotos, fullUrl,
  preloadCustomThumbs, invalidateCustomThumbs, compressImage,
} from '../media.js';
import { t, tn, language } from '../i18n.js';
import { cleanSteps, sameSteps } from '../text.js';
import {
  setTop, html, raw, node, ICON, ICON_GROUPS, toast, openSheet, closeSheet, confirmSheet, goBack,
  fmtNum, fmtRelativeDay, fmtDate, fmtTempoSerie, fmtSet, stripAccents, refresh, wireSegmented,
} from '../ui.js';

/* ==========================================================================
   Lista
   ========================================================================== */

// Lembram o filtro (meus/todos) e o texto buscado da biblioteca entre
// visitas nesta sessao — mesmo motivo do catalogo (catalog.js): sem isso,
// voltar de um exercicio sempre reabria a lista filtrada do zero.
// `rememberedMode` nao pode nascer com valor fixo porque seu padrao depende
// de `hasHistory`, so conhecido em runtime — null = ainda nao decidido.
let rememberedMode = null;
let search = '';

export async function renderList(view) {
  const [exercises, sets] = await Promise.all([db.listExercises(), db.listAllSets()]);
  const unit = db.settings().unit;

  // Resumo por exercicio numa unica passada pelas series.
  const summaries = new Map();
  for (const s of sets) {
    let r = summaries.get(s.exerciseId);
    if (!r) {
      r = {
        total: 0, lastId: 0, last: null, bestWeight: 0,
      };
      summaries.set(s.exerciseId, r);
    }
    r.total += 1;
    if (s.id > r.lastId) { r.lastId = s.id; r.last = s.createdAt; }
    if (!s.warmup && s.weight > r.bestWeight) r.bestWeight = s.weight;
  }

  const hasHistory = summaries.size > 0;
  if (rememberedMode === null) rememberedMode = hasHistory ? 'mine' : 'all';

  setTop({ title: t('exercise.listTitle'), showBar: false });

  const root = node(html`
    <div class="stack">
      <input class="input" data-search type="search" placeholder="${t('exercise.searchPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off" value="${search}">
      <div class="segmented" ${raw(hasHistory ? '' : 'hidden')}>
        <button class="segmented__btn" data-mode="mine" aria-pressed="${String(rememberedMode === 'mine')}">${t('exercise.filter.logged')}</button>
        <button class="segmented__btn" data-mode="all" aria-pressed="${String(rememberedMode === 'all')}">${t('exercise.filter.all')}</button>
      </div>
      <a class="btn btn--block btn--ghost" href="#/catalogo">
        ${raw(ICON.plus)} ${t('exercise.searchCatalog')}
      </a>
      <button class="btn btn--block btn--ghost" data-new>
        ${raw(ICON.plus)} ${t('exercise.createExercise')}
      </button>
      <div data-list></div>
    </div>
  `);
  root.querySelector('[data-new]').onclick = () => exerciseForm();

  const list = root.querySelector('[data-list]');

  const draw = () => {
    const q = stripAccents(search.trim());
    let items = exercises;
    if (rememberedMode === 'mine') items = items.filter((e) => summaries.has(e.id));
    if (q) items = items.filter((e) => stripAccents(e.name).includes(q) || stripAccents(e.muscleGroup).includes(q));

    list.innerHTML = '';
    if (!items.length) {
      list.append(node(html`
        <div class="card"><div class="empty">
          ${raw(ICON.dumbbell)}
          <p>${rememberedMode === 'mine' && !q ? t('exercise.noneLoggedEmpty') : t('exercise.noneFound')}</p>
        </div></div>
      `));
      return;
    }

    // Agrupado por musculo, na ordem anatomica de MUSCLE_GROUPS (nao alfabetica).
    for (const { group, items: groupItems } of groupBy(items, (ex) => ex.muscleGroup)) {
      list.append(node(html`
        <h2 class="section-title section-title--icone">
          <span class="section-title__icone" aria-hidden="true">${raw(ICON_GROUPS[group] || '')}</span>
          ${groupLabel(group)}
        </h2>
      `));
      const itemsHtml = groupItems.map((ex) => {
        const r = summaries.get(ex.id);
        const detail = r
          ? `${fmtRelativeDay(r.last)} · ${t('exercise.bestWeight', { weight: fmtNum(r.bestWeight, 2), unit })}`
          : t('exercise.notLogged');
        return html`
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
        `;
      });
      list.append(node(html`<div class="card"><ul class="list">${raw(itemsHtml.join(''))}</ul></div>`));
    }
  };

  root.querySelector('[data-search]').addEventListener('input', (e) => {
    search = e.target.value;
    draw();
  });

  wireSegmented(root, (button) => {
    rememberedMode = button.dataset.mode;
    draw();
  });

  draw();
  // Miniaturas personalizadas nao atrasam a primeira pintura: desenha de
  // novo so quando (e se) o cache terminar de carregar, igual ao passo a
  // passo do detalhe (linha ~253) — mesmo motivo, arquivo/leitura separada.
  preloadCustomThumbs().then(() => { if (list.isConnected) draw(); }).catch(() => {});
  view.append(root);
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

  setTop({
    title: exercise.name,
    back: '#/exercicios',
    actions: `<a class="btn btn--sm btn--ghost" href="#/exercicios/${exercise.id}/editar">${t('exercise.editScreen.action')}</a>`,
  });

  const root = node('<div class="stack"></div>');

  // As duas fotos alternando mostram o movimento. Fica antes dos numeros: quem
  // abre esta tela no meio da serie quer conferir a execucao primeiro.
  revokeDetailPhotoUrls();
  const photos = photoSection(exercise, images);
  if (photos) root.append(photos);

  root.append(node(timeBased ? html`
    <div class="card">
      <div class="stats">
        <div class="stat stat--pr">
          <div class="stat__val">${records.duration ? fmtTempoSerie(records.duration) : '—'}</div>
          <div class="stat__label">${t('exercise.timeRecord')}</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${bestTotalTime ? fmtTempoSerie(bestTotalTime) : '—'}</div>
          <div class="stat__label">${t('exercise.totalSessionTime')}</div>
        </div>
      </div>
    </div>
  ` : html`
    <div class="card">
      <div class="stats">
        <div class="stat stat--pr">
          <div class="stat__val">${records.weight ? fmtNum(records.weight, 2) : '—'}</div>
          <div class="stat__label">${t('exercise.weightRecord', { unit })}</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${records.e1rm ? fmtNum(records.e1rm, 0) : '—'}</div>
          <div class="stat__label">${t('exercise.metric.e1rmLabel')}</div>
        </div>
        <div class="stat stat--pr">
          <div class="stat__val">${bestVolume ? fmtNum(bestVolume, 0) : '—'}</div>
          <div class="stat__label">${t('exercise.bestVolume')}</div>
        </div>
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

function chartSection(summaries, unit, timeBased) {
  const m = metrics(timeBased);
  const card = node(html`
    <div class="card">
      <div class="card__pad" style="padding-bottom:6px">
        <h2 style="font-size:1rem">${t('exercise.progress')}</h2>
        <p class="muted small" data-change style="margin:2px 0 10px"></p>
        <div class="segmented" data-metrics>
          ${raw(Object.entries(m)
            .map(([key, metric], i) => `<button class="segmented__btn" data-m="${key}" aria-pressed="${i === 0}">${metric.short}</button>`)
            .join(''))}
        </div>
      </div>
      <div data-chart style="padding:6px 8px 12px"></div>
    </div>
  `);

  const chartArea = card.querySelector('[data-chart]');
  const changeText = card.querySelector('[data-change]');

  const draw = (key) => {
    const metric = m[key];
    chartArea.innerHTML = '';

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
    if (change == null) {
      changeText.textContent = '';
    } else {
      changeText.textContent = t('exercise.chart.change', {
        sign: change >= 0 ? '+' : '',
        value: fmtNum(change, 1),
        label: metric.label,
        date: fmtDate(summaries[0].when),
      });
    }
  };

  wireSegmented(card, (button) => draw(button.dataset.m));

  draw(Object.keys(m)[0]);
  return card;
}

function historySection(summaries, prIds, unit, timeBased) {
  const wrap = node('<div></div>');
  wrap.append(node(`<h2 class="section-title">${t('exercise.history.title')}</h2>`));

  if (!summaries.length) {
    wrap.append(node(`<div class="card"><div class="empty small"><p>${t('exercise.history.empty')}</p></div></div>`));
    return wrap;
  }

  const items = [...summaries].reverse().map((r) => {
    const sets = r.sets
      .map((s) => `<span class="tnum">${fmtSet(s)}</span>${prIds.has(s.id) ? ' 🏆' : ''}`)
      .join('<span class="muted"> · </span>');
    const summaryLine = timeBased
      ? t('exercise.history.totalTime', { time: fmtTempoSerie(r.totalDuration) })
      : t('exercise.history.volumeRm', { volume: fmtNum(r.volume, 0), unit, rm: fmtNum(r.bestE1rm, 0) });
    return html`
      <li class="list__item">
        <a class="list__link" href="#/historico/${r.workoutId}">
          <div class="grow">
            <div style="font-weight:650">${fmtRelativeDay(r.when)}</div>
            <div class="small" style="margin-top:2px">${raw(sets)}</div>
            <div class="muted small">${summaryLine}</div>
          </div>
          <span class="list__chev">${raw(ICON.chevron)}</span>
        </a>
      </li>
    `;
  });

  wrap.append(node(html`<div class="card"><ul class="list">${raw(items.join(''))}</ul></div>`));
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
        <label class="field grow">
          <span class="field__label">${t('exercise.form.muscleGroup')}</span>
          <select class="select" data-group>
            ${raw(MUSCLE_GROUPS.map((g) =>
              `<option value="${g}"${g === exercise.muscleGroup ? ' selected' : ''}>${groupLabel(g)}</option>`).join(''))}
          </select>
        </label>
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
 *  que ja existe e a tela cheia `renderEdit`. */
function exerciseForm() {
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('exercise.form.name')}</span>
        <input class="input" data-name value="" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('exercise.form.muscleGroup')}</span>
        <select class="select" data-group>
          ${raw(MUSCLE_GROUPS.map((g) => `<option value="${g}">${groupLabel(g)}</option>`).join(''))}
        </select>
      </label>
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
