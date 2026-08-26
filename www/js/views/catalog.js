/* Catalogo: os 873 exercicios de onde saem os "meus exercicios".
 *
 * A lista completa nunca e renderizada de uma vez — 873 linhas travam o celular.
 * Sem busca, as secoes por grupo vem fechadas; com busca, o corte e em 80.
 */

import * as catalogo from '../catalog.js';
import * as db from '../db.js';
import { GRUPOS, grupoLabel } from '../seed.js';
import { thumbHtml, criarAnimacao, prefetchFotos } from '../media.js';
import { t, idioma } from '../i18n.js';
import {
  ICON, html, node, raw, setTop, toast, refresh, listaAgrupada, listaEmCard,
} from '../ui.js';
import { normalizarNome as normalizar } from '../text.js';

/* ==========================================================================
   Lista
   ========================================================================== */

// Lembra a secao aberta e o texto buscado entre visitas ao catalogo nesta
// sessao — sem isso, voltar de um exercicio sempre reabria a lista do zero
// (grupo fechado, busca vazia). Escopo de modulo, nao da funcao: sobrevive a
// renderList() rodar de novo a cada navegacao pro #/catalogo.
const abertos = new Set();
let busca = '';

export async function renderList(view) {
  setTop({ title: t('catalog.titulo'), back: '#/exercicios' });

  const root = node(html`
    <div class="stack">
      <input class="input" data-busca type="search" placeholder="${t('catalog.buscarPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off" value="${busca}">
      <div data-lista><div class="card card__pad muted">${t('catalog.carregando')}</div></div>
    </div>
  `);
  view.append(root);

  const lista = root.querySelector('[data-lista]');

  let itens;
  try {
    itens = await catalogo.carregar();
  } catch {
    lista.innerHTML = '';
    lista.append(node(html`
      <div class="card"><div class="empty">
        ${raw(ICON.dumbbell)}
        <p>${t('catalog.erroCarregar')}</p>
      </div></div>
    `));
    return;
  }

  // Quem ja esta na biblioteca aparece marcado, para nao adicionar duas vezes.
  const meus = new Set((await db.listExercises()).map((e) => e.slug).filter(Boolean));

  const linha = (item) => node(html`
    <li class="list__item">
      <a class="list__link" href="#/catalogo/${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div class="cat__nome">
            ${catalogo.nomeExibicao(item)}
          </div>
          <div class="muted small">${item.equipamento}${item.nivel ? ` · ${item.nivel}` : ''}</div>
        </div>
        ${meus.has(item.slug)
          ? raw(`<span class="cat__tem" title="${t('catalog.jaNaBiblioteca')}"
                       aria-label="${t('catalog.jaNaBiblioteca')}">${ICON.check}</span>`)
          : raw(`<span class="list__chev">${ICON.chevron}</span>`)}
      </a>
    </li>
  `);

  const desenhar = () => {
    lista.innerHTML = '';

    if (busca.trim()) {
      const q = busca.trim();
      const achados = itens.filter((i) => i.chaveBusca.includes(normalizar(q)));
      if (!achados.length) {
        lista.append(node(html`
          <div class="card"><div class="empty">
            ${raw(ICON.dumbbell)}<p>${t('catalog.nenhumEncontrado', { q })}</p>
          </div></div>
        `));
        return;
      }
      const corte = achados.slice(0, 80);
      lista.append(listaEmCard(corte.map(linha)));
      if (achados.length > corte.length) {
        lista.append(node(html`
          <p class="muted small" style="text-align:center">
            ${t('catalog.mostrandoDe', { mostrados: corte.length, total: achados.length })}
          </p>
        `));
      }
      return;
    }

    // Sem busca: por grupo, colapsavel — abrir 873 linhas de uma vez trava a
    // rolagem no celular.
    lista.append(listaAgrupada({
      itens, pegarGrupo: (item) => item.grupo, abertos, renderItem: linha,
    }));
  };

  root.querySelector('[data-busca]').addEventListener('input', (e) => {
    busca = e.target.value;
    desenhar();
  });

  desenhar();
}

