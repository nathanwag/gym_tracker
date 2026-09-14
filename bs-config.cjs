// Servidor de dev (npm run dev): serve www/ com live reload. O browser-sync ja
// escuta em todas as interfaces e imprime uma "External URL" (http://192.168.x.x)
// — o celular na mesma WiFi abre essa, sem commit/push. Fica fora de www/, entao
// nao e empacotado pelo Capacitor (webDir: www) nem publicado no Pages (path: www).
//
// Precisa ser .cjs: package.json tem "type": "module" e o config e CommonJS.
//
// Duas paginas so de dev, servidas por middleware (nao existem em www/):
//   /phone  — mostra o app num iframe do tamanho de um celular. localhost:3000
//             direto = tamanho cheio. O service worker nao registra em http://
//             (isSecureContext falso) — de proposito; instalacao/offline
//             continuam sendo testados no GitHub Pages.
//   /seed   — popula o IndexedDB local com treinos de exemplo pra ver o app
//             com historico, e com os tres modelos de treino do mesmo plano.
//             Usa os modulos reais (js/db.js, js/seed.js).
//
// Abre no Opera (se achar o executavel) e ja em /phone. Cada navegador tem seu
// proprio IndexedDB, entao a primeira vez em cada um: abrir /seed e clicar.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OPERA = [
  path.join(os.homedir(), 'AppData/Local/Programs/Opera/opera.exe'),
  path.join(os.homedir(), 'AppData/Local/Programs/Opera GX/opera.exe'),
  'C:/Program Files/Opera/launcher.exe',
  '/Applications/Opera.app/Contents/MacOS/Opera',
  '/usr/bin/opera',
].find((p) => { try { return fs.existsSync(p); } catch { return false; } });

const PHONE = `<!doctype html><meta charset="utf-8">
<title>Treino — moldura</title>
<style>
  html,body{margin:0;height:100%;background:#0f1115;display:grid;place-items:center}
  iframe{width:390px;height:844px;border:0;border-radius:24px;
         box-shadow:0 0 0 10px #1b1e27, 0 20px 60px #0008}
</style>
<iframe src="/index.html#/"></iframe>`;

