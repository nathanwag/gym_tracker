/* O nucleo numerico dos botoes +/- de peso e reps. Puro, sem DOM.
 *
 * Separado de `createStepper` (ui.js) porque era ali que o risco morava e nao
 * dava pra testar: o parse de virgula, o arredondamento que impede a soma
 * repetida de acumular lixo binario, e o intervalo. O weight-step.js, que so
 * valida o PASSO, ja tinha teste — o que o passo causa nao tinha.
 */

/** Regras de valor de um stepper: leia do input, formate pro input, e ande um
 *  passo. Configura uma vez, responde as tres. */
export function stepperValue({ min = 0, max = 9999, decimals = 0 } = {}) {
  const clamp = (n) => Math.min(max, Math.max(min, n));
  // Duas casas ALEM das exibidas: o suficiente pra 0.1+0.2 nao virar
  // 0.30000000000000004, sem cortar precisao que o usuario digitou.
  const round = (n) => Number(n.toFixed(decimals + 2));

  /** Texto do input -> numero no intervalo. Aceita virgula, que e o que o
   *  teclado do celular oferece em pt. O que nao e numero vira 0, e nao NaN:
   *  NaN apareceria na tela. */
  const read = (text) => {
    const n = parseFloat(String(text).replace(',', '.'));
    return Number.isFinite(n) ? clamp(n) : 0;
  };

  /** Numero -> texto pro input, no intervalo e sem lixo de ponto flutuante. */
  const format = (value) => String(round(clamp(Number(value) || 0)));

  /** O texto do proximo valor, `delta` adiante do atual. */
  const next = (text, delta) => format(read(text) + delta);

  return { read, format, next };
}
