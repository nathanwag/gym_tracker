/* Sheet pra escolher um exercicio: da biblioteca, do catalogo de 873, ou
 * criado na hora — as tres saidas de "preciso de um exercicio que ainda nao
 * tenho" sem sair da tela.
 *
 * So resolve (e, se preciso, cria) o exercicio; quem chama decide o que
 * "escolher" significa via aoEscolher. Hoje so o treino em andamento usa
 * isto, pra entrar num exercicio na sessao. */

import * as db from '../db.js';
import * as catalogo from '../catalog.js';
import { GRUPOS, agruparPorGrupo, grupoLabel } from '../seed.js';
import { thumbHtml } from '../media.js';
import { t } from '../i18n.js';
import {
  html, raw, node, ICON, ICON_GRUPO, toast, openSheet, closeSheet, semAcento,
} from '../ui.js';

// Lembra quais grupos ficaram abertos entre uma abertura e outra da folha
// nesta sessao — mesmo motivo do catalogo (catalog.js): quem esta pegando
// varios exercicios da mesma regiao (ex: dia de perna) nao quer reabrir o
// grupo toda vez.
const abertos = new Set();

/**
 * @param {object[]} exercicios biblioteca do usuario, no momento em que o seletor abre
 * @param {Set<number>} jaEscolhidoIds ids que devem aparecer desabilitados ("no treino")
 * @param {(exercicio: object) => void|Promise<void>} aoEscolher chamado uma vez, com o
 *   exercicio resolvido (escolhido da lista, do catalogo, ou recem-criado)
 */
export function openExercisePicker({ exercicios, jaEscolhidoIds, aoEscolher }) {
  const escolher = async (exercicio) => {
    closeSheet();
    await aoEscolher(exercicio);
  };

  const corpo = node(html`
    <div>
      <input class="input" data-busca type="search" placeholder="${t('picker.buscarPlaceholder')}"
             autocomplete="off" autocapitalize="none" autocorrect="off">
      <div data-resultados style="margin-top:12px"></div>
    </div>
  `);
  openSheet(t('picker.tituloSheet'), corpo);

  const busca = corpo.querySelector('[data-busca]');
  const resultados = corpo.querySelector('[data-resultados]');

  const desenhar = () => {
    const q = semAcento(busca.value.trim());
    resultados.innerHTML = '';

    const filtrados = q
      ? exercicios.filter((e) => semAcento(e.nome).includes(q) || semAcento(e.grupoMuscular).includes(q))
      : exercicios;

    if (!filtrados.length) {
      resultados.append(node(html`<p class="muted small">${t('picker.nenhumEncontrado')}</p>`));
    } else if (q) {
      // Buscando: lista plana — achar exatamente o que foi digitado importa
      // mais que navegar por grupo nesse momento.
      resultados.append(listaSelecao(filtrados, jaEscolhidoIds, escolher));
    } else {
      // Sem busca: por grupo muscular, colapsavel — mesmo padrao do
      // catalogo (catalog.js), pra nao rolar a biblioteca inteira toda vez.
      for (const { grupo, itens: doGrupo } of agruparPorGrupo(filtrados, (e) => e.grupoMuscular)) {
        resultados.append(secaoGrupo(grupo, doGrupo, jaEscolhidoIds, escolher, desenhar));
      }
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
          ${raw(ICON.plus)} ${t('picker.criarNome', { nome: nomeNovo })}
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

  alvo.append(node(`<h3 class="section-title">${t('picker.doCatalogo')}</h3>`));

  const card = node(html`<div class="card"><ul class="list">${raw(novos.map((item) => html`
    <li class="list__item">
      <button class="list__link" data-slug="${item.slug}">
        ${raw(thumbHtml(item))}
        <div class="grow">
          <div style="font-weight:600">${catalogo.nomeExibicao(item)}</div>
          <div class="muted small">${grupoLabel(item.grupo)} · ${item.equipamento}</div>
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

/** Card colapsavel de um grupo muscular, no molde exato do catalogo
 *  (catalog.js) — mesmas classes de CSS, mesmo comportamento de toque. */
function secaoGrupo(grupo, itens, jaEscolhidoIds, escolher, redesenhar) {
  const aberto = abertos.has(grupo);
  const secao = node(html`
    <div class="card cat__grupo">
      <button class="cat__cabecalho" type="button" aria-expanded="${String(aberto)}">
        <span class="cat__icone" aria-hidden="true">${raw(ICON_GRUPO[grupo] || '')}</span>
        <span class="grow" style="font-weight:600">${grupoLabel(grupo)}</span>
        <span class="muted small">${itens.length}</span>
        <span class="list__chev cat__seta">${raw(ICON.chevron)}</span>
      </button>
    </div>
  `);

  secao.querySelector('button').onclick = () => {
    if (aberto) abertos.delete(grupo); else abertos.add(grupo);
    redesenhar();
  };

  // Reaproveita listaSelecao inteira, so pegando o <ul> de dentro do card
  // que ela devolve — pra nao aninhar .card dentro de .card.
  if (aberto) secao.append(listaSelecao(itens, jaEscolhidoIds, escolher).querySelector('ul'));
  return secao;
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
            <div class="muted small">${grupoLabel(ex.grupoMuscular)}</div>
          </div>
          ${dentro ? raw(`<span class="badge">${t('picker.noTreino')}</span>`) : raw(ICON.plus)}
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
        <span class="field__label">${t('exercise.form.nome')}</span>
        <input class="input" data-nome value="${nomeSugerido}" autocapitalize="sentences">
      </label>
      <label class="field">
        <span class="field__label">${t('exercise.form.grupoMuscular')}</span>
        <select class="select" data-grupo>
          ${raw(GRUPOS.map((g) => `<option value="${g}">${grupoLabel(g)}</option>`).join(''))}
        </select>
      </label>
      <button class="btn btn--primary btn--block" data-salvar>${t('picker.criarEAdicionar')}</button>
    </div>
  `);
  openSheet(t('exercise.form.tituloNovo'), corpo);

  corpo.querySelector('[data-salvar]').onclick = async () => {
    const nome = corpo.querySelector('[data-nome]').value.trim();
    if (!nome) { toast(t('exercise.form.deNome')); return; }

    const novo = await db.addExercise({ nome, grupoMuscular: corpo.querySelector('[data-grupo]').value });
    await escolher(novo);
    toast(t('exercise.form.toastCriado'));
  };
}
