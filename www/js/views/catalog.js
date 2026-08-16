/* Catalogo: os 873 exercicios de onde saem os "meus exercicios".
 *
 * A lista completa nunca e renderizada de uma vez — 873 linhas travam o celular.
 * Sem busca, as secoes por grupo vem fechadas; com busca, o corte e em 80.
 */

import * as catalogo from '../catalog.js';
import * as db from '../db.js';
import { GRUPOS } from '../seed.js';
import { prefetchFotos, thumbHtml, criarAnimacao } from '../media.js';
import {
  ICON, ICON_GRUPO, html, node, raw, setTop, toast, refresh,
} from '../ui.js';
import { normalizarNome as normalizar } from '../text.js';

/* ==========================================================================
   Lista
   ========================================================================== */

export async function renderList(view) {
  setTop({ title: 'Catálogo', back: '#/exercicios' });

  const root = node(html`
    <div class="stack">
      <input class="input" data-busca type="search" placeholder="Buscar entre 675 exercícios"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-lista><div class="card card__pad muted">Carregando…</div></div>
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
        <p>Não consegui carregar o catálogo. Verifique a conexão e recarregue.</p>
      </div></div>
    `));
    return;
  }

  // Quem ja esta na biblioteca aparece marcado, para nao adicionar duas vezes.
  const meus = new Set((await db.listExercises()).map((e) => e.slug).filter(Boolean));
  const abertos = new Set();
  let busca = '';

  const linha = (item) => html`
    <li class="list__item">
      <a class="list__link" href="#/catalogo/${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div class="cat__nome">
            ${item.nome}
            ${item.traduzido ? '' : raw('<span class="badge badge--en" title="ainda sem tradução">EN</span>')}
          </div>
          <div class="muted small">${item.equipamento}${item.nivel ? ` · ${item.nivel}` : ''}</div>
        </div>
        ${meus.has(item.slug)
          ? raw(`<span class="cat__tem" title="Já está na sua biblioteca"
                       aria-label="Já está na sua biblioteca">${ICON.check}</span>`)
          : raw(`<span class="list__chev">${ICON.chevron}</span>`)}
      </a>
    </li>
  `;

  const desenhar = () => {
    lista.innerHTML = '';

    if (busca.trim()) {
      const q = busca.trim();
      const achados = itens.filter((i) => i.chaveBusca.includes(normalizar(q)));
      if (!achados.length) {
        lista.append(node(html`
          <div class="card"><div class="empty">
            ${raw(ICON.dumbbell)}<p>Nenhum exercício encontrado para «${q}».</p>
          </div></div>
        `));
        return;
      }
      const corte = achados.slice(0, 80);
      lista.append(node(html`
        <div class="card"><ul class="list">${raw(corte.map(linha).join(''))}</ul></div>
      `));
      if (achados.length > corte.length) {
        lista.append(node(html`
          <p class="muted small" style="text-align:center">
            mostrando ${corte.length} de ${achados.length} — refine a busca
          </p>
        `));
      }
      return;
    }

    // Sem busca: secoes fechadas, so com a contagem. Abrir 873 linhas de uma
    // vez trava a rolagem no celular.
    const porGrupo = new Map();
    for (const item of itens) {
      if (!porGrupo.has(item.grupo)) porGrupo.set(item.grupo, []);
      porGrupo.get(item.grupo).push(item);
    }

    for (const grupo of GRUPOS) {
      const doGrupo = porGrupo.get(grupo);
      if (!doGrupo?.length) continue;

      const aberto = abertos.has(grupo);
      const secao = node(html`
        <div class="card cat__grupo">
          <button class="cat__cabecalho" type="button" aria-expanded="${String(aberto)}">
            <span class="cat__icone" aria-hidden="true">${raw(ICON_GRUPO[grupo] || '')}</span>
            <span class="grow" style="font-weight:600">${grupo}</span>
            <span class="muted small">${doGrupo.length}</span>
            <span class="list__chev cat__seta">${raw(ICON.chevron)}</span>
          </button>
        </div>
      `);

      secao.querySelector('button').onclick = () => {
        if (abertos.has(grupo)) abertos.delete(grupo);
        else abertos.add(grupo);
        desenhar();
      };

      if (aberto) {
        secao.append(node(html`<ul class="list">${raw(doGrupo.map(linha).join(''))}</ul>`));
      }
      lista.append(secao);
    }
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
    setTop({ title: 'Catálogo', back: '#/catalogo' });
    view.append(node('<div class="card card__pad">Exercício não encontrado no catálogo.</div>'));
    return;
  }

  setTop({ title: item.nome, back: '#/catalogo' });

  const meus = await db.listExercises();
  const jaTenho = meus.find((e) => e.slug === slug) || null;

  const root = node('<div class="stack"></div>');

  // A animacao e o "videozinho": as duas fotos alternando mostram o movimento.
  root.append(criarAnimacao(slug, { nome: item.nome }));

  root.append(node(html`
    <div class="card card__pad stack--sm">
      <div>
        <h2 class="cat__titulo">${item.nome}</h2>
        <!-- O nome em ingles fica sempre visivel: e a fonte original, e uma
             traducao ruim nunca deve ser a unica referencia. -->
        <p class="muted small">${item.nomeEn}</p>
      </div>
      <div class="chips">
        <span class="chip">${item.grupo}</span>
        <span class="chip">${item.equipamento}</span>
        ${item.nivel ? raw(`<span class="chip">${item.nivel}</span>`) : ''}
        ${item.categoria ? raw(`<span class="chip">${item.categoria}</span>`) : ''}
      </div>
      ${item.secundarios.length
        ? raw(`<p class="muted small">Também trabalha: ${item.secundarios.join(', ')}</p>`)
        : ''}
    </div>
  `));

  // Acao principal
  if (jaTenho) {
    root.append(node(html`
      <a class="btn btn--block btn--ghost" href="#/exercicios/${jaTenho.id}">
        ${raw(ICON.check)} Já está na sua biblioteca — ver evolução
      </a>
    `));
  } else {
    const acao = node(html`
      <div class="card card__pad stack--sm">
        <label class="field">
          <span class="field__label">Grupo muscular</span>
          <select class="select" data-grupo>
            ${raw(GRUPOS.map((g) => `<option value="${g}"${g === item.grupo ? ' selected' : ''}>${g}</option>`).join(''))}
          </select>
        </label>
        <button class="btn btn--block" data-adicionar>${raw(ICON.plus)} Adicionar aos meus exercícios</button>
      </div>
    `);

    acao.querySelector('[data-adicionar]').onclick = async () => {
      const grupoMuscular = acao.querySelector('[data-grupo]').value;
      const criado = await db.addExercise({
        nome: item.nome,
        grupoMuscular,
        slug: item.slug,
        personalizado: false,
      });
      // Baixa as fotos grandes agora, com a rede que houver: na academia pode
      // nao haver.
      prefetchFotos(item.slug);
      toast(criado.jaExistia ? 'Já estava na sua biblioteca.' : `${item.nome} adicionado.`);
      refresh();
    };
    root.append(acao);
  }

  // Passo a passo
  const comofazer = await catalogo.comoFazer(slug).catch(() => null);
  if (comofazer?.passos?.length) {
    root.append(node(html`
      <div class="card card__pad">
        <h2 class="section-title" style="margin-top:0">
          Como fazer
          ${comofazer.idioma === 'en'
            ? raw('<span class="badge badge--en" title="ainda sem tradução">EN</span>')
            : ''}
        </h2>
        <ol class="passos">${raw(comofazer.passos.map((p) => html`<li>${p}</li>`).join(''))}</ol>
      </div>
    `));
  }

  view.append(root);
}
