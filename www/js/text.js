/* Normalizacao de texto, sem nenhuma dependencia de DOM.
 *
 * Mora fora de ui.js porque db.js precisa comparar nomes durante a migracao do
 * banco, e o banco nao pode arrastar o DOM junto — ui.js reexporta
 * `stripAccents` para que quem ja importava de la continue funcionando.
 */

/** Normaliza para busca: quem digita "biceps" no celular precisa achar "Bíceps".
 *  `\p{M}` casa os acentos que o NFD separou das letras. */
export const stripAccents = (s) =>
  String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Chave de comparacao entre nomes de exercicio.
 *
 *  Mais agressiva que `stripAccents`: descarta pontuacao e colapsa espaco, para
 *  que "Crucifixo na máquina (voador)" e "crucifixo na maquina voador" sejam a
 *  mesma coisa. Usada para reencontrar o slug de exercicios que ja estavam no
 *  aparelho antes do catalogo existir. */
export const normalizeName = (s) =>
  stripAccents(s).replace(/[^a-z0-9]+/g, ' ').trim();
