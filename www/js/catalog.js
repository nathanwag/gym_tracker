/* Catalogo de exercicios: 873 entradas vindas do free-exercise-db.
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

import { normalizeName } from './text.js';
import { language } from './i18n.js';

/** Nome de exibicao de um item do catalogo, no idioma ativo. So pra itens do
 *  catalogo (que tem os dois campos) — nao se aplica ao nome de um exercicio
 *  pessoal (db.js), que so tem `name` e fica como o usuario digitou. */
export function displayName(item) {
  return language() === 'en' ? item.nomeEn : item.nome;
}

let catalogPromise = null;
let instructionsPromise = null;
let bySlug = null;

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Falha ao carregar ${path}`);
  return response.json();
}

/** Lista completa, ordenada por nome. Carrega uma vez e reusa. */
export function load() {
  if (!catalogPromise) {
    catalogPromise = loadJson('./data/catalogo.json').then((items) => {
      for (const item of items) {
        // Chave de busca pre-computada: filtrar 873 strings a cada tecla custa
        // menos de 1ms, mas normalizar as 873 a cada tecla nao.
        item.searchKey = normalizeName(
          `${item.nome} ${item.nomeEn} ${item.equipamento} ${item.grupo}`,
        );
      }
      items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      bySlug = new Map(items.map((i) => [i.slug, i]));
      return items;
    }).catch((error) => {
      // Sem isso um erro de rede envenenaria a promessa para sempre.
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

export async function search(term, { limit = 80 } = {}) {
  const items = await load();
  const q = normalizeName(term || '');
  if (!q) return { items: items.slice(0, limit), total: items.length };

  const matches = items.filter((i) => i.searchKey.includes(q));
  return { items: matches.slice(0, limit), total: matches.length };
}

export async function get(slug) {
  await load();
  return bySlug.get(slug) || null;
}

/** Passo a passo. Fica em arquivo separado porque so o detalhe usa, e junta-lo
 *  ao catalogo faria toda busca pagar 600 KB a mais. */
export async function instructions(slug) {
  if (!instructionsPromise) {
    instructionsPromise = loadJson('./data/instrucoes.json').catch((error) => {
      instructionsPromise = null;
      throw error;
    });
  }
  const all = await instructionsPromise;
  return all[slug] || null;
}
