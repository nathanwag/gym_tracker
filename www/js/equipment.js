/* Ordem e seccionamento do catalogo por equipamento.
 *
 * Puro e sem import nenhum, para rodar sob `node --test`.
 *
 * POR QUE ISTO EXISTE. O catalogo era ordenado por nome, e ordem alfabetica nao
 * carrega informacao nenhuma: em Peito, os seis primeiros de 79 eram "Arrasto
 * de trenó" e cinco arremessos de bola medicinal — "Supino" ficava na letra S,
 * depois de dezenas de exercicios que ninguem faz. O catalogo nao era grande
 * demais, estava ordenado por nada.
 *
 * Equipamento e o eixo que o dado ja tem e que responde a pergunta certa: o que
 * eu consigo fazer com o que tem na minha academia. E os 199 de equipamento
 * 'outros' (trenó, atlas stone, prancha de equilibrio) afundam sozinhos.
 */

/* Ordem FIXA, nao por tamanho: ordenar por quantidade daria a cada grupo
 * muscular uma ordem diferente, e some o unico jeito de saber onde olhar sem
 * ler tudo — o mesmo motivo que mantem os 17 grupos na ordem anatomica.
 * 'barra W' vem colada em 'barra' porque e a mesma familia de movimento. */
export const EQUIPMENT_ORDER = [
  'barra',
  'barra W',
  'halteres',
  'kettlebell',
  'máquina',
  'polia',
  'peso do corpo',
  'elástico',
  'bola medicinal',
  'bola suíça',
  'rolo de espuma',
  'outros',
];

const FALLBACK = 'outros';

/** Posicao do equipamento na ordem. Valor desconhecido cai logo antes de
 *  'outros': ele e mais especifico que "outros", mas nao merece passar na
 *  frente do que a academia de fato tem. */
function rank(equipment) {
  const i = EQUIPMENT_ORDER.indexOf(equipment);
  return i === -1 ? EQUIPMENT_ORDER.length - 1.5 : i;
}

/** Comparador para ordenar o catalogo: equipamento primeiro, nome depois. */
export function byEquipment(a, b) {
  const d = rank(a?.equipamento) - rank(b?.equipamento);
  return d || String(a?.nome ?? '').localeCompare(String(b?.nome ?? ''), 'pt-BR');
}

/** Divide a lista em secoes por equipamento, na ordem fixa.
 *
 *  Secao com menos de `min` itens nao vira cabecalho: ela se funde na secao
 *  'outros', que fecha a lista. Sem isso Trapezio abriria SETE cabecalhos para
 *  quinze exercicios, e o DESIGN.md e explicito — "grupo de uma linha nao
 *  merece cabecalho". */
export function sectionsByEquipment(items, { min = 3 } = {}) {
  const buckets = new Map();
  for (const item of items ?? []) {
    const key = EQUIPMENT_ORDER.includes(item?.equipamento) ? item.equipamento : FALLBACK;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const sections = [];
  const resto = buckets.get(FALLBACK) ?? [];
  for (const equipment of EQUIPMENT_ORDER) {
    if (equipment === FALLBACK) continue;
    const bucket = buckets.get(equipment);
    if (!bucket) continue;
    if (bucket.length < min) resto.push(...bucket);
    else sections.push({ equipment, items: bucket });
  }

  if (resto.length) sections.push({ equipment: FALLBACK, items: resto });
  return sections;
}
