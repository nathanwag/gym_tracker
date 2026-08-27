/* SEED_EXERCISES nao popula mais a biblioteca sozinho — ela comeca vazia, e o
 * usuario adiciona do catalogo de 873 (#/catalogo) ou a mao (botao "Novo").
 * O que sobra de uso real aqui e slugByName(): da figura a exercicios de quem
 * ja usava o app antes do `slug` existir, casando pelo nome.
 *
 * O `slug` liga o exercicio a suas figuras em www/img/ex/ e a entrada do
 * catalogo em www/data/catalogo.json. Precisa ser estavel: o `id` do banco e
 * autoincremento e muda de aparelho para aparelho, e o `nome` tem acento e pode
 * ser editado pelo usuario. `slug: null` e valido — o exercicio so aparece com
 * o icone do grupo no lugar da foto.
 *
 * Os slugs vem do free-exercise-db (dominio publico) e foram conferidos um a
 * um.
 */

import { normalizeName } from './text.js';
import { language } from './i18n.js';

export const MUSCLE_GROUPS = [
  'Peito',
  'Costas',
  'Lombar',
  'Ombros',
  'Trapézio',
  'Pescoço',
  'Bíceps',
  'Tríceps',
  'Quadríceps',
  'Posterior',
  'Glúteos',
  'Panturrilha',
  'Abdômen',
  'Antebraço',
  'Cardio',
  'Alongamento',
  'Outros',
];

// Cardio e alongamento nao usam peso/repeticoes: a serie e registrada como
// duracao (ver session.js/models.js). Esses dois grupos sao um conjunto
// fechado (mesmo tratamento especial que ja recebem no catalogo e no
// ICON_GROUPS abaixo), entao um helper puro basta — sem campo novo em
// `exercises`.
export const DURATION_GROUPS = ['Cardio', 'Alongamento'];
export const usesDuration = (muscleGroup) => DURATION_GROUPS.includes(muscleGroup);

// Nome de exibicao em ingles pros 17 grupos. So pra exibicao — o valor gravado
// no IndexedDB, as chaves de ICON_GROUPS e o campo `grupo` do catalogo
// continuam sempre em portugues (ver groupLabel() abaixo).
const GROUP_LABELS_EN = {
  'Peito': 'Chest',
  'Costas': 'Back',
  'Lombar': 'Lower back',
  'Ombros': 'Shoulders',
  'Trapézio': 'Traps',
  'Pescoço': 'Neck',
  'Bíceps': 'Biceps',
  'Tríceps': 'Triceps',
  'Quadríceps': 'Quads',
  'Posterior': 'Hamstrings',
  'Glúteos': 'Glutes',
  'Panturrilha': 'Calves',
  'Abdômen': 'Abs',
  'Antebraço': 'Forearms',
  'Cardio': 'Cardio',
  'Alongamento': 'Stretching',
  'Outros': 'Other',
};

/** Nome do grupo pra exibir na tela, no idioma ativo. `group` continua sendo
 *  a chave canonica (portugues) usada para gravar/comparar — so o texto
 *  mostrado muda. Use isto em todo lugar que hoje imprime `${group}` como
 *  texto; em `<select>`, o `value` do `<option>` continua o `group` original,
 *  so o texto visivel passa por aqui. */
export function groupLabel(group) {
  return language() === 'en' ? (GROUP_LABELS_EN[group] || group) : group;
}

