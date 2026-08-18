/* Catalogo de exercicios: 646 entradas vindas do free-exercise-db (alongamento,
 * cardio, pliometria, elastico e algumas variantes redundantes de equipamento
 * ficam fora — o app registra carga, e essas nao tem carga pra registrar ou
 * repetem um movimento que ja esta no catalogo).
 *
 * Unica camada que le www/data/. Assim como db.js isola o IndexedDB, este
 * modulo isola os dados estaticos — nenhuma view abre um .json direto.
 *
 * Por que fora do banco: o catalogo e imutavel e igual em todo aparelho, entao
 * copia-lo para o IndexedDB so criaria uma segunda fonte da verdade e um
 * caminho de migracao para manter. O banco continua guardando apenas os
 * exercicios que voce escolheu.
 *
 * O cache aqui e imutavel e nunca invalidado, ao contrario do exerciseCache de
 * db.js — o app tem um unico cache mutavel, e nao dois.
 */

import { normalizarNome } from './text.js';

let catalogoPromise = null;
let instrucoesPromise = null;
let porSlug = null;

async function carregarJson(caminho) {
  const resposta = await fetch(caminho);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${caminho}`);
  return resposta.json();
}

/** Lista completa, ordenada por nome. Carrega uma vez e reusa. */
export function carregar() {
  if (!catalogoPromise) {
    catalogoPromise = carregarJson('./data/catalogo.json').then((itens) => {
      for (const item of itens) {
        // Chave de busca pre-computada: filtrar 873 strings a cada tecla custa
        // menos de 1ms, mas normalizar as 873 a cada tecla nao.
        item.chaveBusca = normalizarNome(
          `${item.nome} ${item.nomeEn} ${item.equipamento} ${item.grupo}`,
        );
      }
      itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      porSlug = new Map(itens.map((i) => [i.slug, i]));
      return itens;
    }).catch((erro) => {
      // Sem isso um erro de rede envenenaria a promessa para sempre.
      catalogoPromise = null;
      throw erro;
    });
  }
  return catalogoPromise;
}

export async function buscar(termo, { limite = 80 } = {}) {
  const itens = await carregar();
  const q = normalizarNome(termo || '');
  if (!q) return { itens: itens.slice(0, limite), total: itens.length };

  const achados = itens.filter((i) => i.chaveBusca.includes(q));
  return { itens: achados.slice(0, limite), total: achados.length };
}

export async function get(slug) {
  await carregar();
  return porSlug.get(slug) || null;
}

/** Passo a passo. Fica em arquivo separado porque so o detalhe usa, e junta-lo
 *  ao catalogo faria toda busca pagar 600 KB a mais. */
export async function instrucoes(slug) {
  if (!instrucoesPromise) {
    instrucoesPromise = carregarJson('./data/instrucoes.json').catch((erro) => {
      instrucoesPromise = null;
      throw erro;
    });
  }
  const todos = await instrucoesPromise;
  return todos[slug] || null;
}
