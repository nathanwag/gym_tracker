# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

**Anilha** — PWA de registro de treino (peso × reps por série, gráficos,
recordes). JavaScript puro, sem build, sem dependência de runtime, sem servidor.
`www/` é o app inteiro e também o `webDir` do Capacitor (empacota como
iOS/Android sem reescrever nada).

O app se chamava "Treino"; o nome de exibição vive em `APP_NAME` (`ui.js`), no
`<title>`/`apple-mobile-web-app-title` e no manifest. **Dois identificadores
persistidos ficaram com o nome antigo de propósito** e não podem mudar:
`DB_NAME = 'treino'` (`db.js`) e `FORMAT = 'treino-backup'` (`backup.js`) —
renomear o primeiro órfã o banco de todo mundo, e o segundo faz o app rejeitar
backups já exportados. Ambos têm comentário no código dizendo isso.

## Rodar o app

```bash
npm run dev      # browser-sync: live reload + URL de rede pro celular
```

Abre no Opera (se achar o executável; senão navegador padrão) em
`http://localhost:3000/phone` — app num iframe do tamanho de um celular;
`localhost:3000` direto = tamanho cheio. A *External URL* impressa
(`http://192.168.x.x:3000`) abre no celular na mesma WiFi, sem commit/push.
`bs-config.cjs` (raiz, fora de `www/`, não empacotado) é o config; `.cjs` porque
`package.json` é `type: module`. Duas rotas só de dev: `/phone` (viewport de
celular) e `/seed` (popula o IndexedDB local com treinos de exemplo — `js/db.js`/
`js/seed.js` reais; treino gerado leva `notes: 'seed'`; `/seed?auto` gera sozinho
ao abrir). IndexedDB é por navegador — a 1ª vez em cada um precisa passar no
`/seed`.

Fallback sem Node — `python -m http.server 8000 -d www`. Armadilha do
`http.server` padrão: não manda `Cache-Control` e responde `304` a
`If-Modified-Since`, então **uma mudança de CSS/JS pode não aparecer no reload**
(force refresh / DevTools "Disable cache"); é single-thread também. O `npm run
dev` não tem nenhum dos dois problemas.

O iOS só registra service worker sob HTTPS — teste de instalação/offline exige a
URL do GitHub Pages, não o IP da rede local (nem o `npm run dev`, que é `http://`).

## Testes

```bash
npm test                                        # node --test (todos os *.test.js)
node --test www/js/models.test.js               # um arquivo
node --test --test-name-pattern="unilateral"    # por nome
```

Testes ficam colados ao módulo (`models.test.js` ao lado de `models.js`). Só dá
pra testar módulos **puros** sob `node --test`: `models.js`, `text.js` e
`curve.js` não têm import nenhum. `seed.js`/`db.js`/`ui.js` puxam `i18n.js`, que
toca `location` no carregamento e quebra fora do browser. Para testar algo
desses, extraia a lógica pura pra um módulo sem dependência de DOM/IndexedDB —
é o que `text.js` (separado de `ui.js` porque `db.js` precisa dele numa
migração) e `curve.js` (separado de `charts.js`, que importa `ui.js`) fazem.

## Deploy e service worker

Deploy = push na `main`; `.github/workflows/pages.yml` publica `www/`. Trabalho é
trunk-based, commits direto na `main`.

**Toda alteração em arquivo de `www/` exige bumpar `VERSION` em `www/sw.js`**
(`anilha-vN` → `vN+1`). O cache do app é cache-first e versionado: sem o bump, o
PWA já instalado continua servindo os arquivos antigos. É o mecanismo de deploy.

Dois caches no SW, de propósito diferente:
- app (`anilha-vN`) — versionado, descartável, limpo no `activate`.
- mídia (`workout-media`) — **nunca** versionado nem apagado; são dezenas de MB de
  fotos baixadas aos poucos. O ramo de mídia no `fetch` tem que vir **antes** do
  genérico, senão as fotos caem no cache versionado e somem no deploy seguinte.

## Arquitetura

`app.js` faz bootstrap (abre banco, tema, idioma, registra SW) e roteia por hash
(`#/exercicios/12`). Cada rota chama `render(view, ...params)` de um arquivo em
`www/js/views/` (uma tela por arquivo). Views nunca abrem IndexedDB nem `.json`
direto — passam pelas camadas abaixo.

