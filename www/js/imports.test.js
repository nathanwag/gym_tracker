/* Guarda contra o unico erro que nenhum outro teste pega: um modulo usar um
 * helper de outro modulo sem importar. Em ES module isso e um ReferenceError
 * na hora em que a funcao roda — o pedaco da tela some sem barulho, e so
 * aparece no aparelho. Como as views importam DOM/IndexedDB e nao carregam
 * sob `node --test`, a verificacao e sobre o texto do fonte. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) return [];
    const name = full.slice(root.length + 1).split(sep).join('/');
    return [{ name, code: readFileSync(full, 'utf8') }];
  });
}

const files = sources(root);

/** Nomes exportados por qualquer modulo do app — o vocabulario compartilhado. */
const exported = new Set();
for (const file of files) {
  for (const [, name] of file.code.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exported.add(name);
  }
}

/** Nomes que o arquivo importa ou declara em qualquer lugar — deliberadamente
 *  generoso (declaracao aninhada tambem conta) pra so acusar o que e certeza. */
function inScope(code) {
  const names = new Set();
  for (const [, clause] of code.matchAll(/import\s+([^;]+?)\s+from\s+['"]/g)) {
    for (const [, name] of clause.matchAll(/([A-Za-z_$][\w$]*)(?=\s*(?:,|\}|$))/g)) names.add(name);
  }
  for (const [, name] of code.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(name);
  for (const [, decl] of code.matchAll(/(?:const|let|var)\s+([^=;\n]+)/g)) {
    for (const [, name] of decl.matchAll(/([A-Za-z_$][\w$]*)/g)) names.add(name);
  }
  return names;
}

/** Comentario cita funcao como `setTop({back})` o tempo todo; so o codigo conta. */
const stripComments = (code) => code
  .replace(/<!--[^]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"])\/\/.*$/gm, '$1');

for (const file of files) {
  test(`${file.name} importa tudo que chama`, () => {
    const scope = inScope(file.code);
    const missing = new Set();
    for (const [, name] of stripComments(file.code).matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (exported.has(name) && !scope.has(name)) missing.add(name);
    }
    assert.deepEqual([...missing], [], `usa sem importar: ${[...missing].join(', ')}`);
  });
}
