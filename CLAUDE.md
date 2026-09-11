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
pra testar módulos **puros** sob `node --test`: `models.js`, `text.js`,
`curve.js`, `weight-step.js` e `profile.js` não têm import nenhum, e
`groups.js` só importa `text.js`.
`seed.js`/`db.js`/`ui.js` puxam `i18n.js`, que toca `location` no carregamento
e quebra fora do browser. Para testar algo
desses, extraia a lógica pura pra um módulo sem dependência de DOM/IndexedDB —
é o que `text.js` (separado de `ui.js` porque `db.js` precisa dele numa
migração), `curve.js` (separado de `charts.js`, que importa `ui.js`) e
`weight-step.js` (validação do passo digitado, saneamento do passo gravado nas
telas que registram série) e `profile.js` (iniciais, dias desde uma data, série
de peso corporal) fazem.

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

**Quatro abas, quatro perguntas** — a tabbar é `Treino · Progresso ·
[botão] · Exercícios · Perfil`, e o rótulo de cada uma vive em **quatro**
lugares (ver a lista de regras que quebram em silêncio, no fim).

**Treino** (`views/home.js`, rota `/`) — *"o que eu treinei, e o que vou
treinar agora?"*. Modelos com cabeçalho no topo, resumo da semana, e os **5
treinos mais recentes** (`RECENT_LIMIT`), com um botão pro resto. **Histórico
não é aba, é tela atrás do Treino** (`/historico`, `history.renderList`): a
tabbar continua com quatro, e o `TABS` do `app.js` deixa `/historico` e
`/historico/<id>` sob a do Treino. Ter as duas como *abas* é que era a mesma
lista disputando qual estava mais completa — como fatia + resto, é uma lista
só, e `workoutListNode({ limit })` é a única que a desenha nos dois lugares (o
total do mês no cabeçalho sempre soma o histórico inteiro, não a fatia).
Precedente: a Home da Hevy é o feed dos treinos. **Modelos saiu daqui** pra aba
Exercícios, que é onde a pergunta "o que eu tenho pra treinar" já estava — duas
portas pro mesmo lugar é o que faz a pessoa não achar nenhuma. O caminho de
"treinar a partir de um modelo" continua sendo a folha do botão vermelho.

**Progresso** (`views/progress.js`, `/progresso`) — *"onde a carga sobe, e onde
eu travei?"*. Índice por grupo em cima, por exercício embaixo, os dois contra a
própria mediana. **Só leitura**: criar exercício e gerenciar grupo já moraram
aqui e empilhavam um terceiro emprego numa tela de análise — o mesmo erro que
dissolveu a aba Exercícios antiga (biblioteca, catálogo e modelos em oito
acordeões fechados). O grupo vai no hash sem acento (`#/progresso/quadriceps`)
pelo mesmo motivo do slug do catálogo.

**Exercícios** (`views/exercise.js`, `/exercicios`) — *"o que eu tenho pra
treinar?"*. **Índice por grupo, não lista**: a raiz da aba são as ~17 linhas de
`db.groups()` na ordem anatômica (inclusive as vazias — reordenar sozinha a cada
exercício criado tiraria a única coisa que faz achar sem ler), cada uma com
"N seus · N no catálogo". A lista de exercício existe **só dentro de um grupo**
(`renderGroup`, `/exercicios/grupo/<slug>` — o `/grupo/` no meio evita que um
grupo chamado "123" caia na rota `/exercicios/<id>`), e o catálogo daquele grupo
vem junto, embaixo dos seus. Criar mora lá também, e por isso o exercício nasce
classificado (`exerciseForm(name, group)`).

**Digitar na busca desliga o corte**: volta a lista achatada de sempre (seus +
os 873), porque quem já sabe o nome não quer navegar. Índice = repouso, busca =
atalho. **Modelos** (`views/templates.js`, `/modelos`) entra pela linha do topo:
responde a pergunta desta aba, é a lista mais curta e a que menos muda. Também
moram aqui os **grupos musculares** (`views/groups.js`, `/grupos` — criar,
renomear, pintar, apagar, no rodapé) e a **ficha do catálogo**
(`views/catalog.js`, `/catalogo/<slug>`). O Strong dá aba própria a Exercícios
pelo mesmo motivo: biblioteca não é leitura de progresso; Strong e Hevy também
abrem a biblioteca por músculo.

