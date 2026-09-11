/* O icone de grupo muscular: uma anilha na cor do grupo com o pictograma do
 * gesto vazado nela.
 *
 * Puro e SEM IMPORT NENHUM, pelo mesmo motivo de `text.js` e `curve.js`: assim
 * roda sob `node --test`. Quem sabe a cor e o rotulo e `ui.js`, que passa os
 * dois por parametro — este modulo nao consulta banco, i18n nem DOM.
 *
 * POR QUE POSE, E NAO O MUSCULO. O conjunto anterior era uma silhueta so, com
 * uma mancha mudando de lugar: a 22 px a mancha andava menos de dois pixels
 * entre vizinhos, e Ombros/Trapezio, Biceps/Triceps e Quadriceps/Posterior
 * liam identicos. Gesto resolve porque cada pose tem SILHUETA INTEIRA propria,
 * que e a propriedade que faz icone funcionar pequeno — o metodo e o dos
 * pictogramas de Otl Aicher para Munique 1972: grade unica, cabeca como
 * circulo cheio, membros em angulos fixos, espessura de traco constante.
 *
 * Cor e legenda de FAMILIA (empurrar vermelho, puxar azul, pernas
 * verde-azulado); o pictograma e que identifica o grupo. Os dois trabalhos
 * separados e o que conserta o icone sem mexer na paleta, que continua
 * servindo as barras e a assinatura do treino.
 */

/* Grade de 24. A cabeca e `class="fill"` porque e a unica forma cheia; o resto
 * e traco, e a espessura vem do CSS pra todos de uma vez. */
