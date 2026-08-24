/* SEED_EXERCISES nao popula mais a biblioteca sozinho — ela comeca vazia, e o
 * usuario adiciona do catalogo de 873 (#/catalogo) ou a mao (botao "Novo").
 * O que sobra de uso real aqui e slugPorNome(): da figura a exercicios de quem
 * ja usava o app antes do `slug` existir, casando pelo nome.
 *
 * O `slug` liga o exercicio a suas figuras em www/img/ex/ e a entrada do
 * catalogo em www/data/catalogo.json. Precisa ser estavel: o `id` do banco e
 * autoincremento e muda de aparelho para aparelho, e o `nome` tem acento e pode
 * ser editado pelo usuario. `slug: null` e valido — o exercicio so aparece com
 * o icone do grupo no lugar da foto.
 *
 * Os slugs vem do free-exercise-db (dominio publico) e foram conferidos um a
 * um; `python tools/build_catalog.py --sugerir-seed` imprime candidatos para
 * quem for adicionar mais.
 */

import { normalizarNome } from './text.js';
import { idioma } from './i18n.js';

export const GRUPOS = [
  'Peito',
  'Costas',
  'Lombar',
  'Deltoides',
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

// Nome de exibicao em ingles pros 17 grupos. So pra exibicao — o valor gravado
// no IndexedDB, as chaves de ICON_GRUPO e o campo `grupo` do catalogo
// continuam sempre em portugues (ver grupoLabel() abaixo).
const GRUPO_EN = {
  'Peito': 'Chest',
  'Costas': 'Back',
  'Lombar': 'Lower back',
  'Deltoides': 'Shoulders',
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

/** Nome do grupo pra exibir na tela, no idioma ativo. `grupo` continua sendo
 *  a chave canonica (portugues) usada para gravar/comparar — so o texto
 *  mostrado muda. Use isto em todo lugar que hoje imprime `${grupo}` como
 *  texto; em `<select>`, o `value` do `<option>` continua o `grupo` original,
 *  so o texto visivel passa por aqui. */
export function grupoLabel(grupo) {
  return idioma() === 'en' ? (GRUPO_EN[grupo] || grupo) : grupo;
}

export const SEED_EXERCISES = {
  'Peito': [
    { nome: 'Supino reto com barra', slug: 'barbell-bench-press-medium-grip' },
    { nome: 'Supino reto com halteres', slug: 'dumbbell-bench-press' },
    { nome: 'Supino inclinado com barra', slug: 'barbell-incline-bench-press-medium-grip' },
    { nome: 'Supino inclinado com halteres', slug: 'incline-dumbbell-press' },
    { nome: 'Supino declinado', slug: 'decline-barbell-bench-press' },
    { nome: 'Supino na máquina', slug: 'machine-bench-press' },
    { nome: 'Crucifixo com halteres', slug: 'dumbbell-flyes' },
    { nome: 'Crucifixo na máquina (voador)', slug: 'butterfly' },
    { nome: 'Crossover na polia', slug: 'cable-crossover' },
    { nome: 'Mergulho nas paralelas', slug: 'dips-chest-version' },
    { nome: 'Flexão de braço', slug: 'pushups' },
  ],
  'Costas': [
    { nome: 'Barra fixa', slug: 'pullups' },
    { nome: 'Puxada frontal (pulley)', slug: 'wide-grip-lat-pulldown' },
    { nome: 'Puxada supinada', slug: 'underhand-cable-pulldowns' },
    { nome: 'Remada curvada com barra', slug: 'bent-over-barbell-row' },
    { nome: 'Remada unilateral com halter', slug: 'one-arm-dumbbell-row' },
    { nome: 'Remada baixa na polia', slug: 'seated-cable-rows' },
    { nome: 'Remada cavalinho', slug: 't-bar-row-with-handle' },
    { nome: 'Remada na máquina', slug: 'leverage-iso-row' },
    { nome: 'Pulldown com braços estendidos', slug: 'straight-arm-pulldown' },
  ],
  'Lombar': [
    { nome: 'Levantamento terra', slug: 'barbell-deadlift' },
  ],
  'Deltoides': [
    { nome: 'Desenvolvimento com barra', slug: 'standing-military-press' },
    { nome: 'Desenvolvimento com halteres', slug: 'seated-dumbbell-press' },
    { nome: 'Desenvolvimento na máquina', slug: 'machine-shoulder-military-press' },
    { nome: 'Desenvolvimento Arnold', slug: 'arnold-dumbbell-press' },
    { nome: 'Elevação lateral', slug: 'side-lateral-raise' },
    { nome: 'Elevação frontal', slug: 'front-dumbbell-raise' },
    { nome: 'Crucifixo inverso (voador invertido)', slug: 'reverse-machine-flyes' },
    { nome: 'Remada alta', slug: 'upright-barbell-row' },
  ],
  'Trapézio': [
    { nome: 'Encolhimento de ombros', slug: 'barbell-shrug' },
  ],
  'Bíceps': [
    { nome: 'Rosca direta com barra', slug: 'barbell-curl' },
    { nome: 'Rosca direta com halteres', slug: 'dumbbell-bicep-curl' },
    { nome: 'Rosca alternada', slug: 'dumbbell-alternate-bicep-curl' },
    { nome: 'Rosca martelo', slug: 'hammer-curls' },
    { nome: 'Rosca scott', slug: 'preacher-curl' },
    { nome: 'Rosca concentrada', slug: 'concentration-curls' },
    { nome: 'Rosca na polia', slug: 'standing-biceps-cable-curl' },
    { nome: 'Rosca inversa', slug: 'reverse-barbell-curl' },
  ],
  'Tríceps': [
    { nome: 'Tríceps na polia (corda)', slug: 'triceps-pushdown-rope-attachment' },
    { nome: 'Tríceps na polia (barra)', slug: 'triceps-pushdown' },
    { nome: 'Tríceps testa', slug: 'lying-close-grip-barbell-triceps-extension-behind-the-head' },
    { nome: 'Tríceps francês', slug: 'standing-overhead-barbell-triceps-extension' },
    { nome: 'Tríceps coice', slug: 'tricep-dumbbell-kickback' },
    { nome: 'Supino fechado', slug: 'close-grip-barbell-bench-press' },
    { nome: 'Mergulho no banco', slug: 'bench-dips' },
  ],
  'Quadríceps': [
    { nome: 'Agachamento livre', slug: 'barbell-squat' },
    { nome: 'Agachamento no Smith', slug: 'smith-machine-squat' },
    { nome: 'Agachamento frontal', slug: 'front-barbell-squat' },
    { nome: 'Leg press', slug: 'leg-press' },
    { nome: 'Hack machine', slug: 'hack-squat' },
    { nome: 'Cadeira extensora', slug: 'leg-extensions' },
    { nome: 'Afundo (passada)', slug: 'dumbbell-lunges' },
    { nome: 'Agachamento búlgaro', slug: 'split-squat-with-dumbbells' },
  ],
  'Posterior': [
    { nome: 'Mesa flexora', slug: 'lying-leg-curls' },
    { nome: 'Cadeira flexora', slug: 'seated-leg-curl' },
    { nome: 'Stiff', slug: 'stiff-legged-barbell-deadlift' },
    { nome: 'Levantamento terra romeno', slug: 'romanian-deadlift' },
  ],
  'Glúteos': [
    { nome: 'Elevação pélvica (hip thrust)', slug: 'barbell-hip-thrust' },
    { nome: 'Coice na polia', slug: 'one-legged-cable-kickback' },
    { nome: 'Glúteo na máquina', slug: 'glute-kickback' },
    { nome: 'Cadeira adutora', slug: 'thigh-adductor' },
    { nome: 'Cadeira abdutora', slug: 'thigh-abductor' },
  ],
  'Panturrilha': [
    { nome: 'Panturrilha em pé', slug: 'standing-calf-raises' },
    { nome: 'Panturrilha sentado', slug: 'seated-calf-raise' },
    { nome: 'Panturrilha no leg press', slug: 'calf-press-on-the-leg-press-machine' },
  ],
  'Abdômen': [
    { nome: 'Abdominal supra', slug: 'crunches' },
    { nome: 'Abdominal infra', slug: 'reverse-crunch' },
    { nome: 'Abdominal na polia', slug: 'cable-crunch' },
    { nome: 'Abdominal na máquina', slug: 'ab-crunch-machine' },
    { nome: 'Elevação de pernas', slug: 'hanging-leg-raise' },
    { nome: 'Prancha', slug: 'plank' },
  ],
  'Antebraço': [
    { nome: 'Rosca de punho', slug: 'seated-palm-up-barbell-wrist-curl' },
    { nome: 'Rosca de punho inversa', slug: 'seated-palms-down-barbell-wrist-curl' },
    { nome: 'Farmer walk', slug: 'farmers-walk' },
  ],
};

/** Agrupa `itens` pela chave que `pegarGrupo` devolve, na ordem anatomica de
 *  GRUPOS; um grupo que nao esteja em GRUPOS (dado antigo, borda) sai no fim
 *  em vez de sumir. Grupos sem nenhum item nao aparecem no resultado. */
export function agruparPorGrupo(itens, pegarGrupo) {
  const porGrupo = new Map();
  for (const item of itens) {
    const grupo = pegarGrupo(item);
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push(item);
  }
  const ordem = [...GRUPOS, ...[...porGrupo.keys()].filter((g) => !GRUPOS.includes(g))];
  return ordem
    .map((grupo) => ({ grupo, itens: porGrupo.get(grupo) }))
    .filter((g) => g.itens?.length);
}

/** Nome normalizado -> slug, para dar figura a quem foi criado antes do catalogo.
 *  Memoizado: a migracao do banco chama isto de dentro de uma transacao, onde
 *  nao pode haver await nem trabalho pesado. */
let mapaNomeSlug = null;

export function slugPorNome() {
  if (!mapaNomeSlug) {
    mapaNomeSlug = new Map();
    for (const itens of Object.values(SEED_EXERCISES)) {
      for (const { nome, slug } of itens) {
        if (slug) mapaNomeSlug.set(normalizarNome(nome), slug);
      }
    }
  }
  return mapaNomeSlug;
}