export const SEED_EXERCISES = {
  'Peito': [
    { name: 'Supino reto com barra', slug: 'barbell-bench-press-medium-grip' },
    { name: 'Supino reto com halteres', slug: 'dumbbell-bench-press' },
    { name: 'Supino inclinado com barra', slug: 'barbell-incline-bench-press-medium-grip' },
    { name: 'Supino inclinado com halteres', slug: 'incline-dumbbell-press' },
    { name: 'Supino declinado', slug: 'decline-barbell-bench-press' },
    { name: 'Supino na máquina', slug: 'machine-bench-press' },
    { name: 'Crucifixo com halteres', slug: 'dumbbell-flyes' },
    { name: 'Crucifixo na máquina (voador)', slug: 'butterfly' },
    { name: 'Crossover na polia', slug: 'cable-crossover' },
    { name: 'Mergulho nas paralelas', slug: 'dips-chest-version' },
    { name: 'Flexão de braço', slug: 'pushups' },
  ],
  'Costas': [
    { name: 'Barra fixa', slug: 'pullups' },
    { name: 'Puxada frontal (pulley)', slug: 'wide-grip-lat-pulldown' },
    { name: 'Puxada supinada', slug: 'underhand-cable-pulldowns' },
    { name: 'Remada curvada com barra', slug: 'bent-over-barbell-row' },
    { name: 'Remada unilateral com halter', slug: 'one-arm-dumbbell-row' },
    { name: 'Remada baixa na polia', slug: 'seated-cable-rows' },
    { name: 'Remada cavalinho', slug: 't-bar-row-with-handle' },
    { name: 'Remada na máquina', slug: 'leverage-iso-row' },
    { name: 'Pulldown com braços estendidos', slug: 'straight-arm-pulldown' },
  ],
  'Lombar': [
    { name: 'Levantamento terra', slug: 'barbell-deadlift' },
  ],
  'Ombros': [
    { name: 'Desenvolvimento com barra', slug: 'standing-military-press' },
    { name: 'Desenvolvimento com halteres', slug: 'seated-dumbbell-press' },
    { name: 'Desenvolvimento na máquina', slug: 'machine-shoulder-military-press' },
    { name: 'Desenvolvimento Arnold', slug: 'arnold-dumbbell-press' },
    { name: 'Elevação lateral', slug: 'side-lateral-raise' },
    { name: 'Elevação frontal', slug: 'front-dumbbell-raise' },
    { name: 'Crucifixo inverso (voador invertido)', slug: 'reverse-machine-flyes' },
    { name: 'Remada alta', slug: 'upright-barbell-row' },
  ],
  'Trapézio': [
    { name: 'Encolhimento de ombros', slug: 'barbell-shrug' },
  ],
  'Bíceps': [
    { name: 'Rosca direta com barra', slug: 'barbell-curl' },
    { name: 'Rosca direta com halteres', slug: 'dumbbell-bicep-curl' },
    { name: 'Rosca alternada', slug: 'dumbbell-alternate-bicep-curl' },
    { name: 'Rosca martelo', slug: 'hammer-curls' },
    { name: 'Rosca scott', slug: 'preacher-curl' },
    { name: 'Rosca concentrada', slug: 'concentration-curls' },
    { name: 'Rosca na polia', slug: 'standing-biceps-cable-curl' },
    { name: 'Rosca inversa', slug: 'reverse-barbell-curl' },
  ],
  'Tríceps': [
    { name: 'Tríceps na polia (corda)', slug: 'triceps-pushdown-rope-attachment' },
    { name: 'Tríceps na polia (barra)', slug: 'triceps-pushdown' },
    { name: 'Tríceps testa', slug: 'lying-close-grip-barbell-triceps-extension-behind-the-head' },
    { name: 'Tríceps francês', slug: 'standing-overhead-barbell-triceps-extension' },
    { name: 'Tríceps coice', slug: 'tricep-dumbbell-kickback' },
    { name: 'Supino fechado', slug: 'close-grip-barbell-bench-press' },
    { name: 'Mergulho no banco', slug: 'bench-dips' },
  ],
  'Quadríceps': [
    { name: 'Agachamento livre', slug: 'barbell-squat' },
    { name: 'Agachamento no Smith', slug: 'smith-machine-squat' },
    { name: 'Agachamento frontal', slug: 'front-barbell-squat' },
    { name: 'Leg press', slug: 'leg-press' },
    { name: 'Hack machine', slug: 'hack-squat' },
    { name: 'Cadeira extensora', slug: 'leg-extensions' },
    { name: 'Afundo (passada)', slug: 'dumbbell-lunges' },
    { name: 'Agachamento búlgaro', slug: 'split-squat-with-dumbbells' },
  ],
  'Posterior': [
    { name: 'Mesa flexora', slug: 'lying-leg-curls' },
    { name: 'Cadeira flexora', slug: 'seated-leg-curl' },
    { name: 'Stiff', slug: 'stiff-legged-barbell-deadlift' },
    { name: 'Levantamento terra romeno', slug: 'romanian-deadlift' },
  ],
  'Glúteos': [
    { name: 'Elevação pélvica (hip thrust)', slug: 'barbell-hip-thrust' },
    { name: 'Coice na polia', slug: 'one-legged-cable-kickback' },
    { name: 'Glúteo na máquina', slug: 'glute-kickback' },
    { name: 'Cadeira adutora', slug: 'thigh-adductor' },
    { name: 'Cadeira abdutora', slug: 'thigh-abductor' },
  ],
  'Panturrilha': [
    { name: 'Panturrilha em pé', slug: 'standing-calf-raises' },
    { name: 'Panturrilha sentado', slug: 'seated-calf-raise' },
    { name: 'Panturrilha no leg press', slug: 'calf-press-on-the-leg-press-machine' },
  ],
  'Abdômen': [
    { name: 'Abdominal supra', slug: 'crunches' },
    { name: 'Abdominal infra', slug: 'reverse-crunch' },
    { name: 'Abdominal na polia', slug: 'cable-crunch' },
    { name: 'Abdominal na máquina', slug: 'ab-crunch-machine' },
    { name: 'Elevação de pernas', slug: 'hanging-leg-raise' },
    { name: 'Prancha', slug: 'plank' },
  ],
  'Antebraço': [
    { name: 'Rosca de punho', slug: 'seated-palm-up-barbell-wrist-curl' },
    { name: 'Rosca de punho inversa', slug: 'seated-palms-down-barbell-wrist-curl' },
    { name: 'Farmer walk', slug: 'farmers-walk' },
  ],
};

/** Agrupa `items` pela chave que `getGroup` devolve, na ordem anatomica de
 *  MUSCLE_GROUPS; um grupo que nao esteja em MUSCLE_GROUPS (dado antigo,
 *  borda) sai no fim em vez de sumir. Grupos sem nenhum item nao aparecem no
 *  resultado. */
export function groupBy(items, getGroup) {
  const byGroup = new Map();
  for (const item of items) {
    const group = getGroup(item);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(item);
  }
  const order = [...MUSCLE_GROUPS, ...[...byGroup.keys()].filter((g) => !MUSCLE_GROUPS.includes(g))];
  return order
    .map((group) => ({ group, items: byGroup.get(group) }))
    .filter((g) => g.items?.length);
}

/** Nome normalizado -> slug, para dar figura a quem foi criado antes do catalogo.
 *  Memoizado: a migracao do banco chama isto de dentro de uma transacao, onde
 *  nao pode haver await nem trabalho pesado. */
let nameToSlugMap = null;

export function slugByName() {
  if (!nameToSlugMap) {
    nameToSlugMap = new Map();
    for (const items of Object.values(SEED_EXERCISES)) {
      for (const { name, slug } of items) {
        if (slug) nameToSlugMap.set(normalizeName(name), slug);
      }
    }
  }
  return nameToSlugMap;
}
