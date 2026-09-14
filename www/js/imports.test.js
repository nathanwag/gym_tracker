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
  // Parametro tambem declara nome. So passou a importar quando o guard
  // aprendeu a ver nome PASSADO como valor: parametro quase nunca e
  // chamado, mas aparece como valor o tempo todo (`Boolean(usesDuration)`).
  const params = [
    ...code.matchAll(/function\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g),
    ...code.matchAll(/\(([^)]*)\)\s*=>/g),
  ];
  for (const [, list] of params) {
    for (const [, name] of list.matchAll(/([A-Za-z_$][\w$]*)/g)) names.add(name);
  }
  // Arrow de um parametro so, sem parenteses: `(g) => ...` acima nao pega.
  for (const [, name] of code.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/gm)) names.add(name);
  return names;
}

/* Onde um nome de outro modulo aparece.
 *
 * CHAMADO — `foo(` — era o unico caso quando este teste nasceu.
 *
 * PASSADO como valor — `f(a, foo)` ou `const x = foo` — passou a existir
 * quando a decisao de metrica do Progresso virou funcao e foi entregue a
 * models.js por parametro. Sem esta segunda regra o guard nao via isso: dava
 * pra apagar o import de `exerciseMetric` e a suite inteira continuava verde,
 * com a tela morrendo em ReferenceError no aparelho.
 *
 * As duas sao deliberadamente estreitas: so acusam o que e certeza. Nome em
 * atalho de objeto (`{ foo }`) fica de fora de proposito — ali um falso
 * positivo e mais provavel que um acerto. */
const CALLED = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
const PASSED = /[(,=]\s*([A-Za-z_$][\w$]*)\s*(?=[,)\];]|$)/gm;

/** Comentario cita funcao como `setTop({back})` o tempo todo; so o codigo conta. */
const stripComments = (code) => code
  .replace(/<!--[^]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"])\/\/.*$/gm, '$1');

for (const file of files) {
  test(`${file.name} importa tudo que chama`, () => {
    const scope = inScope(file.code);
    const missing = new Set();
    const code = stripComments(file.code);
    for (const re of [CALLED, PASSED]) {
      for (const [, name] of code.matchAll(re)) {
        if (exported.has(name) && !scope.has(name)) missing.add(name);
      }
    }
    assert.deepEqual([...missing], [], `usa sem importar: ${[...missing].join(', ')}`);
  });
}
