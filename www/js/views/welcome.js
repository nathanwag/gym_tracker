/* Boas-vindas: a primeira (e unica) abertura do app em que nao ha nada pra ver.
 *
 * Tres telas, uma pergunta cada, na ordem em que a resposta muda alguma coisa:
 * quem e voce, em que unidade voce levanta, quantos treinos por semana. Os tres
 * ja existiam como ajuste no Perfil — o wizard so os pergunta antes, porque a
 * unidade e a meta da semana mudam a primeira tela que a pessoa vai ver.
 *
 * Sem topbar e sem tabbar: e a unica tela do app em que as quatro abas ainda
 * nao significam nada, e o botao voltar da topbar desempilharia a navegacao do
 * app em vez de voltar uma etapa.
 *
 * A etapa e `let` local ao render(), e nao de modulo como o exercise-picker:
 * aquele precisa sobreviver a sair da tela e voltar; aqui, reabrir na etapa 3
 * depois de um refresh() so seria bug. */

import * as db from '../db.js';
import { cleanName, MAX_NAME } from '../onboarding.js';
import { runDemo } from '../demo.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, toast, pickList, APP_NAME,
} from '../ui.js';

const STEPS = 3;
const PER_WEEK = [2, 3, 4, 5, 6, 7];

/* A marca, na grade de 100 do icon.svg: tres tracos do mesmo comprimento, cada
 * um mais grosso. A progressao esta na espessura e nao na altura — e o que a
 * tira do territorio de grafico de barras (ver DESIGN.md). */
const MARK = `
  <svg class="welcome__mark" viewBox="0 0 100 100" aria-hidden="true">
    <rect x="26" y="28" width="48" height="5" rx="2.5"/>
    <rect x="26" y="43" width="48" height="9" rx="4.5"/>
    <rect x="26" y="60" width="48" height="14" rx="7"/>
  </svg>`;