export const POSES = {
  // supino: deitado, empurrando a barra. Sem a linha do banco de proposito —
  // duas horizontais paralelas fecham o desenho e ele vira mancha.
  peito: '<circle class="fill" cx="5.2" cy="15" r="2.1"/>'
    + '<path d="M7.4 15h8.2M15.6 15 18.8 16.6M9.4 14.4 8.8 10.2M13.2 14.4 12.6 10.2M6.4 9.4h8.6"/>',

  // barra fixa: pendurado, joelhos dobrados. O joelho dobrado e o que separa
  // esta pose da de Ombros, que tambem tem barra no alto.
  costas: '<circle class="fill" cx="12" cy="9.6" r="2.1"/>'
    + '<path d="M3.5 4h17M9 4.6 9.8 9.2M15 4.6 14.2 9.2M12 11.8v4.6M12 16.4 9.8 19.8 13.4 20.8"/>',

  // hiperextensao: tronco na horizontal, maos atras da cabeca
  lombar: '<circle class="fill" cx="5.6" cy="9.6" r="2.1"/>'
    + '<path d="M7.7 10H14M14 10.2 15.4 20.2M13.4 20.6h4M9.8 9.2 8.6 5.8 6 6.6"/>',

  // desenvolvimento: de pe, barra acima da cabeca
  ombros: '<circle class="fill" cx="12" cy="8.8" r="2.1"/>'
    + '<path d="M6 5h12M9.4 5.6 9.8 11.4M14.6 5.6 14.2 11.4M12 11v5M12 16 10.2 21M12 16 13.8 21"/>',

  // encolhimento: ombros altos, halteres nas maos, setas pra cima. As setas
  // sao o verbo — sem elas a pose le como "de pe segurando peso".
  trapezio: '<circle class="fill" cx="12" cy="6.4" r="2"/>'
    + '<path d="M8.8 9.4h6.4M12 9.4v6M8.9 9.6 8.6 15.2M15.1 9.6 15.4 15.2'
    + 'M6.9 15.4h3.4M13.7 15.4h3.4M12 15.4 10.6 20.8M12 15.4 13.4 20.8'
    + 'M5 8.2V5.8M4 6.8 5 5.8 6 6.8M19 8.2V5.8M18 6.8 19 5.8 20 6.8"/>',

  // mao apoiada na cabeca
  pescoco: '<circle class="fill" cx="11.4" cy="6.2" r="2.4"/>'
    + '<path d="M11.4 8.8v3.6M7 12.8h9M11.4 12.8v3.4M15.2 11.6 16.4 8 13.6 5.8"/>',

  // rosca: antebraco dobrado PRA CIMA com a barra
  biceps: '<circle class="fill" cx="12" cy="4.8" r="2.1"/>'
    + '<path d="M12 6.9v6.6M12 13.5 10.4 20.6M12 13.5 13.6 20.6M13.6 8.2 14.9 12.4 11.9 10.4M10.2 9.8h3.4"/>',

  // extensao: o mesmo braco estendido PRA BAIXO. E o contraste com Biceps —
  // dois gestos opostos, nao duas manchas a um pixel de distancia.
  triceps: '<circle class="fill" cx="12" cy="4.8" r="2.1"/>'
    + '<path d="M12 6.9v6.6M12 13.5 10.4 20.6M12 13.5 13.6 20.6M13.6 8.2 14.9 12.2 14.5 16.2M12.6 16.4h3.8"/>',

  // punho fechado segurando a barra
  antebraco: '<circle class="fill" cx="13.4" cy="13.4" r="3.3"/>'
    + '<path d="M4.8 5.2 11 11.2M18.2 9 9.4 17.8"/>',

  // abdominal: deitado, tronco enrolado
  abdomen: '<circle class="fill" cx="6.2" cy="10" r="2.1"/>'
    + '<path d="M8.2 10.8 11.8 13.6M11.8 13.6 16.4 12.2M16.4 12.2 17 17.4M3.4 19.4h15"/>',

  // elevacao pelvica: ombros no banco, quadril no alto
  gluteos: '<circle class="fill" cx="4.8" cy="15" r="2"/>'
    + '<path d="M6.8 14.4 12.4 10.6M12.4 10.6 16 14.8M16 14.8 16.2 19.4M14.4 19.6h3.6M2 17.8h4.4"/>',

  // agachamento: coxa na horizontal, bracos a frente
  quadriceps: '<circle class="fill" cx="10.2" cy="4.8" r="2.1"/>'
    + '<path d="M10.4 6.9 9.8 12.4M9.8 12.4h5.6M15.4 12.4 15 18.4M13.2 18.8h4M10.8 8.6 15.2 9.4"/>',

  // terra romeno: dobra no quadril, pernas retas, barra baixa. Difere de
  // Lombar (que tambem dobra) pelas maos: aqui seguram barra, la ficam na nuca.
  posterior: '<circle class="fill" cx="5.4" cy="8.2" r="2.1"/>'
    + '<path d="M7.5 8.6H13.4M13.4 8.8 14.8 20.2M12.8 20.6h4M10 9.2 9.4 14.4M6.6 14.6h5.8"/>',

  // na ponta dos pes, calcanhar fora do degrau
  panturrilha: '<circle class="fill" cx="11.6" cy="4.6" r="2.1"/>'
    + '<path d="M11.6 6.7v6.4M11.6 13.1 10.4 18.2M11.6 13.1 12.8 18.2'
    + 'M10.4 18.2 9.4 20.6M12.8 18.2 13.8 20.6M5.6 20.8h9.6'
    + 'M19 17.6v-4.8M18 14 19 12.8 20 14"/>',

  cardio: '<circle class="fill" cx="14.8" cy="4.8" r="2.1"/>'
    + '<path d="M14.2 6.9 11.2 12.2M13.2 8.6 16.8 10.4M12.8 9.6 9.2 8.2'
    + 'M11.2 12.2 13.8 16.6 17.4 17.6M11.2 12.2 7.4 14.6 6.4 19.2"/>',

  alongamento: '<circle class="fill" cx="8" cy="6" r="2.1"/>'
    + '<path d="M9.8 7.2 12.8 11.6M12.8 11.6 12.4 19.4M10.6 19.8h4M11.4 9 10.6 15.6"/>',

  // o unico que nao e gesto, porque "Outros" nao tem gesto
  outros: '<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** A anilha de um grupo.
 *
 *  `color` e `ink` chegam como string de CSS (`var(--m-peito)`,
 *  `var(--ink-peito)`) e nao como hex: assim a mesma marcacao serve nos dois
 *  temas e trocar de tema continua sendo cascata, nao JS — igual a
 *  `groupColor()`. Quem gera os dois tokens e `applyGroupTokens()`.
 *
 *  `initials` so e usado quando o grupo nao tem pictograma, que hoje e
 *  exatamente o caso do grupo criado pelo usuario. */
export function plateIcon({ slug, color, ink, initials } = {}) {
  const pose = POSES[slug];
  const face = pose
    // 0.78 porque a borda da anilha come a margem: em escala cheia o
    // pictograma encosta no corte do disco.
    // A tinta entra como `color` e nao como `stroke` porque a cabeca de cada
    // pose e forma cheia: quem a pinta e a regra `.gicon__pose .fill` do CSS,
    // que so alcanca a tinta via currentColor.
    ? `<g class="gicon__pose" style="color:${ink}" stroke="currentColor"`
      + ` transform="translate(12 12) scale(.78) translate(-12 -12)">${pose}</g>`
    : initials
      ? `<text class="gicon__sig" x="12" y="15.9" text-anchor="middle"`
        + ` fill="${ink}" stroke="none">${esc(initials)}</text>`
      : '';

  return '<svg viewBox="0 0 24 24" aria-hidden="true" class="gicon">'
    + `<circle cx="12" cy="12" r="11.4" fill="${color}" stroke="none"/>`
    + `${face}</svg>`;
}
