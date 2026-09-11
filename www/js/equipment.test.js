import test from 'node:test';
import assert from 'node:assert/strict';

import { EQUIPMENT_ORDER, byEquipment, sectionsByEquipment } from './equipment.js';

const ex = (equipamento, nome) => ({ equipamento, nome });

/* A ordem e FIXA, nao por tamanho da secao. Ordenar por quantidade faria cada
 * grupo muscular ter uma ordem diferente, e a pessoa perderia o unico jeito de
 * saber onde olhar sem ler — o mesmo motivo que mantem os 17 grupos na ordem
 * anatomica em vez de por uso. */
test('a ordem de equipamento e fixa e comeca na barra', () => {
  assert.equal(EQUIPMENT_ORDER[0], 'barra');
  assert.ok(EQUIPMENT_ORDER.indexOf('halteres') < EQUIPMENT_ORDER.indexOf('polia'));
  assert.equal(EQUIPMENT_ORDER.at(-1), 'outros');
});

test('byEquipment poe barra antes de halteres, e outros por ultimo', () => {
  const lista = [ex('outros', 'C'), ex('halteres', 'B'), ex('barra', 'A')];
  assert.deepEqual(lista.sort(byEquipment).map((x) => x.nome), ['A', 'B', 'C']);
});

test('byEquipment desempata pelo nome dentro do mesmo equipamento', () => {
  const lista = [ex('barra', 'Supino'), ex('barra', 'Agachamento')];
  assert.deepEqual(lista.sort(byEquipment).map((x) => x.nome), ['Agachamento', 'Supino']);
});

/* O catalogo tem 199 exercicios com equipamento 'outros' — trenó, atlas stone,
 * prancha de equilibrio. Eles nao podem abrir a lista de nenhum grupo. */
test('sectionsByEquipment devolve as secoes na ordem fixa', () => {
  const secs = sectionsByEquipment([
    ex('polia', 'a'), ex('polia', 'b'), ex('polia', 'c'),
    ex('barra', 'd'), ex('barra', 'e'), ex('barra', 'f'),
  ]);
  assert.deepEqual(secs.map((s) => s.equipment), ['barra', 'polia']);
});

/* A regra do DESIGN.md: "grupo de uma linha nao merece cabecalho". Sem isto,
 * Trapezio abriria 7 cabecalhos para 15 exercicios, e Peito teria uma secao
 * "Barra W" com um item so. */
test('secao menor que o minimo se funde em outros, no fim', () => {
  const secs = sectionsByEquipment([
    ex('barra', 'a'), ex('barra', 'b'), ex('barra', 'c'),
    ex('barra W', 'solitario'),
    ex('bola suíça', 'outro solitario'),
  ], { min: 3 });
  assert.deepEqual(secs.map((s) => s.equipment), ['barra', 'outros']);
  assert.deepEqual(secs[1].items.map((x) => x.nome), ['solitario', 'outro solitario']);
});

test('equipamento desconhecido nao some: cai em outros', () => {
  const secs = sectionsByEquipment([
    ex('barra', 'a'), ex('barra', 'b'), ex('barra', 'c'),
    ex('trenó a jato', 'exotico'),
  ], { min: 3 });
  assert.ok(secs.some((s) => s.items.some((x) => x.nome === 'exotico')));
});

/* A invariante que importa: seccionar e uma reorganizacao, nunca um filtro.
 * Se um exercicio sumir entre a lista e as secoes, ele fica inalcancavel na
 * tela e ninguem percebe. */
test('nenhum exercicio se perde nem se duplica ao seccionar', () => {
  const lista = [
    ...Array.from({ length: 9 }, (_, i) => ex('barra', `b${i}`)),
    ...Array.from({ length: 2 }, (_, i) => ex('barra W', `w${i}`)),
    ...Array.from({ length: 5 }, (_, i) => ex('polia', `p${i}`)),
    ex('outros', 'o0'), ex('bola suíça', 's0'),
  ];
  const secs = sectionsByEquipment(lista, { min: 3 });
  const saida = secs.flatMap((s) => s.items);
  assert.equal(saida.length, lista.length);
  assert.deepEqual(new Set(saida.map((x) => x.nome)).size, lista.length);
});

test('lista vazia devolve nenhuma secao', () => {
  assert.deepEqual(sectionsByEquipment([]), []);
});

/* Quando tudo cabe numa secao so, o cabecalho nao informa nada — a tela
 * renderiza a lista achatada, e quem decide isso e o chamador olhando o
 * tamanho. Aqui so garantimos que ela sabe distinguir o caso. */
test('um equipamento so devolve uma secao so', () => {
  const secs = sectionsByEquipment([ex('barra', 'a'), ex('barra', 'b')], { min: 1 });
  assert.equal(secs.length, 1);
});
