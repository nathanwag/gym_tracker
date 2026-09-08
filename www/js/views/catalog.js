/* Ficha de um exercicio do catalogo: figura animada, dados e o botao de por na
 * biblioteca.
 *
 * A LISTA do catalogo nao mora mais aqui — ela era uma segunda busca e um
 * segundo acordeao ao lado dos "meus exercicios", e achar um exercicio exigia
 * saber de antemao em qual das duas ele estava. Hoje a busca e uma so, em
 * views/exercise.js, e esta tela e o destino dela.
 */

import * as catalog from '../catalog.js';
import * as db from '../db.js';
import { groupLabel } from '../seed.js';
import {
  createAnimation, prefetchPhotos, fullUrl,
} from '../media.js';
import { t, language } from '../i18n.js';
import {
  ICON, html, node, raw, setTop, toast, refresh, groupField,
} from '../ui.js';

/* ==========================================================================
   Detalhe
   ========================================================================== */

export async function renderDetail(view, slug) {
  const item = await catalog.get(slug);
  if (!item) {
    setTop({ title: t('catalog.title'), back: '#/exercicios' });
    view.append(node(`<div class="card card__pad">${t('catalog.notFound')}</div>`));
    return;
  }

  setTop({ title: catalog.displayName(item), back: '#/exercicios' });

  const mine = await db.listExercises();
  const alreadyHave = mine.find((e) => e.slug === slug) || null;

  const root = node('<div class="stack"></div>');

  // A animacao e o "videozinho": as duas fotos alternando mostram o movimento.
  root.append(createAnimation({
    frameA: fullUrl(slug, 0), frameB: fullUrl(slug, 1), name: catalog.displayName(item),
  }));

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
        ${raw(groupField(item.grupo))}
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
