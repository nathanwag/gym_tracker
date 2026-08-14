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
└─ js/
   ├─ app.js             bootstrap + roteador por hash
   ├─ ui.js              helpers de DOM, toast, bottom sheet, formatação
   ├─ db.js              única camada que fala com o IndexedDB
   ├─ models.js          1RM, volume, detecção de recordes
   ├─ seed.js            biblioteca inicial de exercícios
   ├─ backup.js          exportar/importar JSON
   ├─ charts.js          gráfico de linha em SVG puro
   └─ views/             uma tela por arquivo
tools/                   servidor de dev e gerador de ícones (Python, sem deps)
```

### Regras que mantêm o projeto empacotável

Estas não são estilo — cada uma quebra o app dentro do WebView nativo ou no GitHub Pages:

1. **Caminhos sempre relativos** (`./js/app.js`). O Pages serve de `/repo/` e o Capacitor de uma
   origem local; caminho absoluto quebra nos dois.
2. **Roteamento por hash** (`#/exercicios/12`) — dispensa configuração de servidor.
3. **Zero requisição externa.** Nenhum CDN, fonte remota ou analytics.
4. **Storage isolado em `db.js`**, backup isolado em `backup.js`. Trocar para SQLite nativo depois
   não encosta nas telas.
5. **Safe areas** (`env(safe-area-inset-*)`) para Dynamic Island e barra de gestos.
6. **`font-size: 16px` nos inputs**, senão o Safari dá zoom ao focar o campo.

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
