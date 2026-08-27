# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

PWA de registro de treino (peso × reps por série, gráficos, recordes). JavaScript
puro, sem build, sem dependência de runtime, sem servidor. `www/` é o app inteiro
e também o `webDir` do Capacitor (empacota como iOS/Android sem reescrever nada).

## Rodar o app

Não há script de dev nem servidor no repo. Sirva `www/` por HTTP a partir da raiz:

```bash
python -m http.server 8000 -d www      # abre http://localhost:8000
```

Armadilha do `http.server` padrão: não manda `Cache-Control` e responde `304` a
`If-Modified-Since`, então **uma mudança de CSS/JS pode não aparecer no reload** —
force refresh (Ctrl+Shift+R) ou DevTools com "Disable cache". Um `python -m
http.server` também é single-thread; se um módulo ES demorar a carregar, é isso.
Qualquer servidor estático com no-cache serve (ex.: `npx serve www`).

O iOS só registra service worker sob HTTPS — teste de instalação/offline exige a
URL do GitHub Pages, não o IP da rede local.

## Testes

```bash
npm test                                        # node --test (todos os *.test.js)
node --test www/js/models.test.js               # um arquivo
node --test --test-name-pattern="unilateral"    # por nome
```

Testes ficam colados ao módulo (`models.test.js` ao lado de `models.js`). Só dá
pra testar módulos **puros** sob `node --test`: `models.js` e `text.js` não têm
import nenhum. `seed.js`/`db.js`/`ui.js` puxam `i18n.js`, que toca `location` no
carregamento e quebra fora do browser. Para testar algo desses, extraia a lógica
pura pra um módulo sem dependência de DOM/IndexedDB (precedente: `text.js` existe
separado de `ui.js` porque `db.js` precisa dele numa migração).

## Deploy e service worker

Deploy = push na `main`; `.github/workflows/pages.yml` publica `www/`. Trabalho é
trunk-based, commits direto na `main`.

**Toda alteração em arquivo de `www/` exige bumpar `VERSION` em `www/sw.js`**
(`treino-vN` → `vN+1`). O cache do app é cache-first e versionado: sem o bump, o
PWA já instalado continua servindo os arquivos antigos. É o mecanismo de deploy.

Dois caches no SW, de propósito diferente:
- app (`treino-vN`) — versionado, descartável, limpo no `activate`.
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