/* ==========================================================================
   Detalhe
   ========================================================================== */

export async function renderDetail(view, slug) {
  const item = await catalogo.get(slug);
  if (!item) {
    setTop({ title: t('catalog.titulo'), back: '#/catalogo' });
    view.append(node(`<div class="card card__pad">${t('catalog.naoEncontrado')}</div>`));
    return;
  }

  setTop({ title: catalogo.nomeExibicao(item), back: '#/catalogo' });

  const meus = await db.listExercises();
  const jaTenho = meus.find((e) => e.slug === slug) || null;

  const root = node('<div class="stack"></div>');

  // A animacao e o "videozinho": as duas fotos alternando mostram o movimento.
  root.append(criarAnimacao(slug, { nome: catalogo.nomeExibicao(item) }));

  root.append(node(html`
    <div class="card card__pad stack--sm">
      <div>
        <h2 class="cat__titulo">${catalogo.nomeExibicao(item)}</h2>
        <!-- O nome em ingles fica sempre visivel quando o idioma e portugues:
             e a fonte original, e uma traducao ruim nunca deve ser a unica
             referencia. Com idioma ingles, nomeExibicao() ja mostra o ingles
             em cima, entao a segunda linha mostra o nome em portugues. -->
        <p class="muted small">${idioma() === 'en' ? item.nome : item.nomeEn}</p>
      </div>
      <div class="chips">
        <span class="chip">${grupoLabel(item.grupo)}</span>
        <span class="chip">${item.equipamento}</span>
        ${item.nivel ? raw(`<span class="chip">${item.nivel}</span>`) : ''}
        ${item.categoria ? raw(`<span class="chip">${item.categoria}</span>`) : ''}
      </div>
      ${item.secundarios.length
        ? raw(`<p class="muted small">${t('catalog.tambemTrabalha', { grupos: item.secundarios.map(grupoLabel).join(', ') })}</p>`)
        : ''}
    </div>
  `));

  // Acao principal
  if (jaTenho) {
    root.append(node(html`
      <a class="btn btn--block btn--ghost" href="#/exercicios/${jaTenho.id}">
        ${raw(ICON.check)} ${t('catalog.jaNaBibliotecaVerEvolucao')}
      </a>
    `));
  } else {
    const acao = node(html`
      <div class="card card__pad stack--sm">
        <label class="field">
          <span class="field__label">${t('catalog.grupoMuscular')}</span>
          <select class="select" data-grupo>
            ${raw(GRUPOS.map((g) => `<option value="${g}"${g === item.grupo ? ' selected' : ''}>${grupoLabel(g)}</option>`).join(''))}
          </select>
        </label>
        <button class="btn btn--block" data-adicionar>${raw(ICON.plus)} ${t('catalog.adicionarAosMeus')}</button>
      </div>
    `);

    acao.querySelector('[data-adicionar]').onclick = async () => {
      const grupoMuscular = acao.querySelector('[data-grupo]').value;
      const criado = await db.addExercicioDoCatalogo(item, grupoMuscular);
      // Baixa as fotos grandes agora, com a rede que houver: na academia pode
      // nao haver.
      prefetchFotos(item.slug);
      toast(criado.jaExistia ? t('catalog.toastJaEstava') : t('catalog.toastAdicionado', { nome: catalogo.nomeExibicao(item) }));
      refresh();
    };
    root.append(acao);
  }

  // Passo a passo
  const instrucoes = await catalogo.instrucoes(slug).catch(() => null);
  const passos = instrucoes?.[idioma()];
  if (passos?.length) {
    root.append(node(html`
      <div class="card card__pad">
        <h2 class="section-title" style="margin-top:0">${t('catalog.comoFazer')}</h2>
        <ol class="passos">${raw(passos.map((p) => html`<li>${p}</li>`).join(''))}</ol>
      </div>
    `));
  }

  view.append(root);
}
