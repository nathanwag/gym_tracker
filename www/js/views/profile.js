/* Perfil: quem voce e, o que voce ja fez, o que voce quer fazer.
 *
 * Era a aba "Voce", que juntava backup, figuras, ajustes e versao numa
 * rolagem so. O que sobrou aqui responde uma pergunta que nenhuma outra tela
 * responde — quanto voce ja fez DESDE O COMECO; o Inicio so fala da semana.
 *
 * Configuracoes vive na engrenagem da topbar, e nao numa linha: e o padrao de
 * app com aba de perfil, e devolve a lista pro que e seu.
 *
 * Volume total em kg NAO entra aqui de proposito: quilo so compara dentro do
 * mesmo grupo muscular (ver DESIGN.md), entao um acumulado somaria agachamento
 * com rosca direta e mediria so se voce treina perna. */

import * as db from '../db.js';
import { workingSets, allPrIds } from '../models.js';
import { initials, daysSince, parseGoal } from '../profile.js';
import { t, tn } from '../i18n.js';
import {
  setTop, html, raw, node, toast, openSheet, closeSheet, onSheetClose,
  pickerRow, infoRow, numberSheet, fmtNum, fmtMonthYear, ICON, APP_NAME,
} from '../ui.js';

// Sem ficha nas lojas ainda: as duas primeiras abrem quando existirem, a de
// suporte e um e-mail. Trocar aqui e o unico passo pra elas ficarem vivas.
const STORE_URL = '';
const PRIVACY_URL = '';
const SUPPORT_EMAIL = '';

export async function render(view) {
  setTop({
    title: t('profile.title'),
    actions: `<button class="icon-btn" type="button" data-settings aria-label="${t('settings.title')}">${ICON.gear}</button>`,
  });
  document.querySelector('[data-settings]').onclick = () => { location.hash = '#/ajustes'; };

  const [workouts, sets, weights] = await Promise.all([
    db.listWorkouts(),
    db.listAllSets(),
    db.listBodyWeights(),
  ]);

  const cfg = db.settings();
  const root = node('<div class="stack"></div>');

  root.append(identityRow(cfg, workouts));
  root.append(statsBlock(workouts, sets));
  root.append(goalsSection(cfg, weights));
  root.append(backupRow());
  root.append(aboutSection());

  view.append(root);
}

/* ---------- Identidade ----------
 * "Treinando desde" nao e campo: sai da data do primeiro treino. Deixar
 * editavel seria pedir pra pessoa manter sincronizado a mao um dado que o app
 * ja sabe. */

function identityRow(cfg, workouts) {
  const since = firstWorkoutDate(workouts);
  const row = node(html`
    <button type="button" class="set-row set-row--tap phead">
      <span class="phead__id">
        <span class="avatar" data-avatar>${cfg.profilePhoto ? raw(`<img src="${cfg.profilePhoto}" alt="">`) : initials(cfg.profileName)}</span>
        <span class="phead__text">
          <span class="phead__name" data-name>${cfg.profileName || t('profile.noName')}</span>
          <span class="phead__since">${since ? t('profile.since', { when: fmtMonthYear(since) }) : t('profile.sinceEmpty')}</span>
        </span>
      </span>
      <span class="set-row__v">${raw(ICON.chevron)}</span>
    </button>
  `);

  row.onclick = async () => {
    const saved = await editSheet(cfg);
    if (!saved) return;
    row.querySelector('[data-name]').textContent = saved.name || t('profile.noName');
    const avatar = row.querySelector('[data-avatar]');
    if (saved.photo) avatar.innerHTML = html`<img src="${saved.photo}" alt="">`;
    else avatar.textContent = initials(saved.name);
    toast(t('profile.toastSaved'));
  };
  return row;
}

const firstWorkoutDate = (workouts) => workouts
  .filter((w) => w.finishedAt)
  .map((w) => w.date)
  .sort()[0] || null;

