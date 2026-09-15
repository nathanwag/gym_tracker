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
//             com historico, e com os tres modelos do mesmo plano.
//
// O /seed NAO tem plano proprio: ele dirige js/demo.js, o mesmo modulo que o
// app publica no modo demonstracao. O plano em si mora em js/demo-plan.js, que
// e puro e testado. Enquanto essas ~150 linhas viviam aqui dentro, elas nao
// tinham teste nenhum e o app nao podia reusa-las.
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
<title>Anilha — moldura</title>
<style>
  html,body{margin:0;height:100%;background:#0f1115;display:grid;place-items:center}
  iframe{width:390px;height:844px;border:0;border-radius:24px;
         box-shadow:0 0 0 10px #1b1e27, 0 20px 60px #0008}
</style>
<iframe src="/index.html#/"></iframe>`;

const SEED = `<!doctype html><meta charset="utf-8">
<title>Anilha — seed de histórico</title>
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
exercício mas nenhuma sessão (Abdômen).</p>
<p>É o mesmo <code>js/demo.js</code> do modo demonstração do app: o que você vê
aqui é o que o usuário vê ao escolher "ver com dados de exemplo" nas boas-vindas.
O plano está em <code>js/demo-plan.js</code> e tem teste — <code>node --test
www/js/demo-plan.test.js</code>.</p>
<button class="primary" id="seed">Gerar histórico de exemplo + 3 modelos</button>
<button id="clear">Apagar o que o exemplo criou</button>
<p><a href="/phone">← voltar ao app</a></p>
<div id="log"></div>
<script type="module">
import * as db from '/js/db.js';
import { generateDemo, clearDemo } from '/js/demo.js';

const out = document.getElementById('log');
const log = (m) => { out.textContent += m + '\\n'; };

async function run(button, fn) {
  button.disabled = true;
  out.textContent = '';
  try {
    await db.init();
    await db.getSettings();
    await fn();
  } catch (err) {
    log('ERRO: ' + (err && err.message || err));
  } finally {
    button.disabled = false;
  }
}

document.getElementById('seed').onclick = (e) => run(e.target, async () => {
  // Limpa antes: sem isso, rodar o seed duas vezes empilha dois historicos e
  // nenhum grupo cai no estado que o plano desenhou.
  await clearDemo();
  await generateDemo({
    onProgress: (n, total) => { log('treino ' + n + '/' + total); },
  });
  log('\\nPronto. Abra o app → Progresso, e Exercícios → Modelos.');
});

document.getElementById('clear').onclick = (e) => run(e.target, async () => {
  await clearDemo();
  log('Apagados os treinos, modelos e exercícios que o exemplo criou.');
  log('Exercício com série de treino seu é mantido de propósito.');
});

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
