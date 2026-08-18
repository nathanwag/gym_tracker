# Treino

App para registrar **peso e repetições** de cada série na academia e acompanhar a evolução ao longo
do tempo, com gráficos de progressão e recordes automáticos.

Funciona offline, guarda tudo no próprio aparelho e não depende de nenhum servidor.

---

## Como rodar na máquina

```bash
python tools/dev_server.py 8000
```

Abra <http://localhost:8000>. Não precisa instalar nada — o app é HTML, CSS e JavaScript puro, sem
dependências e sem etapa de build.

> Use este servidor em vez de `python -m http.server`: ele desliga o cache do navegador e responde
> em paralelo. Com o `http.server` padrão, uma alteração de CSS pode simplesmente não aparecer.

Para regerar os ícones depois de mudar cor ou desenho:

```bash
python tools/make_icons.py
```

---

## Instalar no iPhone

O iOS não instala APK, e sideload gratuito (AltStore) expira a cada 7 dias. **O PWA na tela de
início é a única forma gratuita e permanente** de ter o app no aparelho — e funciona bem: ícone
próprio, tela cheia, offline.

Só falta um detalhe: o iOS exige **HTTPS** para registrar o service worker. Testar pelo IP da rede
local (`http://192.168.x.x:8000`) abre o app, mas não instala nem guarda offline. Por isso o passo
é publicar primeiro:

### 1. Publicar (grátis)

```bash
git init
git add .
git commit -m "Treino"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/treino.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: GitHub Actions** — e não *Deploy from a branch*, que faria o
Jekyll renderizar este README como página inicial em vez de publicar o app. O workflow em
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica a pasta `www/` a cada push e
devolve uma URL `https://SEU-USUARIO.github.io/treino/`.

> Se a primeira execução falhar com *"Get Pages site failed"*, é porque ela rodou antes de o Pages
> estar em modo GitHub Actions. Trocar a opção no Settings **não re-dispara o workflow**: rode-o de
> novo em **Actions → Publicar no GitHub Pages → Run workflow**, ou faça um novo push.

### 2. Instalar

No iPhone, abra essa URL **no Safari** (não no Chrome — só o Safari instala no iOS):

**Compartilhar** (o quadrado com a seta) → **Adicionar à Tela de Início** → **Adicionar**.

### Por que instalar não é opcional

O Safari apaga os dados de sites comuns depois de ~7 dias sem visita. Apps adicionados à tela de
início são **isentos** dessa limpeza e ganham armazenamento próprio. Usar o app só pela aba do
Safari coloca seu histórico em risco.

---

## Backup

Os treinos vivem apenas no seu aparelho — não há nuvem, não há conta. Em **Ajustes → Exportar
treinos** o app gera um `.json` com tudo.

No iPhone isso abre a folha de compartilhamento do sistema, e você salva em **Arquivos** ou no
**iCloud Drive** (um `<a download>` comum não funciona dentro de um PWA no iOS — por isso o app usa
a API de compartilhamento). Para restaurar, **Importar backup** e escolha o arquivo.

Exporte de vez em quando, e sempre antes de trocar de celular.

---

## Como funcionam os números

| Métrica | Cálculo | Para que serve |
|---|---|---|
| **Volume** | peso × repetições, somado | Quanto trabalho total você fez |
| **1RM estimado** | `peso × (1 + reps ÷ 30)` (fórmula de Epley) | Comparar 8×60 kg com 5×70 kg e saber se evoluiu |
| **Recordes** | maior carga, maior 1RM estimado, maior volume numa sessão | Marcados com 🏆 no momento em que acontecem |

Séries marcadas como **aquecimento** ficam fora dos recordes, dos gráficos e do volume.

Os recordes não são gravados no banco: são recalculados a partir das séries. Assim, editar ou apagar
uma série nunca deixa para trás um recorde fantasma.

---

## Estrutura

```
www/                     o app (e o webDir do Capacitor)
├─ index.html            shell único: topbar, view, tabbar, sheet, toast
├─ sw.js                 service worker (offline)
├─ manifest.webmanifest
├─ css/styles.css
├─ data/                 catálogo de 873 exercícios + passo a passo (gerados)
├─ img/ex/               873 miniaturas e 1746 fotos em WebP (geradas)
└─ js/
   ├─ app.js             bootstrap + roteador por hash
   ├─ ui.js              helpers de DOM, toast, bottom sheet, formatação
   ├─ text.js            normalização de texto, sem DOM (db.js também usa)
   ├─ db.js              única camada que fala com o IndexedDB
   ├─ catalog.js         única camada que lê www/data/
   ├─ media.js           figuras: URL, miniatura, animação de 2 frames
   ├─ models.js          1RM, volume, detecção de recordes
   ├─ seed.js            biblioteca inicial de exercícios
   ├─ backup.js          exportar/importar JSON
   ├─ charts.js          gráfico de linha em SVG puro
   └─ views/             uma tela por arquivo
tools/                   servidor de dev e geradores (Python)
```

### Figuras dos exercícios

Cada exercício tem duas fotos — posição inicial e final — e alterná-las em loop mostra o movimento.
Não existe fonte gratuita de vídeo que possa ser embutida (MuscleWiki é paga e proíbe salvar em
disco; o wger tem 78 vídeos no acervo inteiro), e duas fotos resolvem o problema real de conferir a
execução, offline e sem requisição externa.