**Perfil** (`views/profile.js`, `/perfil`) — *"quem eu sou, e como o app se
comporta?"*. Quem você é, o que já fez, metas e **Peso corporal**
(`views/body-weight.js`, `/peso`). **Backup** (`views/backup.js`, `/backup`)
teve uma linha de primeiro nível aqui e saiu: **Configurações → Seus dados** já
leva pra mesma tela e ainda diz há quantos dias foi o último export — duas
portas pro mesmo lugar é o que faz a pessoa não achar nenhuma.
**Configurações** (`views/settings.js`) continua atrás da engrenagem da topbar,
na rota `/ajustes`, que ficou com o nome antigo de propósito: ela não aparece
como rótulo em lugar nenhum e o store do IndexedDB também se chama `settings`.

**Camadas de dados (isoladas para permitir trocar o backend sem tocar telas):**
- `db.js` — única a falar com IndexedDB. Stores: `exercises`, `workouts`, `sets`,
  `settings`, `exerciseImages`, `workoutTemplates`, `bodyWeights`,
  `muscleGroups` (modelo de treino = nome +
  ordem de `exerciseIds`, a mesma forma do treino; `startWorkoutFromTemplate()`
  é o único caminho de "treinar a partir de um modelo"). `DB_VERSION` +
  `onupgradeneeded` com blocos `if (event.oldVersion < N)`. Migração tem que ser
  **100% síncrona** (WebKit encerra transação que fica ociosa — nada de `await`
  no meio). Helper `tx()`.
  A biblioteca de exercícios (~80 itens) fica em cache na memória; qualquer
  escrita invalida.
- `catalog.js` — única a ler `www/data/`. O catálogo (873 exercícios,
  `catalogo.json`) é imutável e igual em todo aparelho, então **não** é copiado
  pro banco: o IndexedDB guarda só os exercícios que o usuário escolheu. Cache
  imutável, nunca invalidado.
- `backup.js` — export/import do banco em JSON. No iOS usa `navigator.share`
  (um `<a download>` não funciona dentro de PWA instalado).

**Nome de exercício e valores do catálogo são sempre em português** e vêm de
`catalogo.json`; só a exibição traduz (`displayName()`, catalog.js).
`catalogo.json`/`instrucoes.json` são dados commitados editados à mão (os
geradores não estão mais no repo).

**Grupo muscular é a exceção: virou dado, não lista no código.** O store
`muscleGroups` guarda `{slug, name, colorLight, colorDark, usesDuration,
order}`, e `exercises.muscleGroup` aponta pro **slug** (`'peito'`), não pro
nome. O `slug` é imutável pelo mesmo motivo do slug do exercício: `name` é
editável pelo usuário, e renomear "Peito" orfanaria tudo que apontasse pra
string. `CANONICAL_GROUPS` (`groups.js`) é só a **semente** da migração v7 —
não é mais a verdade em runtime, que é `db.groups()` (leitura síncrona, como
`db.settings()`).

Como o catálogo continua gravando `grupo: 'Peito'` e nunca migra,
`groupLabel()`, `groupColor()` e `groupIcon()` aceitam **slug ou nome em
português** — todas normalizam por `groupSlugFor()`.

**`slug`** liga um exercício às fotos em `www/img/ex/` e à entrada do catálogo.
É estável (ao contrário do `id` autoincremento e do `name` com acento editável).
`slug: null` é válido (exercício sem figura). `slugByName()` reencontra o slug de
exercícios criados antes do catálogo existir.

**`models.js`** — puro. Recordes e métricas são **sempre recalculados** das
séries, nunca gravados — editar/apagar uma série não deixa PR fantasma. 1RM por
Epley (`peso × (1 + reps/30)`). Séries de aquecimento ficam fora de tudo. Série
unilateral guarda `repsLeft`/`repsRight` em vez de `reps`.

**Comparação por grupo muscular** — volume em kg só é honesto *dentro* de um
grupo: um agachamento vale sete roscas diretas na mesma soma, então total
agregado mede se houve dia de perna, não se a semana rendeu. Daí quatro funções
em `models.js`, todas puras e testadas:

- `groupSessionSummaries()` — sessões de um grupo. Um treino de costas e bíceps
  alimenta os dois **sem contar série duas vezes**, porque cada exercício tem um
  `muscleGroup` só (`db.js`). Efeito colateral a conhecer: remada não empresta
  nada ao bíceps — é contagem de série direta, e é o que o dado suporta
  (`primarios`/`secundarios` ficam no catálogo, não são copiados).
- `groupIndex()` — mediana das sessões recentes ÷ mediana das anteriores, em
  duas janelas que **não se tocam**. **Sessões, não dias**: grupos têm cadências
  diferentes, e numa janela de dias um teria o dobro de amostra do outro.
  **Mediana, não média**: um deload isolado não pode virar alarme.
  **As janelas crescem com o histórico** (`windows()`): `recent =
  min(3, floor(n/2))`, base é o resto com teto de 8 — 1×1 com duas sessões,
  2×3 com cinco, e da 6ª em diante estabiliza no 3 × até 8, idêntico ao que
  sempre foi. Com **uma** sessão devolve `null`: não há contra o que comparar.
  Antes o mínimo era 6 fixo, o que deixava a tela muda por 3 semanas (grupo 2×/
  semana) ou 6 (1×/semana) — justamente o mês em que a pessoa mais olha pro app.
  O risco que o corte evitava continua real, e agora quem lida com ele é a
  **tela**: abaixo de `SESSIONS_FOR_FIRM_INDEX` (6) a barra vem listrada, o
  número leva um ponto e o nome do grupo ganha "2 de 6". `groupMedians()` usa as
  **mesmas** janelas de propósito — se o número aparece, a frase que explica de
  onde ele saiu aparece junto.
- `exerciseProgressRows()` — a mesma leitura do `groupIndex()`, por exercício,
  para a lista do Progresso. **Reusa `groupIndex()` em vez de ter conta
  própria**: grupo e exercício aparecem um embaixo do outro na mesma tela, e
  duas noções de "andou pra frente" se contradiriam ali. O campo medido entra
  por parâmetro (e1RM, ou tempo pro que não tem carga) porque quem sabe disso é
  `usesDuration` em `seed.js`, e `models.js` não importa nada.
- `workoutDeltas()` — cada exercício contra a última vez que **ele** foi feito,
  não contra o treino anterior: dois treinos seguidos podem não ter exercício
  nenhum em comum.

**Identidade visual (direção "Anilha")** — está em [`DESIGN.md`](DESIGN.md):
paleta, escala de tipo, vocabulário de componentes, os controles e alvos de
toque, e a tabela de *uma pergunta por nível* — consulte-a antes de acrescentar
um número a qualquer tela. **Leia antes de mexer em `styles.css` ou em qualquer
tela.** O que quebra o app, e por isso fica aqui:

- **A cor do grupo é dado, e o token só existe depois de `applyGroupTokens()`**
  (`ui.js`): ela gera um `<style>` que repete a mesma cascata de três blocos do
  `styles.css` (claro / escuro por preferência / escuro explícito), e é o que
  faz `groupColor()` poder continuar devolvendo `var(--m-<slug>)`. Roda no
  bootstrap **e depois de toda escrita em grupo** — sem o segundo, grupo
  recém-criado nasce sem cor, sem erro nenhum. Os `--m-*` do `styles.css`
  viraram só o valor inicial.
- **Grupo criado pelo usuário não tem ícone.** Os 17 de `ICON_GROUPS` são uma
  silhueta com a mancha posicionada à mão (coordenadas no próprio arquivo);
  não há como gerar uma pra um grupo novo, então `groupIcon()` cai num disco na
  cor do grupo.
- **Os 3 `woff2` da Barlow Condensed** (`www/fonts/`, estáticos — a família não
  é variável) precisam estar no `ASSETS` do `sw.js`, senão a tipografia quebra
  offline.
- **O cartão de compartilhar lê `colorDark` direto do banco** (`share-image.js`):
  canvas não resolve `var()`, e o cartão é sempre escuro mesmo com o app no tema
  claro. Era uma tabela de hex copiada; virou leitura porque uma cópia
  congelaria a cor que o usuário escolheu.

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