export async function render(view) {
  setTop({ title: APP_NAME, showBar: false, showTabs: false });

  const cfg = db.settings();
  const draft = {
    name: cfg.profileName,
    unit: cfg.unit,
    perWeek: cfg.goalWorkoutsPerWeek,
  };
  let step = 0;

  const root = node('<div class="welcome"></div>');
  view.append(root);

  const draw = () => {
    root.innerHTML = '';
    root.append(step === 0 ? hello() : step === 1 ? you() : week());
  };
  const go = (to) => { step = to; draw(); window.scrollTo(0, 0); };

  function dots() {
    const pips = Array.from({ length: STEPS }, (_, i) => `<i class="${i === step ? 'is-on' : ''}"></i>`);
    return html`
      <div class="welcome__dots" aria-hidden="true">${raw(pips.join(''))}</div>
      <span class="sr-only">${t('welcome.stepOf', { n: step + 1, total: STEPS })}</span>`;
  }

  function hello() {
    const el = node(html`
      <div class="welcome__screen welcome__screen--hero">
        <div class="welcome__hero">
          ${raw(MARK)}
          <h1 class="welcome__app">${APP_NAME}</h1>
          <p class="welcome__tagline">${t('welcome.tagline')}</p>
          <p class="welcome__pitch">${t('welcome.pitch')}</p>
        </div>
        <div class="welcome__foot">
          ${raw(dots())}
          <button class="btn btn--primary btn--block btn--lg" type="button" data-next>${t('welcome.start')}</button>
          <button class="btn btn--block btn--ghost" type="button" data-skip>${t('welcome.already')}</button>
        </div>
      </div>
    `);
    el.querySelector('[data-next]').onclick = () => go(1);
    el.querySelector('[data-skip]').onclick = () => finish({ save: false });
    return el;
  }

  function you() {
    const el = node(html`
      <div class="welcome__screen">
        <div class="welcome__body">
          <h1 class="welcome__title">${t('welcome.you.title')}</h1>
          <label class="field">
            <span class="field__label">${t('welcome.you.name')}</span>
            <input class="input" data-name type="text" autocomplete="name"
                   enterkeyhint="next" maxlength="${MAX_NAME}"
                   placeholder="${t('welcome.you.namePlaceholder')}"
                   value="${draft.name}">
          </label>
          <p class="hint">${t('welcome.you.nameHint')}</p>
          <h2 class="section-title">${t('welcome.you.unit')}</h2>
        </div>
        <div class="welcome__foot">
          ${raw(dots())}
          <button class="btn btn--primary btn--block btn--lg" type="button" data-next>${t('welcome.next')}</button>
          <button class="btn btn--block btn--ghost" type="button" data-back>${t('welcome.back')}</button>
        </div>
      </div>
    `);

    const units = pickList({
      options: [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }],
      value: draft.unit,
    });
    wirePick(units, (value) => { draft.unit = value; });
    el.querySelector('.welcome__body').append(units);

    const input = el.querySelector('[data-name]');
    input.oninput = () => { draft.name = input.value; };
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      go(2);
    };

    el.querySelector('[data-next]').onclick = () => go(2);
    el.querySelector('[data-back]').onclick = () => go(0);
    return el;
  }

  function week() {
    const el = node(html`
      <div class="welcome__screen">
        <div class="welcome__body">
          <h1 class="welcome__title">${t('welcome.week.title')}</h1>
        </div>
        <div class="welcome__foot">
          ${raw(dots())}
          <p class="welcome__howto">${t('welcome.week.howTo')}</p>
          <button class="btn btn--primary btn--block btn--lg" type="button" data-finish>${t('welcome.finish')}</button>
          <button class="btn btn--block btn--ghost" type="button" data-demo>${t('welcome.demo')}</button>
          <p class="hint">${t('welcome.demoHint')}</p>
          <button class="btn btn--block btn--ghost" type="button" data-back>${t('welcome.back')}</button>
        </div>
      </div>
    `);

    const goal = pickList({
      options: PER_WEEK.map((n) => ({ value: n, label: tn('welcome.week.option', n) })),
      value: draft.perWeek,
    });
    wirePick(goal, (value) => { draft.perWeek = Number(value); });

    const body = el.querySelector('.welcome__body');
    body.append(goal);
    body.append(node(html`<p class="hint">${t('welcome.week.hint')}</p>`));

    el.querySelector('[data-finish]').onclick = () => finish({ save: true });
    el.querySelector('[data-demo]').onclick = () => finish({ save: true, demo: true });
    el.querySelector('[data-back]').onclick = () => go(1);
    return el;
  }

  /* Grava e sai. Se a gravacao falhar, NAO navega: o guard do router devolveria
   * pra ca, e a pessoa ficaria vendo a tela trocar sozinha. Fica aqui, com o
   * erro a vista, e o proximo toque tenta de novo. */
  async function finish({ save, demo = false }) {
    try {
      if (save) {
        await db.setSetting('profileName', cleanName(draft.name));
        await db.setSetting('unit', draft.unit);
        await db.setSetting('goalWorkoutsPerWeek', Number(draft.perWeek));
      }
      await db.setSetting('onboardedAt', new Date().toISOString());
    } catch (err) {
      console.error(err);
      toast(err?.message || String(err));
      return;
    }

    if (!demo) {
      location.hash = '#/';
      return;
    }
    await demoScreen();
  }

  /* A tela de "montando o exemplo": o progresso e desenhado aqui, e o erro ja
   * vem tratado do demo.js. Navega em qualquer caso — o carimbo do onboarding
   * ja foi gravado, e ficar nesta tela nao ofereceria saida nenhuma. */
  async function demoScreen() {
    root.innerHTML = '';
    const screen = node(html`
      <div class="welcome__screen welcome__screen--hero">
        <div class="welcome__hero">
          ${raw(MARK)}
          <p class="welcome__tagline">${t('demo.running')}</p>
          <p class="welcome__pitch" data-progress aria-live="polite"></p>
        </div>
      </div>
    `);
    root.append(screen);
    const line = screen.querySelector('[data-progress]');

    await runDemo({
      onProgress: (n, total) => { line.textContent = t('demo.progress', { n, total }); },
    });
    location.hash = '#/';
  }

  draw();
}

/** As opcoes do pickList se comportam como radio aqui: a escolha fica na tela,
 *  em vez de fechar uma folha. */
function wirePick(list, onPick) {
  const buttons = list.querySelectorAll('[data-v]');
  for (const button of buttons) {
    button.onclick = () => {
      for (const b of buttons) b.classList.toggle('pick__o--on', b === button);
      onPick(button.dataset.v);
    };
  }
}