const SEED = `<!doctype html><meta charset="utf-8">
<title>Treino — seed de histórico</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1.25rem;
       background:#0f1115;color:#e8eaed;line-height:1.55}
  h1{font-size:1.25rem}
  button{font:inherit;padding:.55rem 1rem;border-radius:8px;border:1px solid #333;
         background:#1b1e27;color:inherit;cursor:pointer;margin:.4rem .4rem 0 0}
  button.primary{background:#3b82f6;border-color:#3b82f6;color:#fff}
  button:disabled{opacity:.5;cursor:progress}
  code{background:#1b1e27;padding:.1em .35em;border-radius:4px}
  #log{white-space:pre-wrap;margin-top:1rem;font-family:ui-monospace,monospace;
       font-size:.85rem;color:#9aa0a6}
  a{color:#8ab4f8}
</style>
<h1>Seed de histórico</h1>
<p>Popula o IndexedDB local (<code>treino</code>) deste navegador com treinos de
exemplo — 12 semanas de push/pull/legs com carga progressiva — e os três modelos
desse mesmo plano. Cada grupo recebe um número diferente de sessões de propósito,
pra que o Progresso mostre os estados dele lado a lado: índice firme (Peito 12,
Ombros 8, Costas 6), índice raso e listrado (Panturrilha 5, Posterior 4,
Quadríceps 3, Tríceps 2), sem índice nenhum (Bíceps, 1 sessão) e grupo com
exercício mas nenhuma sessão (Abdômen). Só dev; não vai pro app publicado.</p>
<button class="primary" id="seed">Gerar histórico de exemplo + 3 modelos</button>
<button id="clear">Apagar treinos e modelos gerados</button>
<p><a href="/phone">← voltar ao app</a></p>
<div id="log"></div>
<script type="module">
import * as db from '/js/db.js';
import { SEED_EXERCISES } from '/js/seed.js';

const out = document.getElementById('log');
const log = (m) => { out.textContent += m + '\\n'; };
const MARK = 'seed'; // workout.notes; invisível na UI, serve pra "apagar gerados"

// [dia, grupo, nome (de SEED_EXERCISES), carga inicial, incremento/sessao,
//  sessoes, forma]
//
// sessoes e quantas vezes o exercicio aparece, contadas do fim pra tras (12 =
// todas as semanas, 1 = so a ultima, 0 = existe na biblioteca e nunca foi
// treinado). E o que poe cada grupo num estado diferente do Progresso, que e o
// ponto deste seed — ver os estados um do lado do outro na mesma tela:
//   12, 8 — indice firme, janelas cheias
//    6    — firme, exatamente em SESSIONS_FOR_FIRM_INDEX (models.js)
//    5..2 — indice raso: barra listrada, ponto no numero, "N de 6"
//    1    — groupIndex() devolve null; nao ha contra o que comparar
//    0    — grupo sem sessao (Abdômen tem exercicio; Lombar e cia. nem isso)
//
// A "forma" existe pro Progresso ter o que mostrar: com todo exercicio subindo
// linear, o indice por grupo sai chapado em ~110 e a tela nao prova nada. As
// fases sao relativas ao proprio numero de sessoes — com um teto fixo, quem tem
// 3 sessoes nunca chegaria na fase final.
//   linear — sobe toda sessao, 3 series (o caso comum)
//   stall  — para de subir na metade e perde uma serie no fim
//            (indice bem abaixo de 100: o grupo que precisa de atencao)
//   surge  — ganha uma serie no fim (indice bem acima de 100)
const PLAN = [
  ['push', 'Peito',       'Supino reto com barra',        60, 2.5, 12, 'linear'],
  ['push', 'Ombros',      'Desenvolvimento com halteres', 20, 1,    8, 'surge' ],
  ['push', 'Tríceps',     'Tríceps na polia (corda)',     25, 1.5,  2, 'linear'],
  ['pull', 'Costas',      'Puxada frontal (pulley)',      45, 2.5,  6, 'stall' ],
  ['pull', 'Costas',      'Remada curvada com barra',     50, 2.5,  6, 'linear'],
  ['pull', 'Bíceps',      'Rosca direta com barra',       30, 1,    1, 'linear'],
  ['legs', 'Quadríceps',  'Agachamento livre',            80, 5,    3, 'linear'],
  ['legs', 'Posterior',   'Levantamento terra romeno',    70, 5,    4, 'stall' ],
  ['legs', 'Panturrilha', 'Panturrilha em pé',            90, 2.5,  5, 'linear'],
  ['legs', 'Abdômen',     'Abdominal supra',              20, 2.5,  0, 'linear'],
];
const LATE_SESSIONS = 3; // teto de sessoes finais que mudam o numero de series
const DAYS = ['push', 'pull', 'legs'];
// Nome do modelo de cada dia. Em portugues como todo valor gravado no banco.
const DAY_NAME = { push: 'Empurrar', pull: 'Puxar', legs: 'Pernas' };
const DAY_OFFSET = { push: 4, pull: 2, legs: 0 }; // dias atrás dentro da semana
const WEEKS = 12; // o calendario; quanto dele cada exercicio usa e o sessoes
const REPS = [10, 9, 8];

/** Em que sessao do exercicio a semana w cai; negativo antes da primeira.
 *  Contar do fim pra tras e o que faz todo grupo terminar na semana de hoje. */
const sessionIndex = (w, sessions) => w - (WEEKS - sessions);

/** Quantas sessoes finais mudam de numero de series. Nunca mais que a metade:
 *  com 3 sessoes, um late de 3 deixaria o exercicio sem fase inicial. */
const lateCount = (sessions) => Math.min(LATE_SESSIONS, Math.floor(sessions / 2));

/** Quantos treinos o plano gera. Como toda janela de sessoes termina na ultima
 *  semana, o dia acontece tantas vezes quanto o maior sessoes dele. */
const TOTAL_WORKOUTS = DAYS.reduce((n, day) => n + Math.max(
  0, ...PLAN.filter(([d]) => d === day).map(([, , , , , s]) => s)), 0);

const slugFor = (group, name) =>
  (SEED_EXERCISES[group] || []).find((e) => e.name === name)?.slug ?? null;

async function ensureExercises() {
  const ids = new Map();
  for (const [, group, name] of PLAN) {
    if (ids.has(name)) continue;
    const r = await db.addExercise({ name, muscleGroup: group, slug: slugFor(group, name), custom: false });
    ids.set(name, r.id);
  }
  return ids;
}

/** Um modelo por dia do plano, na mesma ordem de exercicios que o treino usa.
 *  Idempotente pelo nome: rodar o seed duas vezes nao duplica. */
async function ensureTemplates(ids) {
  const existing = new Map((await db.listTemplates()).map((t) => [t.name, t]));
  let made = 0;
  for (const day of DAYS) {
    const name = DAY_NAME[day];
    const exerciseIds = PLAN.filter(([d]) => d === day).map(([, , n]) => ids.get(n));
    const tpl = existing.get(name) || await db.addTemplate(name);
    await db.updateTemplate(tpl.id, { exerciseIds });
    if (!existing.has(name)) made++;
  }
  return made;
}

/** Apaga so os treinos que este seed gerou (workout.notes === MARK). Gerar
 *  chama isto antes: sem limpar, rodar o seed duas vezes empilha dois
 *  historicos e nenhum grupo cai no estado que o PLAN desenhou. */
async function clearGeneratedWorkouts() {
  const mine = (await db.listWorkouts()).filter((w) => w.notes === MARK);
  for (const w of mine) await db.deleteWorkout(w.id);
  return mine.length;
}

document.getElementById('seed').onclick = async (e) => {
  e.target.disabled = true;
  out.textContent = '';
  try {
    await db.init();
    const gone = await clearGeneratedWorkouts();
    if (gone) log(gone + ' treinos gerados antes foram apagados.');
    const ids = await ensureExercises();
    log(ids.size + ' exercícios prontos.');
    log(await ensureTemplates(ids) + ' modelos criados (' + DAYS.map((d) => DAY_NAME[d]).join(', ') + ').');
    let made = 0;
    for (let w = 0; w < WEEKS; w++) {
      for (const day of DAYS) {
        // So os exercicios que ja tinham comecado nesta semana. Sem nenhum, o
        // dia nao aconteceu: gravar treino vazio sujaria o historico.
        const doing = PLAN.filter(([d, , , , , sessions]) => d === day && sessionIndex(w, sessions) >= 0);
        if (!doing.length) continue;
        const when = new Date();
        when.setDate(when.getDate() - (WEEKS - 1 - w) * 7 - DAY_OFFSET[day]);
        when.setHours(18, 30, 0, 0);
        const started = when.toISOString();
        const finished = new Date(when.getTime() + 55 * 60000).toISOString();
        const workout = await db.startWorkout();
        const order = [];
        for (const [, group, name, base, step, sessions, shape] of doing) {
          const exId = ids.get(name);
          order.push(exId);
          const k = sessionIndex(w, sessions);
          const late = k >= sessions - lateCount(sessions);
          const progressed = shape === 'stall' ? Math.min(k, Math.ceil(sessions / 2)) : k;
          const weight = base + step * progressed;
          const reps = (shape === 'stall' && late) ? REPS.slice(0, 2)
            : (shape === 'surge' && late) ? REPS.concat(8)
              : REPS;
          await db.addSet({ workoutId: workout.id, exerciseId: exId, weight: Math.round(weight * 0.5), reps: 12, warmup: true });
          for (const r of reps) await db.addSet({ workoutId: workout.id, exerciseId: exId, weight, reps: r });
        }
        await db.updateWorkout(workout.id, {
          date: started.slice(0, 10), startedAt: started, finishedAt: finished,
          exerciseIds: order, notes: MARK,
        });
        made++;
        log('treino ' + made + '/' + TOTAL_WORKOUTS);
      }
    }
    log('\\nPronto. Abra o app → Progresso, e Treino → Modelos.');
  } catch (err) {
    log('ERRO: ' + (err && err.message || err));
  } finally {
    e.target.disabled = false;
  }
};

document.getElementById('clear').onclick = async (e) => {
  e.target.disabled = true;
  out.textContent = '';
  try {
    await db.init();
    const workouts = await clearGeneratedWorkouts();
    const names = new Set(DAYS.map((d) => DAY_NAME[d]));
    const tpls = (await db.listTemplates()).filter((t) => names.has(t.name));
    for (const t of tpls) await db.deleteTemplate(t.id);
    log(workouts + ' treinos e ' + tpls.length + ' modelos gerados apagados (exercícios mantidos).');
  } catch (err) {
    log('ERRO: ' + (err && err.message || err));
  } finally {
    e.target.disabled = false;
  }
};

// /seed?auto — dispara o seed sozinho ao abrir (pra popular um navegador novo
// sem clique).
if (new URLSearchParams(location.search).has('auto')) {
  document.getElementById('seed').click();
}
</script>`;

const PAGES = {
  '/phone': PHONE,
  '/seed': SEED,
};

module.exports = {
  server: {
    baseDir: 'www',
    middleware: [
      (req, res, next) => {
        const page = PAGES[req.url.split('?')[0].replace(/\/$/, '')];
        if (page) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(page);
        }
        next();
      },
    ],
  },
  files: 'www/**/*',
  startPath: '/phone',           // abre no formato de celular
  open: 'local',
  browser: OPERA || 'default',   // Opera se achou; senao navegador padrao do SO
  ghostMode: false, // nao espelhar clique/scroll entre desktop e celular
  notify: false,
  ui: false,
};