A fonte é o [free-exercise-db](https://github.com/yuhonas/free-exercise-db) — domínio público
(Unlicense), 873 exercícios. O commit usado fica fixado em `UPSTREAM_REF` no gerador.

```bash
pip install "pillow>=12"          # só para gerar; o app não usa nenhuma dependência
python tools/build_catalog.py     # baixa, converte para WebP e gera os .json
python tools/traduzir_nomes.py    # gera tools/data/nomes_pt.json
```

O resultado é commitado, então quem só mexe no app nunca precisa rodar isso. Reexecutar sem
`--forcar` tem de deixar o `git status` limpo: cada arquivo é comparado byte a byte antes de ser
escrito, o que impede o repositório de dobrar de tamanho a cada regeração.

Os dois arquivos em `tools/data/` são **entrada**, não saída — editá-los é definitivo, porque o
gerador preserva o que já está lá:

- `nomes_pt.json` — nomes em português. Os de `seed.js` têm prioridade sobre a tradução automática.
- `instrucoes_pt.json` — passo a passo escrito à mão, dos 74 exercícios da biblioteca inicial. Não é
  tradução literal: o texto original é prolixo e cheio de detalhe que não ajuda quem está em pé com
  a barra na mão. A regra é 3 a 5 passos, do setup ao movimento, com o erro mais comum no fim.

O que não tem versão em português aparece em inglês com um selo `EN` — estado suportado, não
quebrado.

#### Traduzir o que falta

O volume é grande demais para uma sessão só, então a tradução é feita em lotes por agentes e
`tools/traduzir_lotes.py` é o portão de qualidade — nenhum lote entra sem passar por ele:

```bash
python tools/traduzir_lotes.py criar      # gera os lotes do que ainda falta
                                          # (agentes escrevem em lotes/saida/)
python tools/traduzir_lotes.py validar    # aprova ou reprova, por exercício
python tools/traduzir_lotes.py merge      # junta os aprovados nos arquivos acima
python tools/traduzir_lotes.py refazer    # novos lotes só com o que foi reprovado
python tools/traduzir_lotes.py amostra    # lê uma amostra do resultado
```

`criar` calcula o que falta a partir de `www/data/`, então **retomar em outra máquina é só clonar e
rodar `criar`** — a pasta `tools/data/lotes/` não é versionada de propósito.

A validação é por exercício, não por lote: um agente que erra 1 de 50 não faz os outros 49 serem
descartados. Ela existe porque modelos truncam a saída e dizem que terminaram — na primeira rodada
um lote entregou 53 de 98 nomes e relatou sucesso. Ela também barra resíduo de inglês, enchimento do
texto original e **nome duplicado**, que é o pior defeito possível aqui: dois exercícios com o mesmo
nome viram duas linhas idênticas na busca.

### Regras que mantêm o projeto empacotável

Estas não são estilo — cada uma quebra o app dentro do WebView nativo ou no GitHub Pages:

1. **Caminhos sempre relativos** (`./js/app.js`). O Pages serve de `/repo/` e o Capacitor de uma
   origem local; caminho absoluto quebra nos dois.
2. **Roteamento por hash** (`#/exercicios/12`) — dispensa configuração de servidor.
3. **Zero requisição externa.** Nenhum CDN, fonte remota ou analytics. As figuras dos exercícios são
   arquivos locais em `www/img/` pelo mesmo motivo.
4. **Storage isolado em `db.js`**, backup isolado em `backup.js`, dados estáticos em `catalog.js`.
   Trocar para SQLite nativo depois não encosta nas telas.
5. **Dois caches no service worker.** O do app é versionado e descartável; o de figuras
   (`treino-midia`) **não** é versionado e nunca é apagado no `activate` — senão cada deploy jogaria
   fora dezenas de MB que o usuário baixou aos poucos. O ramo de mídia no `fetch` precisa vir antes
   do genérico, ou as fotos acabam no cache versionado e somem na atualização seguinte.
6. **Safe areas** (`env(safe-area-inset-*)`) para Dynamic Island e barra de gestos.
7. **`font-size: 16px` nos inputs**, senão o Safari dá zoom ao focar o campo.

---

## Se um dia for para a App Store

O projeto já está pré-montado para isso: `capacitor.config.json` aponta para `www/`, e o Capacitor
transforma a mesma pasta num app nativo iOS e Android **sem reescrever nada**.

O que falta é fora do código:

| | Custo | Exige |
|---|---|---|
| **App Store** | US$ 99/ano | Um **Mac com Xcode** (`npx cap add ios`) — não dá para compilar iOS no Windows |
| **Play Store** | US$ 25, uma vez | Nada além do que já está aqui |

```bash
winget install OpenJS.NodeJS     # uma vez
npm install
npx cap add ios                  # precisa de macOS
npx cap sync
```

Antes de publicar, troque o `appId` em `capacitor.config.json` para um identificador seu.

Para gerar um **APK Android** de graça, sem instalar o Android SDK, use o workflow
[`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml) — as instruções estão no
topo do arquivo. (APK não serve para iPhone.)

---

## Fora do escopo por enquanto

Rotinas/templates de treino, timer de descanso e sincronização em nuvem. O modelo de dados já
comporta os dois primeiros sem migração dolorosa.
