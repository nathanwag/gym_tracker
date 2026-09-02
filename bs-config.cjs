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
exemplo — 6 semanas de push/pull/legs com carga progressiva, pra ver o app com
histórico, gráficos e recordes — e os três modelos desse mesmo plano, pra ver a
aba Modelos. Só dev; não vai pro app publicado.</p>
<button class="primary" id="seed">Gerar 6 semanas de treino + 3 modelos</button>
<button id="clear">Apagar treinos e modelos gerados</button>
<p><a href="/phone">← voltar ao app</a></p>
<div id="log"></div>
<script type="module">
import * as db from '/js/db.js';
import { SEED_EXERCISES } from '/js/seed.js';

const out = document.getElementById('log');
const log = (m) => { out.textContent += m + '\\n'; };
const MARK = 'seed'; // workout.notes; invisível na UI, serve pra "apagar gerados"

// [dia, grupo, nome (de SEED_EXERCISES), carga inicial, incremento/semana]
const PLAN = [
  ['push', 'Peito',       'Supino reto com barra',        60, 2.5],
  ['push', 'Ombros',      'Desenvolvimento com halteres', 20, 1  ],
  ['push', 'Tríceps',     'Tríceps na polia (corda)',     25, 1.5],
  ['pull', 'Costas',      'Puxada frontal (pulley)',      45, 2.5],
  ['pull', 'Costas',      'Remada curvada com barra',     50, 2.5],
  ['pull', 'Bíceps',      'Rosca direta com barra',       30, 1  ],
  ['legs', 'Quadríceps',  'Agachamento livre',            80, 5  ],
  ['legs', 'Posterior',   'Levantamento terra romeno',    70, 5  ],
  ['legs', 'Panturrilha', 'Panturrilha em pé',            90, 2.5],
];
const DAYS = ['push', 'pull', 'legs'];
// Nome do modelo de cada dia. Em portugues como todo valor gravado no banco.
const DAY_NAME = { push: 'Empurrar', pull: 'Puxar', legs: 'Pernas' };
const DAY_OFFSET = { push: 4, pull: 2, legs: 0 }; // dias atrás dentro da semana
const WEEKS = 6;
const REPS = [10, 9, 8];

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

document.getElementById('seed').onclick = async (e) => {
  e.target.disabled = true;
  out.textContent = '';
  try {
    await db.init();
    const ids = await ensureExercises();
    log(ids.size + ' exercícios prontos.');
    log(await ensureTemplates(ids) + ' modelos criados (' + DAYS.map((d) => DAY_NAME[d]).join(', ') + ').');
    let made = 0;
    for (let w = 0; w < WEEKS; w++) {
      for (const day of DAYS) {
        const when = new Date();
        when.setDate(when.getDate() - (WEEKS - 1 - w) * 7 - DAY_OFFSET[day]);
        when.setHours(18, 30, 0, 0);
        const started = when.toISOString();
        const finished = new Date(when.getTime() + 55 * 60000).toISOString();
        const workout = await db.startWorkout();
        const order = [];
        for (const [, group, name, base, step] of PLAN.filter(([d]) => d === day)) {
          const exId = ids.get(name);
          order.push(exId);
          const weight = base + step * w;
          await db.addSet({ workoutId: workout.id, exerciseId: exId, weight: Math.round(weight * 0.5), reps: 12, warmup: true });
          for (const reps of REPS) await db.addSet({ workoutId: workout.id, exerciseId: exId, weight, reps });
        }
        await db.updateWorkout(workout.id, {
          date: started.slice(0, 10), startedAt: started, finishedAt: finished,
          exerciseIds: order, notes: MARK,
        });
        made++;
        log('treino ' + made + '/' + (WEEKS * DAYS.length));
      }
    }
    log('\\nPronto. Abra o app → Histórico, e Exercícios → Modelos.');
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
    const mine = (await db.listWorkouts()).filter((w) => w.notes === MARK);
    for (const w of mine) await db.deleteWorkout(w.id);
    const names = new Set(DAYS.map((d) => DAY_NAME[d]));
    const tpls = (await db.listTemplates()).filter((t) => names.has(t.name));
    for (const t of tpls) await db.deleteTemplate(t.id);
    log(mine.length + ' treinos e ' + tpls.length + ' modelos gerados apagados (exercícios mantidos).');
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
