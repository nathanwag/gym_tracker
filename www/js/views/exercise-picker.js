/* Tela pra escolher um exercicio e por num treino, em duas etapas: primeiro o
 * grupo muscular (alvos grandes, pensados pra mao suada no meio da serie),
 * depois o exercicio daquele grupo.
 *
 * Era um bottom sheet, que na pratica ja ocupava 88% da tela — mas sem botao
 * de voltar e com rolagem dentro de rolagem. Virou rota
 * (#/treino/:id/adicionar) usada tanto pelo treino em andamento quanto pela
 * edicao de um treino do historico: nos dois casos a tarefa e a mesma, "por o
 * exercicio E no treino T".
 *
 * As tres saidas de "preciso de um exercicio que ainda nao tenho" continuam
 * aqui: biblioteca, catalogo de 873 (pela busca) e criar na hora. */

import * as db from '../db.js';
import * as catalog from '../catalog.js';
import { MUSCLE_GROUPS, groupBy, groupLabel } from '../seed.js';
import { thumbHtml, prefetchPhotos, preloadCustomThumbs } from '../media.js';
import { t } from '../i18n.js';
import {
  html, raw, node, ICON, ICON_GROUPS, toast, setTop, openSheet, closeSheet, goBack,
  stripAccents, listInCard,
} from '../ui.js';

// Etapa atual: null = grade de grupos; nome do grupo = lista dele.
let openGroup = null;
// Quem chamou usa pra rolar ate o exercicio recem-adicionado depois de voltar.
let lastAdded = null;

/** Id do exercicio adicionado na ultima passagem por aqui, consumido uma vez. */
export function takeLastAdded() {
  const id = lastAdded;
  lastAdded = null;
  return id;
}

export async function render(view, workoutId) {
  const [workout, exercises] = await Promise.all([
    db.getWorkout(workoutId),
    db.listExercises(),
  ]);

  if (!workout) {
    setTop({ title: t('picker.sheetTitle'), back: '#/historico' });
    view.append(node(`<div class="card card__pad">${t('history.notFound')}</div>`));
    return;
  }

  // Treino em aberto se retoma pela sessao; treino fechado vive no historico.
  // So vale como destino de emergencia: goBack() prefere de onde a pessoa veio.
  const backTo = workout.finishedAt ? `#/historico/${workout.id}` : '#/sessao';
  const alreadyChosenIds = new Set(workout.exerciseIds || []);

  openGroup = null;

  const choose = async (exercise) => {
    await db.addExerciseToWorkout(workout.id, exercise.id);
    lastAdded = exercise.id;
    goBack(backTo);
  };

  const root = node(html`
    <div class="stack">
      <input class="input" data-search type="search" placeholder="${t('picker.searchPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-results></div>
    </div>
  `);
  const searchInput = root.querySelector('[data-search]');
  const results = root.querySelector('[data-results]');

  // Dica do catalogo: aparece ao tocar no bloco "Catalogo" e some assim que a
  // pessoa digita — o catalogo nao tem tela propria aqui, ele vem pela busca.
  let catalogHint = false;

  const topbar = () => setTop({
    title: openGroup ? groupLabel(openGroup) : t('picker.sheetTitle'),
    back: backTo,
    // Dentro de um grupo, voltar sobe uma etapa em vez de sair da tela.
    actions: '',
  });

  const goUp = () => {
    if (openGroup) { openGroup = null; topbar(); wireBack(); draw(); return; }
    goBack(backTo);
  };

  function wireBack() {
    const back = document.querySelector('#topbar-back');
    if (back) back.onclick = goUp;
  }

  const draw = () => {
    const q = stripAccents(searchInput.value.trim());
    results.innerHTML = '';

    // Buscando: lista plana. Achar o que foi digitado importa mais que navegar
    // por grupo nesse momento — e a busca alcanca o catalogo logo abaixo.
    if (q) {
      const filtered = exercises.filter((e) =>
        stripAccents(e.name).includes(q) || stripAccents(e.muscleGroup).includes(q));

      if (filtered.length) {
        results.append(listInCard(filtered.map((ex) => exerciseItem(ex, alreadyChosenIds, choose))));
      } else {
        results.append(node(html`<p class="muted small">${t('picker.noneFound')}</p>`));
      }

      const newName = searchInput.value.trim();
      if (!exercises.some((e) => stripAccents(e.name) === q)) {
        const fromCatalog = node('<div data-catalog></div>');
        results.append(fromCatalog);
        showCatalogSuggestions(fromCatalog, newName, exercises, choose);

        const create = node(html`
          <button class="btn btn--block" style="margin-top:12px" data-create>
            ${raw(ICON.plus)} ${t('picker.createName', { name: newName })}
          </button>
        `);
        create.onclick = () => newExerciseForm(newName, choose);
        results.append(create);
      }
      return;
    }

    if (catalogHint) {
      results.append(node(html`
        <div class="card"><div class="empty small">
          ${raw(ICON.search)}
          <p>${t('picker.catalogHint')}</p>
        </div></div>
      `));
      return;
    }

    // Etapa 2: os exercicios do grupo escolhido.
    if (openGroup) {
      const items = exercises.filter((e) => e.muscleGroup === openGroup);
      results.append(listInCard(items.map((ex) => exerciseItem(ex, alreadyChosenIds, choose))));
      return;
    }

    // Etapa 1: os grupos, na ordem anatomica de MUSCLE_GROUPS.
    const grid = node('<div class="tiles"></div>');
    for (const { group, items } of groupBy(exercises, (e) => e.muscleGroup)) {
      const tile = node(html`
        <button class="tile" type="button">
          <span class="tile__icon" aria-hidden="true">${raw(ICON_GROUPS[group] || '')}</span>
          <span class="tile__name">${groupLabel(group)}</span>
          <span class="tile__n">${items.length}</span>
        </button>
      `);
      tile.onclick = () => { openGroup = group; topbar(); wireBack(); draw(); };
      grid.append(tile);
    }

    const catalogTile = node(html`
      <button class="tile tile--catalog" type="button">
        <span class="tile__icon" aria-hidden="true">${raw(ICON.search)}</span>
        <span class="tile__name">${t('picker.catalogTile')}</span>
        <span class="tile__n">873</span>
      </button>
    `);
    catalogTile.onclick = () => { catalogHint = true; draw(); searchInput.focus(); };
    grid.append(catalogTile);

    results.append(grid);
  };

  searchInput.addEventListener('input', () => { catalogHint = false; draw(); });

  topbar();
  view.append(root);
  wireBack();
  draw();
  // Mesmo padrao de exercise.js:renderList — nao atrasa a primeira pintura,
  // so redesenha se (e quando) o cache de miniaturas terminar de carregar.
  preloadCustomThumbs().then(() => { if (results.isConnected) draw(); }).catch(() => {});
}

