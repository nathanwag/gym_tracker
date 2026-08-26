/* Catalogo: os 873 exercicios de onde saem os "meus exercicios".
 *
 * A lista completa nunca e renderizada de uma vez — 873 linhas travam o celular.
 * Sem busca, as secoes por grupo vem fechadas; com busca, o corte e em 80.
 */

import * as catalog from '../catalog.js';
import * as db from '../db.js';
import { MUSCLE_GROUPS, groupLabel } from '../seed.js';
import { thumbHtml, createAnimation, prefetchPhotos } from '../media.js';
import { t, language } from '../i18n.js';
import {
  ICON, html, node, raw, setTop, toast, refresh, groupedList, listInCard,
} from '../ui.js';
import { normalizeName as normalize } from '../text.js';

/* ==========================================================================
   Lista
   ========================================================================== */

// Lembra a secao aberta e o texto buscado entre visitas ao catalogo nesta
// sessao — sem isso, voltar de um exercicio sempre reabria a lista do zero
// (grupo fechado, busca vazia). Escopo de modulo, nao da funcao: sobrevive a
// renderList() rodar de novo a cada navegacao pro #/catalogo.
const openGroups = new Set();
let search = '';

export async function renderList(view) {
  setTop({ title: t('catalog.title'), back: '#/exercicios' });

  const root = node(html`
    <div class="stack">
      <input class="input" data-search type="search" placeholder="${t('catalog.searchPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off" value="${search}">
      <div data-list><div class="card card__pad muted">${t('catalog.loading')}</div></div>
    </div>
  `);
  view.append(root);

  const list = root.querySelector('[data-list]');

  let items;
  try {
    items = await catalog.load();
  } catch {
    list.innerHTML = '';
    list.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('catalog.loadError')}</p>
      </div></div>
    `));
    return;
  }

  // Quem ja esta na biblioteca aparece marcado, para nao adicionar duas vezes.
  const mine = new Set((await db.listExercises()).map((e) => e.slug).filter(Boolean));

  const row = (item) => node(html`
    <li class="list__item">
      <a class="list__link" href="#/catalogo/${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div class="catalog__name">
            ${catalog.displayName(item)}
          </div>
          <div class="muted small">${item.equipamento}${item.nivel ? ` · ${item.nivel}` : ''}</div>
        </div>
        ${mine.has(item.slug)
          ? raw(`<span class="catalog__owned" title="${t('catalog.alreadyInLibrary')}"
                       aria-label="${t('catalog.alreadyInLibrary')}">${ICON.check}</span>`)
          : raw(`<span class="list__chev">${ICON.chevron}</span>`)}
      </a>
    </li>
  `);

  const draw = () => {
    list.innerHTML = '';

    if (search.trim()) {
      const q = search.trim();
      const matches = items.filter((i) => i.searchKey.includes(normalize(q)));
      if (!matches.length) {
        list.append(node(html`
          <div class="card"><div class="empty">
            ${raw(ICON.dumbbell)}<p>${t('catalog.noneFound', { q })}</p>
          </div></div>
        `));
        return;
      }
      const shown = matches.slice(0, 80);
      list.append(listInCard(shown.map(row)));
      if (matches.length > shown.length) {
        list.append(node(html`
          <p class="muted small" style="text-align:center">
            ${t('catalog.showingOf', { shown: shown.length, total: matches.length })}
          </p>
        `));
      }
      return;
    }

    // Sem busca: por grupo, colapsavel — abrir 873 linhas de uma vez trava a
    // rolagem no celular.
    list.append(groupedList({
      items, getGroup: (item) => item.grupo, openGroups, renderItem: row,
    }));
  };

  root.querySelector('[data-search]').addEventListener('input', (e) => {
    search = e.target.value;
    draw();
  });

  draw();
}

/* ==========================================================================
   Detalhe
   ========================================================================== */

export async function renderDetail(view, slug) {
  const item = await catalog.get(slug);
  if (!item) {
    setTop({ title: t('catalog.title'), back: '#/catalogo' });
    view.append(node(`<div class="card card__pad">${t('catalog.notFound')}</div>`));
    return;
  }

  setTop({ title: catalog.displayName(item), back: '#/catalogo' });

  const mine = await db.listExercises();
  const alreadyHave = mine.find((e) => e.slug === slug) || null;

  const root = node('<div class="stack"></div>');

  // A animacao e o "videozinho": as duas fotos alternando mostram o movimento.
  root.append(createAnimation(slug, { name: catalog.displayName(item) }));

  root.append(node(html`
    <div class="card card__pad stack--sm">
      <div>
        <h2 class="catalog__title">${catalog.displayName(item)}</h2>
        <!-- O nome em ingles fica sempre visivel quando o idioma e portugues:
             e a fonte original, e uma traducao ruim nunca deve ser a unica
             referencia. Com idioma ingles, displayName() ja mostra o ingles
             em cima, entao a segunda linha mostra o nome em portugues. -->
        <p class="muted small">${language() === 'en' ? item.nome : item.nomeEn}</p>
      </div>
      <div class="chips">
        <span class="chip">${groupLabel(item.grupo)}</span>
        <span class="chip">${item.equipamento}</span>
        ${item.nivel ? raw(`<span class="chip">${item.nivel}</span>`) : ''}
        ${item.categoria ? raw(`<span class="chip">${item.categoria}</span>`) : ''}
      </div>
      ${item.secundarios.length
        ? raw(`<p class="muted small">${t('catalog.alsoWorks', { groups: item.secundarios.map(groupLabel).join(', ') })}</p>`)
        : ''}
    </div>
  `));

  // Acao principal
  if (alreadyHave) {
    root.append(node(html`
      <a class="btn btn--block btn--ghost" href="#/exercicios/${alreadyHave.id}">
        ${raw(ICON.check)} ${t('catalog.alreadyInLibrarySeeProgress')}
      </a>
    `));
  } else {
    const action = node(html`
      <div class="card card__pad stack--sm">
        <label class="field">
          <span class="field__label">${t('catalog.muscleGroup')}</span>
          <select class="select" data-group>
            ${raw(MUSCLE_GROUPS.map((g) => `<option value="${g}"${g === item.grupo ? ' selected' : ''}>${groupLabel(g)}</option>`).join(''))}
          </select>
        </label>
        <button class="btn btn--block" data-add>${raw(ICON.plus)} ${t('catalog.addToMine')}</button>
      </div>
    `);

    action.querySelector('[data-add]').onclick = async () => {
      const muscleGroup = action.querySelector('[data-group]').value;
      const created = await db.addExerciseFromCatalog(item, muscleGroup);
      // Baixa as fotos grandes agora, com a rede que houver: na academia pode
      // nao haver.
      prefetchPhotos(item.slug);
      toast(created.alreadyExisted ? t('catalog.toastAlreadyHad') : t('catalog.toastAdded', { name: catalog.displayName(item) }));
      refresh();
    };
    root.append(action);
  }

  // Passo a passo
  const instructions = await catalog.instructions(slug).catch(() => null);
  const steps = instructions?.[language()];
  if (steps?.length) {
    root.append(node(html`
      <div class="card card__pad">
        <h2 class="section-title" style="margin-top:0">${t('catalog.howTo')}</h2>
        <ol class="steps">${raw(steps.map((p) => html`<li>${p}</li>`).join(''))}</ol>
      </div>
    `));
  }

  view.append(root);
}
