/* Sheet pra escolher um exercicio: da biblioteca, do catalogo de 873, ou
 * criado na hora — as tres saidas de "preciso de um exercicio que ainda nao
 * tenho" sem sair da tela.
 *
 * So resolve (e, se preciso, cria) o exercicio; quem chama decide o que
 * "escolher" significa via aoEscolher. Hoje so o treino em andamento usa
 * isto, pra entrar num exercicio na sessao. */

import * as db from '../db.js';
import * as catalogo from '../catalog.js';
import { GRUPOS, grupoLabel } from '../seed.js';
import { thumbHtml, prefetchFotos } from '../media.js';
import { t } from '../i18n.js';
import {
  html, raw, node, ICON, toast, openSheet, closeSheet, semAcento, listaAgrupada, listaEmCard,
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
      resultados.append(listaEmCard(filtrados.map((ex) => itemExercicio(ex, jaEscolhidoIds, escolher))));
    } else {
      // Sem busca: por grupo muscular, colapsavel — mesmo padrao do
      // catalogo (catalog.js), pra nao rolar a biblioteca inteira toda vez.
      resultados.append(listaAgrupada({
        itens: filtrados,
        pegarGrupo: (e) => e.grupoMuscular,
        abertos,
        renderItem: (ex) => itemExercicio(ex, jaEscolhidoIds, escolher),
      }));
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

  const itemCatalogo = (item) => {
    const li = node(html`
      <li class="list__item">
        <button class="list__link">
          ${raw(thumbHtml(item))}
          <div class="grow">
            <div style="font-weight:600">${catalogo.nomeExibicao(item)}</div>
            <div class="muted small">${grupoLabel(item.grupo)} · ${item.equipamento}</div>
          </div>
          ${raw(ICON.plus)}
        </button>
      </li>
    `);
    li.querySelector('button').onclick = async () => {
      // Um toque faz tudo: entra na biblioteca, entra no treino e ja busca as
      // fotos com a rede que houver agora.
      const criado = await db.addExercicioDoCatalogo(item);
      prefetchFotos(item.slug);
      await escolher(criado);
    };
    return li;
  };

  alvo.append(listaEmCard(novos.map(itemCatalogo)));
}

/** Uma linha de exercicio no seletor — usada tanto na lista plana (buscando)
 *  quanto como renderItem de listaAgrupada (sem busca), sem embrulho de
 *  card: quem monta a lista ao redor decide isso. */
function itemExercicio(ex, jaEscolhidoIds, escolher) {
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
  return li;
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
