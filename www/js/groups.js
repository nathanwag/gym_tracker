/* Grupos musculares como DADO, nao como lista no codigo.
 *
 * Puro: so depende de `text.js`, que tambem e. Isso importa por dois motivos —
 * `db.js` chama estas funcoes DENTRO da migracao, que tem que ser 100%
 * sincrona (WebKit encerra transacao ociosa), e modulo que puxa `i18n.js` nao
 * carrega sob `node --test`. Mesmo motivo que separou `text.js` de `ui.js`.
 *
 * O `slug` e a chave estavel do grupo, no mesmo espirito do `slug` do
 * exercicio: o `name` e editavel pelo usuario e tem acento, entao nao serve de
 * referencia. `exercises.muscleGroup` guarda o slug.
 */

import { stripAccents } from './text.js';

/* Os 17 que o app ja tinha, agora como semente do store. A ordem e anatomica
 * (de cima pra baixo no corpo) e vira o `order` inicial.
 *
 * As duas cores nao sao a mesma cor em brilhos diferentes: a paleta foi
 * desenhada a mao em tres familias (empurrar vermelho, puxar azul, pernas
 * verde-azulado, aco pro resto), e o tema claro escurece pra segurar contraste
 * sobre fundo claro. Vem dos tokens --m-* de styles.css. */
const SEED = [
  ['peito', 'Peito', '#c94435', '#ec6154'],
  ['costas', 'Costas', '#2f66b8', '#5a92e8'],
  ['lombar', 'Lombar', '#255296', '#4276c4'],
  ['ombros', 'Ombros', '#a5342a', '#c4483b'],
  ['trapezio', 'Trapézio', '#1c4076', '#345f9f'],
  ['pescoco', 'Pescoço', '#464d56', '#6b737e'],
  ['biceps', 'Bíceps', '#173458', '#27497c'],
  ['triceps', 'Tríceps', '#7a251e', '#96322a'],
  ['quadriceps', 'Quadríceps', '#1e8b92', '#45c2c8'],
  ['posterior', 'Posterior', '#176e75', '#2d9aa1'],
  ['gluteos', 'Glúteos', '#12565c', '#20787e'],
  ['panturrilha', 'Panturrilha', '#0d4146', '#175b61'],
  ['abdomen', 'Abdômen', '#69717c', '#9aa1ab'],
  ['antebraco', 'Antebraço', '#122a45', '#1c3a63'],
  ['cardio', 'Cardio', '#575f69', '#828a95'],
  ['alongamento', 'Alongamento', '#2e343b', '#4a515a'],
  ['outros', 'Outros', '#3a4149', '#5a626c'],
];

// Cardio e alongamento nao tem carga: a serie e gravada como duracao. Era um
// conjunto fechado no codigo; vira campo do grupo pra que um grupo criado pelo
// usuario tambem possa se declarar assim.
const BY_TIME = new Set(['cardio', 'alongamento']);

/** Destino de quem fica sem grupo: exercicio criado sem escolher um, e
 *  exercicio recolhido quando o grupo dele e apagado. Nao pode ser apagado. */
export const FALLBACK_GROUP = 'outros';

export const CANONICAL_GROUPS = SEED.map(([slug, name, colorLight, colorDark], i) => ({
  slug,
  name,
  colorLight,
  colorDark,
  usesDuration: BY_TIME.has(slug),
  order: i,
}));

/** Nome livre -> chave estavel. Hifen entre palavras: nenhum dos 17 tem
 *  espaco, mas "Cadeia posterior" criado pelo usuario tem — e a rota
 *  #/progresso/<slug> precisa de algo sem acento e sem espaco.
 *
 *  Nome so com simbolo ou vazio ainda precisa virar chave: o grupo existe no
 *  banco de qualquer jeito, e uma string vazia colidiria com a proxima. */
