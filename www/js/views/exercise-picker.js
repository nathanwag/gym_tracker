/* Sheet pra escolher um exercicio: da biblioteca, do catalogo de 873, ou
 * criado na hora — as tres saidas de "preciso de um exercicio que ainda nao
 * tenho" sem sair da tela.
 *
 * So resolve (e, se preciso, cria) o exercicio; quem chama decide o que
 * "escolher" significa via aoEscolher. Hoje so o treino em andamento usa
 * isto, pra entrar num exercicio na sessao. */

import * as db from '../db.js';
import * as catalogo from '../catalog.js';
import { GRUPOS } from '../seed.js';
import { thumbHtml } from '../media.js';
import {
  html, raw, node, ICON, toast, openSheet, closeSheet, semAcento,
} from '../ui.js';

/**
 * @param {object[]} exercicios biblioteca do usuario, no momento em que o seletor abre
 * @param {object[]} todasSeries todas as series, so para ordenar por uso recente
 * @param {Set<number>} jaEscolhidoIds ids que devem aparecer desabilitados ("no treino")
 * @param {(exercicio: object) => void|Promise<void>} aoEscolher chamado uma vez, com o
 *   exercicio resolvido (escolhido da lista, do catalogo, ou recem-criado)
 */
export function openExercisePicker({ exercicios, todasSeries, jaEscolhidoIds, aoEscolher }) {
  const escolher = async (exercicio) => {
    closeSheet();
    await aoEscolher(exercicio);
  };

  // Mais usados recentemente primeiro: na pratica sao sempre os mesmos 10-15
  // exercicios, e rolar a lista inteira toda vez seria trabalhoso.
  const porId = new Map(exercicios.map((e) => [e.id, e]));
  const usoRecente = new Map();
  for (const s of todasSeries) usoRecente.set(s.exerciseId, Math.max(usoRecente.get(s.exerciseId) || 0, s.id));
  const recentes = [...usoRecente.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => porId.get(id))
    .filter((e) => e && !jaEscolhidoIds.has(e.id))
    .slice(0, 6);

  const corpo = node(html`
    <div>
      <input class="input" data-busca type="search" placeholder="Buscar exercício"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-resultados style="margin-top:12px"></div>
    </div>
  `);
  openSheet('Adicionar exercício', corpo);

  const busca = corpo.querySelector('[data-busca]');
  const resultados = corpo.querySelector('[data-resultados]');

  const desenhar = () => {
    const q = semAcento(busca.value.trim());
    resultados.innerHTML = '';

    if (!q && recentes.length) {
      resultados.append(node('<h3 class="section-title" style="margin-top:0">Recentes</h3>'));
      resultados.append(listaSelecao(recentes, jaEscolhidoIds, escolher));
      resultados.append(node('<h3 class="section-title">Todos os exercícios</h3>'));
    }

    const filtrados = q
      ? exercicios.filter((e) => semAcento(e.nome).includes(q) || semAcento(e.grupoMuscular).includes(q))
      : exercicios;

    if (!filtrados.length) {
      resultados.append(node(html`<p class="muted small">Nenhum exercício encontrado.</p>`));
    } else {
      resultados.append(listaSelecao(filtrados, jaEscolhidoIds, escolher));
    }

    const nomeNovo = busca.value.trim();
    if (nomeNovo && !exercicios.some((e) => semAcento(e.nome) === q)) {
      // Do catalogo: e aqui que o app deixa de ter uma lista fixa. Quem esta em
      // pe no meio do treino precisa de um exercicio que nao tem — antes a
      // unica saida era digitar tudo a mao.
      const doCatalogo = node('<div data-catalogo></div>');
      resultados.append(doCatalogo);
      mostrarCatalogo(doCatalogo, nomeNovo, exercicios, escolher);

      const btn = node(html`
        <button class="btn btn--block" style="margin-top:12px" data-criar>
          ${raw(ICON.plus)} Criar &laquo;${nomeNovo}&raquo;
        </button>
      `);
      btn.onclick = () => formularioNovoExercicio(nomeNovo, escolher);
      resultados.append(btn);
    }
  };

  busca.addEventListener('input', desenhar);
  desenhar();
}

/** Sugestoes do catalogo dentro do seletor.
 *
 *  O catalogo so e carregado quando o usuario ja digitou algo, para o sheet
 *  abrir instantaneo. O arquivo esta em cache do service worker, entao mesmo
 *  offline isto e leitura local. */
async function mostrarCatalogo(alvo, termo, exercicios, escolher) {
  let itens;
  try {
    ({ itens } = await catalogo.buscar(termo, { limite: 6 }));
  } catch {
    return; // sem catalogo o seletor segue funcionando como antes
  }

  // Ja na biblioteca? Entao ja apareceu na lista de cima.
  const meus = new Set(exercicios.map((e) => e.slug).filter(Boolean));
  const novos = itens.filter((i) => !meus.has(i.slug));
  if (!novos.length || !alvo.isConnected) return;

  alvo.append(node('<h3 class="section-title">Do catálogo</h3>'));

  const card = node(html`<div class="card"><ul class="list">${raw(novos.map((item) => html`
    <li class="list__item">
      <button class="list__link" data-slug="${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div style="font-weight:600">${item.nome}</div>
          <div class="muted small">${item.grupo} · ${item.equipamento}</div>
        </div>
        ${raw(ICON.plus)}
      </button>
    </li>
  `).join(''))}</ul></div>`);

  for (const botao of card.querySelectorAll('[data-slug]')) {
    botao.onclick = async () => {
      const item = novos.find((i) => i.slug === botao.dataset.slug);
      // Um toque faz tudo: entra na biblioteca, entra no treino e ja busca as
      // fotos com a rede que houver agora.
      const criado = await db.addExercicioDoCatalogo(item);
      await escolher(criado);
    };
  }
  alvo.append(card);
}

function listaSelecao(exercicios, jaEscolhidoIds, escolher) {
  const card = node('<div class="card"><ul class="list"></ul></div>');
  const ul = card.querySelector('ul');

  for (const ex of exercicios) {
    const dentro = jaEscolhidoIds.has(ex.id);
    const li = node(html`
      <li class="list__item">
        <button class="list__link" data-id="${ex.id}" ${raw(dentro ? 'disabled' : '')}>
          ${raw(thumbHtml(ex))}
          <div class="grow">
            <div style="font-weight:600">${ex.nome}</div>
            <div class="muted small">${ex.grupoMuscular}</div>
          </div>
          ${dentro ? raw('<span class="badge">no treino</span>') : raw(ICON.plus)}
        </button>
      </li>
    `);
    if (!dentro) li.querySelector('button').onclick = () => escolher(ex);
    else li.querySelector('button').style.opacity = '.5';
    ul.append(li);
  }
  return card;
}

function formularioNovoExercicio(nomeSugerido, escolher) {
  const corpo = node(html`
    <div class="stack">
      <label class="field">
        <span class="field__label">Nome</span>
        <input class="input" data-nome value="${nomeSugerido}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">Grupo muscular</span>
        <select class="select" data-grupo>
          ${raw(GRUPOS.map((g) => `<option value="${g}">${g}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-salvar>Criar e adicionar ao treino</button>
    </div>
  `);
  openSheet('Novo exercício', corpo);

  corpo.querySelector('[data-salvar]').onclick = async () => {
    const nome = corpo.querySelector('[data-nome]').value.trim();
    if (!nome) { toast('Dê um nome ao exercício.'); return; }

    const novo = await db.addExercise({ nome, grupoMuscular: corpo.querySelector('[data-grupo]').value });
    await escolher(novo);
    toast('Exercício criado.');
  };
}