**Camadas de dados (isoladas para permitir trocar o backend sem tocar telas):**
- `db.js` — única a falar com IndexedDB. Stores: `exercises`, `workouts`, `sets`,
  `settings`, `exerciseImages`. `DB_VERSION` + `onupgradeneeded` com blocos
  `if (event.oldVersion < N)`. Migração tem que ser **100% síncrona** (WebKit
  encerra transação que fica ociosa — nada de `await` no meio). Helper `tx()`.
  A biblioteca de exercícios (~80 itens) fica em cache na memória; qualquer
  escrita invalida.
- `catalog.js` — única a ler `www/data/`. O catálogo (873 exercícios,
  `catalogo.json`) é imutável e igual em todo aparelho, então **não** é copiado
  pro banco: o IndexedDB guarda só os exercícios que o usuário escolheu. Cache
  imutável, nunca invalidado.
- `backup.js` — export/import do banco em JSON. No iOS usa `navigator.share`
  (um `<a download>` não funciona dentro de PWA instalado).

**Valores gravados são sempre em português** (ex.: `muscleGroup: 'Peito'`) e vêm
do catálogo. Só a exibição traduz: `groupLabel()` (seed.js), `displayName()`
(catalog.js). `MUSCLE_GROUPS` em `seed.js` é a lista canônica — `grupo`/
`primarios`/`secundarios` do catálogo e `ICON_GROUPS` em `ui.js` têm que casar
com ela. `catalogo.json`/`instrucoes.json` são dados commitados editados à mão
(os geradores não estão mais no repo).

**`slug`** liga um exercício às fotos em `www/img/ex/` e à entrada do catálogo.
É estável (ao contrário do `id` autoincremento e do `name` com acento editável).
`slug: null` é válido (exercício sem figura). `slugByName()` reencontra o slug de
exercícios criados antes do catálogo existir.

**`models.js`** — puro. Recordes e métricas são **sempre recalculados** das
séries, nunca gravados — editar/apagar uma série não deixa PR fantasma. 1RM por
Epley (`peso × (1 + reps/30)`). Séries de aquecimento ficam fora de tudo. Série
unilateral guarda `repsLeft`/`repsRight` em vez de `reps`.

**Identidade visual (direção "Anilha")** — está em [`DESIGN.md`](DESIGN.md):
paleta, escala de tipo, vocabulário de componentes e as peças de UI que não
devem ser duplicadas. **Leia antes de mexer em `styles.css` ou em qualquer
tela.** O que quebra o app, e por isso fica aqui:

- **`groupColor()` tem que ficar acima de `ICON_GROUPS`** em `ui.js`: os ícones
  chamam ela na inicialização do módulo, e `const` usada antes da declaração
  derruba o app no carregamento — não num teste. As chaves de cor e de ícone
  têm que casar com `MUSCLE_GROUPS` (`seed.js`).
- **Os 3 `woff2` da Barlow Condensed** (`www/fonts/`, estáticos — a família não
  é variável) precisam estar no `ASSETS` do `sw.js`, senão a tipografia quebra
  offline.
- **O cartão de compartilhar repete a paleta em hex** (`GROUP_COLORS` em
  `share-image.js`): canvas não resolve `var()`, e o cartão é sempre escuro
  mesmo com o app no tema claro.

**`i18n.js`** — `t()`/`tn()`; `language()` lê síncrono de `db.settings()`.
Dicionário em `i18n-strings.js` (PT/EN, chaves planas com namespace por ponto).
O que não tem PT aparece em inglês com selo `EN` — estado suportado.

**`ui.js`** — `html`/`raw`/`node`: tagged template que **escapa toda interpolação
por padrão** (nome de exercício e nota são digitados pelo usuário); `raw()` para
injetar HTML de propósito. Também `setTop`, toast, bottom sheet, formatadores
Intl. `refresh()` e `goBack()` disparam eventos em `window` em vez de importar
`app.js` — senão vira ciclo de módulos (app.js importa as views).

**`media.js`** — `MEDIA_CACHE` é string duplicada com `sw.js` de propósito (o SW
é clássico, sem `type: module`, não pode importar daqui).

## Regras que mantêm o projeto empacotável

Não são estilo — cada uma quebra o app no WebView do Capacitor ou no GitHub Pages:

1. **Caminhos sempre relativos** (`./js/app.js`, `./img/...`). Pages serve de
   `/repo/`, Capacitor de origem local; caminho absoluto quebra nos dois.
2. **Roteamento por hash** — dispensa config de servidor.
3. **Zero requisição externa** — nenhum CDN, fonte remota, analytics. Fotos são
   arquivos locais em `www/img/`.
4. **`font-size: 16px` nos inputs** — senão o Safari dá zoom ao focar.
5. **Safe areas** (`env(safe-area-inset-*)`) para Dynamic Island e barra de gestos.
