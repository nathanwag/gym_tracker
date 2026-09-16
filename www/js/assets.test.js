/* Todo modulo de www/js/ tem que estar no ASSETS do sw.js.
 *
 * O cache do app e uma lista explicita, um cache.add por item: modulo que fica
 * de fora simplesmente nao existe offline, e o app quebra na rota que o importa
 * — sem erro em dev, sem teste vermelho, so no aparelho de quem ja instalou. Foi
 * o que quase aconteceu ao acrescentar quatro arquivos de uma vez.
 *
 * Le o texto-fonte em vez de importar o sw.js: ele e service worker classico,
 * usa `self` e nao carrega sob node --test. Mesmo caminho do imports.test.js. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.dirname(JS_DIR);

function modulesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return modulesIn(full);
    if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) return [];
    return [`./${path.relative(WWW, full).split(path.sep).join('/')}`];
  });
}

/** So o miolo do `const ASSETS = [...]`. Varrer o arquivo inteiro fazia um
 *  caminho citado em COMENTARIO valer como precache: o teste ficava verde com o
 *  modulo fora da lista, que e exatamente o que ele existe pra pegar. */
function assetsArray(sw) {
  const start = sw.indexOf('const ASSETS = [');
  assert.notEqual(start, -1, 'nao achei o `const ASSETS = [` no sw.js');
  const end = sw.indexOf('];', start);
  assert.notEqual(end, -1, 'o array ASSETS nao fecha');
  return sw.slice(start, end);
}

test('todo modulo de www/js/ esta no precache do sw.js', () => {
  const sw = fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8');
  const assets = new Set([...assetsArray(sw).matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]));
  const faltando = modulesIn(JS_DIR).filter((m) => !assets.has(m));
  assert.deepEqual(faltando, [], `fora do ASSETS do sw.js: ${faltando.join(', ')}`);
});