export function groupSlug(name) {
  const slug = stripAccents(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'grupo';
}

/** Slug livre para um nome novo, dado os que ja existem.
 *
 *  Conta a partir do MAIOR sufixo em uso, nao do primeiro vago: reaproveitar o
 *  buraco de um grupo apagado faria um exercicio que ficou orfao voltar a
 *  apontar pro grupo errado quando o slug fosse reatribuido. */
export function uniqueGroupSlug(name, existing = []) {
  const taken = new Set(existing);
  const base = groupSlug(name);
  if (!taken.has(base)) return base;

  const suffix = new RegExp(`^${base}-([0-9]+)$`);
  let max = 1;
  for (const slug of taken) {
    const n = Number(slug.match(suffix)?.[1]);
    if (n > max) max = n;
  }
  return `${base}-${max + 1}`;
}

/** O valor gravado hoje em `exercises.muscleGroup` (nome em portugues, ex.:
 *  'Peito') -> slug. E o que a migracao aplica em cada exercicio.
 *
 *  `groupSlug()` sozinho ja resolve os 17 (o nome canonico gera o proprio
 *  slug, garantido por teste) e tambem o grupo que nunca esteve na semente —
 *  que fica com slug proprio de proposito, porque fundi-lo em Outros
 *  misturaria exercicios de grupos diferentes sem volta.
 *
 *  Vazio/ausente cai em Outros, o mesmo destino que `addExercise` ja dava. */
export function groupSlugFor(storedValue) {
  if (!storedValue) return FALLBACK_GROUP;
  return groupSlug(storedValue);
}

/* Quanto a luminosidade anda entre os dois temas. Nao e chute: e a media
 * medida nas 17 cores que ja existiam nos dois temas, desenhadas a mao. Matiz
 * e saturacao ficam parados porque a paleta a mao tambem os deixa parados
 * (matiz desvia no maximo 2.9 graus entre os temas). */
const LIGHTNESS_SHIFT = 0.128;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2
      : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    const v = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (v < 1 / 6) return p + (q - p) * 6 * v;
    if (v < 1 / 2) return q;
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;

/** A mesma cor no outro tema. O usuario escolhe UM hex no picker; o outro tema
 *  precisa de um valor que seja reconhecivelmente a mesma cor sem perder
 *  contraste contra o fundo oposto — dai deslocar so a luminosidade. */
export function themeVariant(hex, target) {
  const [h, s, l] = rgbToHsl(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
  return toHex(hslToRgb(h, s, clamp01(target === 'dark' ? l + LIGHTNESS_SHIFT : l - LIGHTNESS_SHIFT)));
}

/* Rotulo em ingles dos 17, agora chaveado por slug em vez do nome em
 * portugues — o nome virou editavel e nao serve mais de chave. Grupo criado
 * pelo usuario nao entra aqui: aparece com o nome que ele digitou, nos dois
 * idiomas, que e o unico texto que existe pra ele. */
export const GROUP_LABELS_EN = {
  peito: 'Chest',
  costas: 'Back',
  lombar: 'Lower back',
  ombros: 'Shoulders',
  trapezio: 'Traps',
  pescoco: 'Neck',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quadriceps: 'Quads',
  posterior: 'Hamstrings',
  gluteos: 'Glutes',
  panturrilha: 'Calves',
  abdomen: 'Abs',
  antebraco: 'Forearms',
  cardio: 'Cardio',
  alongamento: 'Stretching',
  outros: 'Other',
};

/** Os grupos que uma restauracao de backup deve gravar.
 *
 *  Backup exportado antes da v7 nao tem grupo nenhum — restaurar so o que ele
 *  tras deixaria o banco sem grupos, e sem grupo o exercicio perde cor, rotulo
 *  e a linha do Progresso. Entao a semente entra sempre, e o backup manda por
 *  cima no que ele de fato traz.
 *
 *  Grupo que so aparece em `exercises` (backup antigo com grupo inventado)
 *  ganha registro proprio, pelo mesmo motivo da migracao: fundir em Outros nao
 *  tem volta. */
export function groupsForRestore(groups, exercises = []) {
  const byslug = new Map(CANONICAL_GROUPS.map((g) => [g.slug, { ...g }]));
  const outros = byslug.get(FALLBACK_GROUP);

  for (const raw of Array.isArray(groups) ? groups : []) {
    if (!raw) continue;
    const slug = raw.slug ? groupSlug(raw.slug) : groupSlug(raw.name);
    const current = byslug.get(slug);
    byslug.set(slug, {
      slug,
      name: String(raw.name ?? current?.name ?? slug),
      colorLight: raw.colorLight ?? current?.colorLight ?? outros.colorLight,
      colorDark: raw.colorDark ?? current?.colorDark ?? outros.colorDark,
      usesDuration: Boolean(raw.usesDuration ?? current?.usesDuration),
      order: 0,
    });
  }

  for (const exercise of exercises) {
    const value = exercise?.muscleGroup;
    const slug = groupSlugFor(value);
    if (byslug.has(slug)) continue;
    byslug.set(slug, {
      slug,
      name: String(value),
      colorLight: outros.colorLight,
      colorDark: outros.colorDark,
      usesDuration: false,
      order: 0,
    });
  }

  return [...byslug.values()].map((g, order) => ({ ...g, order }));
}

/* ---------- Tinta do pictograma vazado na anilha ----------
 *
 * Nao da pra fixar uma tinta so: a paleta escura vai de #1c3a63 a #9aa1ab, e
 * nem branco nem preto e legivel nas duas pontas. Escolher pelo maior
 * contraste WCAG resolve tambem a cor que o usuario inventar no picker, que e
 * a razao de isto ser conta e nao tabela. */
const INK_DARK = '#16171a';
const INK_LIGHT = '#ffffff';

function relLuminance(hex) {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** A tinta que da mais contraste sobre `hex`. */
export function inkOn(hex) {
  const l = relLuminance(hex);
  const ratio = (ink) => {
    const [hi, lo] = [l, relLuminance(ink)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  };
  return ratio(INK_DARK) >= ratio(INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

/** Sigla de 3 letras pra anilha de um grupo sem pictograma.
 *
 *  Sai do ROTULO, nao do slug: o rotulo e o que a pessoa le, e muda de idioma
 *  junto com o app. Dai precisar desempatar aqui, no mesmo espirito de
 *  `uniqueGroupSlug` — "Peitoral superior" e "Peitoral inferior" dao a mesma
 *  base, e a inicial da segunda palavra e o que os separa antes de recorrer a
 *  digito. */
export function groupInitials(label, taken = []) {
  const used = new Set(taken);
  const words = stripAccents(label ?? '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(Boolean);
  const base = (words.join('').slice(0, 3) || 'grp').toUpperCase();
  if (!used.has(base)) return base;

  for (const word of words.slice(1)) {
    const candidate = (words[0].slice(0, 2) + word[0]).toUpperCase();
    if (!used.has(candidate)) return candidate;
  }
  for (let n = 2; ; n += 1) {
    if (!used.has(`${base}${n}`)) return `${base}${n}`;
  }
}