/** Folha de editar perfil. Resolve com {name, photo} quando salvou, ou null. */
function editSheet(cfg) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };

    const body = node(html`
      <div class="stack">
        <div class="pedit">
          <span class="avatar avatar--lg" data-avatar>${cfg.profilePhoto ? raw(`<img src="${cfg.profilePhoto}" alt="">`) : initials(cfg.profileName)}</span>
          <div class="stack">
            <button type="button" class="btn btn--sm" data-pick>${t('profile.choosePhoto')}</button>
            <span class="muted small">${t('profile.photoLocal')}</span>
          </div>
        </div>
        <input type="file" accept="image/*" data-file hidden>

        <label class="field">
          <span class="field__label">${t('profile.name')}</span>
          <input class="input" data-name value="${cfg.profileName}" autocapitalize="words" enterkeyhint="done">
        </label>

        <button type="button" class="btn btn--primary btn--block" data-save>${t('common.save')}</button>
      </div>
    `);
    openSheet(t('profile.editTitle'), body);
    onSheetClose(() => finish(null));

    const file = body.querySelector('[data-file]');
    const avatar = body.querySelector('[data-avatar]');
    let photo = cfg.profilePhoto;

    body.querySelector('[data-pick]').onclick = () => file.click();
    file.onchange = async () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen) return;
      try {
        photo = await squareDataUrl(chosen);
        avatar.innerHTML = html`<img src="${photo}" alt="">`;
      } catch {
        toast(t('profile.photoFailed'));
      }
    };

    const save = async () => {
      const name = body.querySelector('[data-name]').value.trim();
      await db.setSetting('profileName', name);
      await db.setSetting('profilePhoto', photo);
      finish({ name, photo });
      closeSheet();
    };
    body.querySelector('[data-save]').onclick = save;
    body.querySelector('[data-name]').onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      save();
    };
  });
}

/* A foto vira data URL de 256 px, e nao Blob: o backup e um arquivo JSON, e
 * Blob nao sobrevive a JSON.stringify (mesmo motivo das figuras em backup.js).
 * O recorte quadrado evita guardar uma foto de 4 MB pra um circulo de 40 px. */
const AVATAR_SIZE = 256;

function squareDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      canvas.getContext('2d').drawImage(
        img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem invalida')); };
    img.src = url;
  });
}

/* ---------- Numeros ----------
 * Tres colunas com filete entre elas, e nao tres linhas: aqui eles sao um
 * bloco so, o que ancora a tela antes das listas. Serie de aquecimento fica
 * de fora da contagem, como em todo o resto do app. */

function statsBlock(workouts, sets) {
  const done = workouts.filter((w) => w.finishedAt).length;
  const total = workingSets(sets).length;
  const prs = allPrIds(sets).size;

  return node(html`
    <div class="pstats">
      <div class="pstats__c">
        <span class="data">${fmtNum(done)}</span>
        <span class="tag">${tn('profile.stat.workouts', done)}</span>
      </div>
      <div class="pstats__c">
        <span class="data">${fmtNum(total)}</span>
        <span class="tag">${tn('profile.stat.sets', total)}</span>
      </div>
      <div class="pstats__c">
        <span class="data pstats__pr">${fmtNum(prs)}</span>
        <span class="tag">${tn('profile.stat.prs', prs)}</span>
      </div>
    </div>
  `);
}

/* ---------- Metas e corpo ----------
 * A meta de series por grupo era uma constante em views/home.js: a barra da
 * semana tinha uma referencia que ninguem podia mexer. Peso corporal fica no
 * mesmo grupo por ser sobre voce, mas nao e meta — por isso a linha leva pra
 * tela dele, e nao abre uma lista de valores. */

const SETS_GOAL_MIN = 1;
const SETS_GOAL_MAX = 30;

function setsGoalRow(value) {
  let current = Number(value);
  let row = null;

  row = infoRow(t('profile.goal.sets'), String(current), async () => {
    const typed = await numberSheet({
      title: t('profile.goal.sets'),
      label: t('profile.goal.setsField'),
      value: String(current),
      hint: t('profile.goal.setsHint', { min: SETS_GOAL_MIN, max: SETS_GOAL_MAX }),
      parse: (text) => parseGoal(text, SETS_GOAL_MIN, SETS_GOAL_MAX),
    });
    if (typed == null || typed === current) return;

    current = typed;
    row.querySelector('[data-value]').textContent = String(current);
    await db.setSetting('goalSetsPerGroup', current);
    toast(t('profile.goal.toast'));
  });

  return row;
}

