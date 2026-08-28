// Servidor de dev (npm run dev): serve www/ com live reload. O browser-sync ja
// escuta em todas as interfaces e imprime uma "External URL" (http://192.168.x.x)
// — o celular na mesma WiFi abre essa, sem commit/push. Fica fora de www/, entao
// nao e empacotado pelo Capacitor (webDir: www) nem publicado no Pages (path: www).
//
// Precisa ser .cjs: package.json tem "type": "module" e o config e CommonJS.
//
// A rota /phone e so um atalho de visualizacao no desktop: mostra o app num
// iframe do tamanho de um celular. localhost:3000 direto = tamanho cheio.
// O service worker nao registra em http:// (isSecureContext falso) — de
// proposito; instalacao/offline continuam sendo testados no GitHub Pages.

const PHONE = `<!doctype html><meta charset="utf-8">
<title>Treino — moldura</title>
<style>
  html,body{margin:0;height:100%;background:#0f1115;display:grid;place-items:center}
  iframe{width:390px;height:844px;border:0;border-radius:24px;
         box-shadow:0 0 0 10px #1b1e27, 0 20px 60px #0008}
</style>
<iframe src="/index.html#/"></iframe>`;

module.exports = {
  server: {
    baseDir: 'www',
    middleware: [
      (req, res, next) => {
        if (req.url.replace(/\/$/, '') === '/phone') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(PHONE);
        }
        next();
      },
    ],
  },
  files: 'www/**/*',
  startPath: '/phone',
  open: 'local',
  ghostMode: false, // nao espelhar clique/scroll entre desktop e celular
  notify: false,
  ui: false,
};