/** Sugestoes do catalogo dentro do seletor.
 *
 *  O catalogo so e carregado quando o usuario ja digitou algo, para a tela
 *  abrir instantanea. O arquivo esta em cache do service worker, entao mesmo
 *  offline isto e leitura local. */
async function showCatalogSuggestions(target, term, exercises, choose) {
  let items;
  try {
    ({ items } = await catalog.search(term, { limit: 6 }));
  } catch {
    return; // sem catalogo o seletor segue funcionando como antes
  }

  // Ja na biblioteca? Entao ja apareceu na lista de cima.
  const mine = new Set(exercises.map((e) => e.slug).filter(Boolean));
  const newItems = items.filter((i) => !mine.has(i.slug));
  if (!newItems.length || !target.isConnected) return;

  target.append(node(`<h3 class="section-title">${t('picker.fromCatalog')}</h3>`));

  const catalogItem = (item) => {
    const li = node(html`
      <li class="list__item">
        <button class="list__link">
          ${raw(thumbHtml(item))}
          <div class="grow">
            <div style="font-weight:600">${catalog.displayName(item)}</div>
            <div class="muted small">${groupLabel(item.grupo)} · ${item.equipamento}</div>
          </div>
          ${raw(ICON.plus)}
        </button>
      </li>
    `);
    li.querySelector('button').onclick = async () => {
      // Um toque faz tudo: entra na biblioteca, entra no treino e ja busca as
      // fotos com a rede que houver agora.
      const created = await db.addExerciseFromCatalog(item);
      prefetchPhotos(item.slug);
      await choose(created);
    };
    return li;
  };

  target.append(listInCard(newItems.map(catalogItem)));
}

/** Uma linha de exercicio no seletor — usada tanto na lista plana (buscando)
 *  quanto na lista de um grupo, sem embrulho de card: quem monta a lista ao
 *  redor decide isso. */
function exerciseItem(ex, alreadyChosenIds, choose) {
  const chosen = alreadyChosenIds.has(ex.id);
  const li = node(html`
    <li class="list__item">
      <button class="list__link" data-id="${ex.id}" ${raw(chosen ? 'disabled' : '')}>
        ${raw(thumbHtml(ex))}
        <div class="grow">
          <div style="font-weight:600">${ex.name}</div>
          <div class="muted small">${groupLabel(ex.muscleGroup)}</div>
        </div>
        ${chosen ? raw(`<span class="badge">${t('picker.inWorkout')}</span>`) : raw(ICON.plus)}
      </button>
    </li>
  `);
  if (!chosen) li.querySelector('button').onclick = () => choose(ex);
  else li.querySelector('button').style.opacity = '.5';
  return li;
}

/** Criar um exercicio sem sair do fluxo. Segue em sheet: e um formulario de
 *  dois campos, nao merece uma tela. */
function newExerciseForm(suggestedName, choose) {
  const body = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">${t('exercise.form.name')}</span>
        <input class="input" data-name value="${suggestedName}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('exercise.form.muscleGroup')}</span>
        <select class="select" data-group>
          ${raw(MUSCLE_GROUPS.map((g) => `<option value="${g}">${groupLabel(g)}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-save>${t('picker.createAndAdd')}</button>
    </div>
  `);
  openSheet(t('exercise.form.newTitle'), body);

  body.querySelector('[data-save]').onclick = async () => {
    const name = body.querySelector('[data-name]').value.trim();
    if (!name) { toast(t('exercise.form.giveItAName')); return; }

    const created = await db.addExercise({ name, muscleGroup: body.querySelector('[data-group]').value });
    closeSheet();
    await choose(created);
    toast(t('exercise.form.toastCreated'));
  };
}