function goalsSection(cfg, weights) {
  const workoutGoal = pickerRow(
    t('profile.goal.workouts'),
    [2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })),
    cfg.goalWorkoutsPerWeek,
    async (value) => {
      await db.setSetting('goalWorkoutsPerWeek', Number(value));
      toast(t('profile.goal.toast'));
    },
  );

  // Numero, e nao escolha entre poucos: uma lista de 6/8/10/12 deixa de fora
  // quem faz 9 ou 11, e o intervalo util aqui vai de 1 a 30. Mesma decisao do
  // passo do peso — a linha abre o campo, e por isso leva chevron, nao a seta
  // pra baixo (ver DESIGN.md).
  const setsGoal = setsGoalRow(cfg.goalSetsPerGroup);

  const last = [...weights].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
  const days = last ? daysSince(last.date) : null;
  const weight = infoRow(
    t('profile.bodyWeight'),
    last ? `${fmtNum(last.weight, 1)} ${cfg.unit}` : t('profile.bodyWeightEmpty'),
    () => { location.hash = '#/peso'; },
    {
      hint: last
        ? t('profile.bodyWeightHint', {
          n: tn('profile.measurements', weights.length),
          when: days === 0 ? t('common.today').toLowerCase() : tn('common.daysAgo', days),
        })
        : t('profile.bodyWeightHintEmpty'),
    },
  );

  return section(t('profile.section.goals'), workoutGoal, setsGoal, weight);
}

/* ---------- Sobre o app ----------
 * Privacidade e suporte nao sao enfeite: as lojas exigem os dois na ficha, e
 * quem procura procura no perfil. Avaliar e compartilhar vivem junto porque
 * sao a mesma pergunta ("gostou?"), feita de dois jeitos. */

/* Backup sobe pro primeiro nivel do Perfil: estava a tres niveis de distancia
 * (Perfil > Configuracoes > Backup) sendo a unica defesa contra perder tudo.
 * Ajustes continua na engrenagem da topbar — sem linha aqui, porque duas
 * portas pro mesmo lugar e o que faz a pessoa nao achar nenhuma.
 *
 * Sem cabecalho de secao: uma linha so nao merece um. */
function backupRow() {
  const row = node('<div style="margin-top:22px"></div>');
  row.append(infoRow(t('backup.title'), '', () => { location.hash = '#/backup'; },
    { hint: t('profile.backupHint') }));
  return row;
}

function aboutSection() {
  const rate = infoRow(t('profile.about.rate'), '', () => openExternal(STORE_URL));
  const share = infoRow(t('profile.about.share'), '', shareApp);
  const support = infoRow(t('profile.about.support'), '', () => {
    if (!SUPPORT_EMAIL) return toast(t('profile.about.soon'));
    return openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(APP_NAME)}`);
  }, { hint: t('profile.about.supportHint') });
  const privacy = infoRow(t('profile.about.privacy'), '', () => openExternal(PRIVACY_URL));

  return section(t('profile.section.about'), rate, share, support, privacy);
}

function openExternal(url) {
  // Enquanto a ficha nao existe, o toast e honesto: melhor que abrir uma aba
  // em branco ou uma loja que ainda nao tem o app.
  if (!url) return toast(t('profile.about.soon'));
  return window.open(url, '_blank', 'noopener');
}

async function shareApp() {
  const text = t('profile.about.shareText');
  try {
    if (navigator.share) {
      await navigator.share({ title: APP_NAME, text, url: STORE_URL || location.origin });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${STORE_URL || location.origin}`);
    toast(t('profile.about.shareCopied'));
  } catch { /* folha cancelada pelo usuario */ }
}

function section(title, ...content) {
  const el = node(`<div class="sec"><h2 class="section-title">${title}</h2><div data-body></div></div>`);
  el.querySelector('[data-body]').append(...content);
  return el;
}
