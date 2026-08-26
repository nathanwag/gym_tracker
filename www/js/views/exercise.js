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
import { thumbHtml, createAnimation, prefetchPhotos } from '../media.js';
import { t, tn, language } from '../i18n.js';
import {
  setTop, html, raw, node, ICON, ICON_GROUPS, toast, openSheet, closeSheet, confirmSheet,
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
  const [exercise, sets, workouts, active] = await Promise.all([
    db.getExercise(exId),
    db.listSetsByExercise(exId),
    db.listWorkouts(),
    db.getActiveWorkout(),
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
    actions: `<button class="btn btn--sm btn--ghost" data-menu aria-label="${t('exercise.options')}">···</button>`,
  });
  document.querySelector('[data-menu]').onclick = () => exerciseMenu(exercise, sets.length);

  const root = node('<div class="stack"></div>');

  // As duas fotos alternando mostram o movimento. Fica antes dos numeros: quem
  // abre esta tela no meio da serie quer conferir a execucao primeiro.
  if (exercise.slug) root.append(createAnimation(exercise.slug, { name: exercise.name }));

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

  // Depois do append: o passo a passo vem de um arquivo separado e nao deve
  // atrasar o resto da tela, que e o motivo principal de estar aqui.
  if (exercise.slug) {
    catalog.instructions(exercise.slug)
      .then((info) => {
        const steps = info?.[language()];
        if (!steps?.length || !root.isConnected) return;
        root.append(node(html`
          <div class="card card__pad">
            <h2 class="section-title" style="margin-top:0">${t('exercise.howTo')}</h2>
            <ol class="steps">${raw(steps.map((p) => html`<li>${p}</li>`).join(''))}</ol>
          </div>
        `));
      })
      .catch(() => { /* offline e sem o arquivo em cache: a tela segue util */ });
  }
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

/* ---------- Criar / editar / apagar ---------- */

function exerciseMenu(exercise, totalSets) {
  const body = node(html`
    <div class="stack">
      <button class="btn btn--block" data-rename>${t('exercise.menu.rename')}</button>
      <button class="btn btn--block" data-image>
        ${exercise.slug ? t('exercise.menu.changePhoto') : t('exercise.menu.choosePhotoFromCatalog')}
      </button>
      <button class="btn btn--block btn--danger" data-delete>${t('exercise.menu.delete')}</button>
      <p class="muted small" style="margin:0">
        ${totalSets ? t('exercise.menu.hasSets', { sets: tn('common.set', totalSets) }) : t('exercise.menu.noSets')}
      </p>
    </div>
  `);
  openSheet(exercise.name, body);

  body.querySelector('[data-rename]').onclick = () => exerciseForm(exercise);
  body.querySelector('[data-image]').onclick = () => chooseImage(exercise);
  body.querySelector('[data-delete]').onclick = async () => {
    closeSheet();
    const ok = await confirmSheet({
      title: t('exercise.menu.confirmDelete.title', { name: exercise.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteExercise(exercise.id);
      toast(t('exercise.menu.toastDeleted'));
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
function chooseImage(exercise) {
  const body = node(html`
    <div class="stack">
      <input class="input" data-search type="search" value="${exercise.name}"
             placeholder="${t('exercise.photo.searchPlaceholder')}" autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-results><p class="muted small">${t('exercise.photo.loadingCatalog')}</p></div>
      ${exercise.slug ? raw(`<button class="btn btn--block btn--ghost" data-clear>${t('exercise.photo.remove')}</button>`) : ''}
    </div>
  `);
  openSheet(t('exercise.photo.sheetTitle'), body);

  const searchInput = body.querySelector('[data-search]');
  const results = body.querySelector('[data-results]');

  const apply = async (slug) => {
    await db.setExerciseImage(exercise.id, slug);
    if (slug) prefetchPhotos(slug);
    closeSheet();
    toast(slug ? t('exercise.photo.toastUpdated') : t('exercise.photo.toastRemoved'));
    refresh();
  };

  body.querySelector('[data-clear]')?.addEventListener('click', () => apply(null));

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
          ${item.slug === exercise.slug ? raw(`<span class="badge">${t('exercise.photo.current')}</span>`) : ''}
        </button>
      </li>
    `).join(''))}</ul></div>`);

    for (const button of card.querySelectorAll('[data-slug]')) {
      button.onclick = () => apply(button.dataset.slug);
    }
    results.append(card);
  };

  searchInput.addEventListener('input', () => { draw().catch(() => {}); });
  draw().catch(() => {
    results.innerHTML = `<p class="muted small">${t('exercise.photo.loadError')}</p>`;
  });
}

function exerciseForm(exercise = null) {
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('exercise.form.name')}</span>
        <input class="input" data-name value="${exercise?.name || ''}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('exercise.form.muscleGroup')}</span>
        <select class="select" data-group>
          ${raw(MUSCLE_GROUPS.map((g) =>
            `<option value="${g}"${g === exercise?.muscleGroup ? ' selected' : ''}>${groupLabel(g)}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-save>${exercise ? t('exercise.form.save') : t('exercise.form.create')}</button>
    </div>
  `);
  openSheet(exercise ? t('exercise.form.editTitle') : t('exercise.form.newTitle'), body);

  body.querySelector('[data-save]').onclick = async () => {
    const name = body.querySelector('[data-name]').value.trim();
    const muscleGroup = body.querySelector('[data-group]').value;
    if (!name) { toast(t('exercise.form.giveItAName')); return; }

    if (exercise) await db.updateExercise(exercise.id, { name, muscleGroup });
    else await db.addExercise({ name, muscleGroup });

    closeSheet();
    toast(exercise ? t('exercise.form.toastUpdated') : t('exercise.form.toastCreated'));
    refresh();
  };
}
