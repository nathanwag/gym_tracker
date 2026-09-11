# Identidade visual — direção "Anilha"

Leia antes de mexer em `www/css/styles.css` ou em qualquer tela. As decisões
aqui não são gosto: cada uma responde a um problema que o app tinha.

## De onde veio

O app era uma pilha de cartões cinzas com um ciano por cima — o formato que
sai de um gerador de interface. Seis coisas causavam isso:

1. **Tudo era cartão do mesmo peso** — mesmo raio, borda, sombra e padding, do
   resumo da semana ao gráfico. Nada estava na frente, nada atrás.
2. **Um ciano fazia o trabalho todo** e, fora dele, tudo era escala de cinza.
   Não havia sistema de cor, havia um destaque.
3. **Todo treino era idêntico ao outro** na lista: doze linhas de
   "3 exercícios · 9 séries · X kg".
4. **29 MB de foto usados numa tela só.**
5. **A ação principal não tinha recompensa** — registrar série produzia mais
   uma linha.
6. **O número não mandava na tela**: dado em 2,25 rem contra rótulo de
   0,72 rem, perto demais.

Se for acrescentar algo à interface, cheque contra essa lista.

## Cor

Vem da **anilha olímpica**, não de uma paleta de UI:

| Papel | Token | Anilha |
|---|---|---|
| Destaque, ação primária | `--accent` | vermelho de 25 kg |
| Recorde | `--pr` | amarelo de 15 kg |
| Em andamento, concluído | `--success` | verde de 10 kg |
| Fundo | `--bg` | preto de aço **neutro**, não azul-marinho |

`--danger` é próprio e mais claro que o `--accent`; o que separa os dois na
prática é o preenchimento (ação primária é sólida, destrutiva é contorno).

### Cor por grupo muscular

`--m-peito`, `--m-costas`, … em `styles.css`, com **`groupColor(grupo)`** em
`ui.js` devolvendo `var(--m-x)` — a mesma chamada serve nos dois temas, sem a
view saber qual está ativo.

**Três famílias, não dezessete matizes soltos:**

| Família | Matiz | Grupos (do mais claro ao mais escuro) |
|---|---|---|
| Empurrar | vermelho | Peito, Ombros, Tríceps |
| Puxar | azul | Costas, Lombar, Trapézio, Bíceps, Antebraço |
| Pernas | verde-azulado | Quadríceps, Posterior, Glúteos, Panturrilha |
| — | aço | Abdômen, Cardio, Pescoço, Outros, Alongamento |

Dentro da família muda só a luminosidade. Dezessete matizes distintos viravam
arco-íris: cada linha do histórico tinha três cores brigando e a lista inteira
vibrava. Assim **um dia de treino tem uma cor**, e a cor passa a dizer que tipo
de treino foi — que é como se pensa a semana.

Duas regras ao mexer nisso:

- **Grupos que treinam juntos ficam em degraus distantes.** Costas e bíceps são
  o par mais comum, então estão a três passos um do outro; sem isso a barra do
  dia vira um bloco chapado e some a proporção.
- **O degrau mais escuro precisa aguentar tinta por cima.** A barra tem massa e
  aguenta escuro, mas o ícone virou uma anilha *preenchida* com a cor e o
  pictograma vazado nela — quem garante a leitura é `inkOn()` (`groups.js`),
  que escolhe a tinta de maior contraste. O piso é 3:1, da WCAG 1.4.11
  (elemento não-textual); `#1e8b92` já fica em 4,41 e é o pior dos 34.

**Não é enfeite, é legenda.** Aparece em cinco lugares e tem que significar o
mesmo nos cinco: barras da semana, assinatura do treino no histórico, régua do
exercício concluído, pastilha do cartão de exercício e ícones de grupo.

## A marca

Três traços do mesmo comprimento, cada um mais grosso, em vermelho de anilha
sobre preto de aço. A progressão está na **espessura**, não na altura — é o que
a tira do território de gráfico de barras e a faz dizer a tese do app: mesma
série, carga subindo.

Vive em dois lugares e **tem que ser a mesma nos dois**: os PNG de
`www/icons/` (mais o `icon.svg` do favicon) e o `drawMark()` do cartão de
compartilhar. Marcas diferentes leem como dois apps.

Geometria, na grade de 100 usada pelo `icon.svg`: traços de 48 de largura,
alturas 5 / 9 / 14, começando em y 28 / 43 / 60. O `icon-512-maskable` desenha
a marca a 82% porque o launcher recorta até 20% de cada borda.

Os quatro PNG saem do canvas, sem dependência nova — o gerador é geometria
pura, não rasterização de SVG, então não há serrilhado de escala.

## Tipo

Duas famílias, com papéis fixos:

- **Manrope** — interface: nomes de exercício, textos, botões de conteúdo.
- **Barlow Condensed** — o **dado** (carga, volume, contagem, duração) e todo
  rótulo em caixa alta. Cabe grande sem quebrar linha e tem cara de número
  estampado em equipamento.

Duas classes carregam isso: **`.data`** (o número) e **`.tag`** (o rótulo
pequeno, espaçado, em caixa alta). As duas pontas da escala.

O salto entre elas é de **sete vezes** (rótulo ~11 px, dado até 76 px). Era de
três, e é o que separa "planilha" de "painel". Escala em `--fs-xs` … `--fs-hero`.

## Vocabulário de componentes

| Classe | O que é | Onde |
|---|---|---|
| `.week__big` | número grande + unidade na linha de base | início, detalhe do treino (`--sm`, um degrau abaixo) |
| `.lab` | rótulo de seção com valor à direita, usado como cabeçalho de gráfico (métrica · período à esquerda, variação % à direita) | início, exercício |
| `.muscle-group` | barras por grupo, com `__goal` de meta | início |
| `.sig` | assinatura: faixas por grupo, largura ∝ séries | histórico, cartão de compartilhar |
| `.gicon` | anilha na cor do grupo com o pictograma do gesto vazado | índice de grupos, grupos, seletor, atrás da foto |
| `.hrow` / `.mo` | linha de treino / cabeçalho de mês | lista do histórico e sessões de um exercício |
| `.exc__banner` | foto em faixa com nome por cima | sessão (118 px), histórico (`--sm`, 90 px) |
| `.led` | livro-razão: peso e reps em colunas | sessão e detalhe do treino |
| `.livebar` | tempo/volume/séries correndo | sessão |
| `.exc-done` | exercício concluído, com régua do grupo | sessão |
| `.hero-photo` / `.recs` | foto sangrada + recordes em linha | tela de exercício |
| `.set-row` | linha de ajuste: rótulo à esquerda, valor à direita (`--tap` a torna acionável; `__i` põe ícone à esquerda, `__hint` uma segunda linha) | Perfil, Configurações |
| `.phead` / `.avatar` | identidade: foto ou iniciais, nome, "treinando desde" | Perfil |
| `.pstats` | três números em colunas com filete entre elas | Perfil |
| `.pick` | opções da folha de escolha, a atual em destaque | qualquer `pickSheet()` |
| `.gidx` | índice por grupo: barra com referência em 100, a linha inteira navega | Progresso |
| `.srow` | linha de duas leituras + número à direita: sessão de um grupo (data + exercícios do dia, volume) e exercício da biblioteca (nome + última carga, índice) | Progresso, Progresso · grupo |
| `.delta` | o que mudou desde a última vez, exercício por exercício | detalhe do treino |
| `.chip` | pastilha de grupo com cor e, quando há, o índice | Progresso |
| `.sec` | seção com título e respiro próprio | Perfil, Configurações |

Cartão (`.card`) virou **exceção**, não regra: só o que precisa mesmo estar
contido. Se for pôr algo num cartão, justifique.

### A família das linhas

`.hrow`, `.srow`, `.delta__row`, `.set-row` e `.gidx__row` são **a mesma ideia
em cinco contextos**: flex, leitura à esquerda, número à direita, um filete
embaixo, `min-height` de toque. O que muda de verdade é o miolo — e é só isso
que justifica cada uma existir.

Antes de criar a sexta, pergunte qual coluna é diferente. Se a resposta for
"nenhuma", use a que já existe.

## Peças compartilhadas (não duplique)

- `workoutRow()` (`ui.js`) — linha de treino; início e histórico usam a mesma.
- `setLedger()` (`ui.js`) — o livro-razão. `onPick` ausente deixa as linhas
  inertes (leitura); presente as torna tocáveis. `ghost` é a série do treino
  anterior na posição da próxima.
- `exerciseBanner()` (`media.js`) — cabeçalho com foto. `actions` muda por tela.
- `signatureHtml()`, `groupColor()` (`ui.js`).
- `pickSheet()` (`ui.js`) — escolher um valor entre poucos. Ver "Nada de menu
  do sistema" abaixo.
- `pickerRow()` / `infoRow()` (`ui.js`) — as linhas de ajuste. Moravam em
  `views/settings.js`; subiram quando o Perfil passou a desenhar as mesmas.
- `numberSheet()` (`ui.js`) — a folha de um campo só, para ajuste que é número.
  `parse` devolve o valor ou `null`, e é a dica embaixo do campo que vira o
  recado do erro.
- `groupField()` (`ui.js`) — o campo "grupo muscular" dos formulários. Estava
  copiado em quatro telas com a lista de `MUSCLE_GROUPS` montada à mão nas
  quatro.
- `exerciseProgressRows()` (`models.js`) — a lista de exercícios com índice.
  Reusa `groupIndex()` em vez de ter a sua própria conta: grupo e exercício
  aparecem um embaixo do outro na mesma tela, e duas noções de "andou pra
  frente" se contradiriam ali.
- `lastDoneLabel()` (`ui.js`) — "Hoje · 135 kg": a última vez que o exercício
  foi feito e com quanto. Progresso e a busca desenham a mesma frase.

Duas cópias divergem no primeiro ajuste de coluna. Já aconteceu.

## Controles e alvos de toque

**Nada de menu do sistema.** `<select>` como *valor de uma linha* está proibido:
o menu que ele abre não obedece paleta, tipo nem raio de canto, então o único
momento em que a tela some é justamente o de escolher. Use **`pickSheet()`**,
pelo mesmo motivo que `confirmSheet()` existe contra o `confirm()` nativo.

A exceção é o **campo de formulário**: ao lado de um `<input>` de texto com a
mesma moldura, o `<select>` nativo é coerente — é o caso de `groupField()`. A
regra não é "select é feio", é **valor de linha usa folha, campo usa campo**.

**Tela de perfil e tela de ajustes têm doenças opostas.** No Perfil eram
quatro títulos de seção para oito linhas; em Configurações, seis para oito mais
um parágrafo com dois botões no meio da rolagem. Nos dois casos o rótulo em
condensada e caixa alta pesa como título, e a tela vira lista de listas. As
regras que saíram disso, e que valem pra qualquer tela nova de lista:

- **Poucos grupos e grandes**, de 5 a 7 itens; grupo de uma linha não merece
  cabeçalho. Filete agrupa; divisor entre cada item não agrupa nada.
- **Identidade e números formam um bloco só no topo**, e é ele que ancora a
  tela antes de qualquer lista (`.phead` + `.pstats`).
- **O que é pesado ou pouco frequente vira sub-tela**: backup e peso corporal
  saíram de dentro de Configurações. Configurações mesmo saiu da aba e foi
  para a engrenagem da topbar.
- **Ícone à esquerda só onde há grupo com muitos itens** (Configurações): é o
  que deixa achar "idioma" sem ler a coluna inteira. No Perfil as linhas não
  levam ícone — são poucas e cada uma diz o que é.
- **Ação destrutiva no fim, separada, em vermelho.**

**Folha de escolha é para escolha; número é campo.** O passo do peso já foi
uma lista de sete incrementos, e a lista era o problema: quem tem anilha de
1,5 kg, converte 5 lb ou usa máquina que pula de 20 em 20 batia num conjunto
fechado, e mesmo quem cabia nele pagava uma tela pra reencontrar o próprio
valor. A meta de séries por grupo tinha a mesma doença — 6/8/10/12 não tem 9
nem 11. Hoje as duas linhas abrem direto a folha com o campo, já preenchido e
selecionado, e é sempre a mesma: **`numberSheet()`** em `ui.js`.

Só o que é **conjunto fechado de verdade** usa `pickSheet()`: unidade, tema,
idioma — e treinos por semana, que a semana já limita a sete.

Duas consequências no detalhe: a linha leva `ICON.chevron`, não `ICON.down` —
não há lista de valores ali, há outra folha; e o campo aceita vírgula, que é o
que o teclado do celular oferece em português.

**Valor recusado se explica no lugar onde foi digitado**: o texto de ajuda do
campo vira vermelho (`.hint--err`), e não um toast. O toast do app aparece no
meio da tela, justamente por cima do campo, e repetiria a mesma frase que já
estava dois centímetros abaixo dele.

**A linha inteira é o alvo, nunca só o texto.** Uma linha acionável é
`<button>` ou `<a>` de altura cheia (`min-height: var(--tap)`), nunca um `div`
com `onclick` — que além do alvo curto não recebe foco por teclado. Já
aconteceu: a seta ao lado do valor em Você era decorativa, e é exatamente onde
a mão ia.

**As duas setas dizem coisas diferentes**, e isso é informação, não enfeite:

| Seta | Significa |
|---|---|
| `ICON.down` | abre uma lista de valores ali mesmo |
| `ICON.chevron` | leva pra outra tela ou outra folha |

## O que um número precisa ter ao lado

**Barra sem referência não diz nada.** Comprimento sozinho só compara com o
vizinho — não responde "foi suficiente?". Toda barra carrega a sua:

| Barra | Referência | O que ela é |
|---|---|---|
| `.muscle-group` (semana) | 10 séries | dose-resposta da literatura |
| `.gidx` (Progresso) | 100 | a mediana da própria pessoa |

E **a escala tem que incluir a referência** (`Math.max(ref, maior)`), senão o
traço sai da barra.

**Quilo só compara com quilo do mesmo grupo.** Um agachamento vale sete roscas
diretas na mesma soma, então volume agregado entre grupos mede *se houve dia de
perna*, não se a semana rendeu. Onde grupos diferentes aparecem lado a lado, o
número tem que ser adimensional — séries, ou o índice contra a própria mediana.

**Número grande não repete o gráfico.** Se o `.week__big` mostra o mesmo que o
último ponto da linha logo abaixo, ele não é hierarquia, é eco. Na tela de
grupo isso aconteceu e o número virou o índice — que é o que trouxe a pessoa
até ali e não estava em lugar nenhum.

## Uma pergunta por nível

Cada tela responde **uma** pergunta que nenhuma outra responde. É o que impede
a próxima métrica de ser jogada na home por falta de lugar:

| Tela | Pergunta | Leitura |
|---|---|---|
| Treino | O que eu treinei, e o que vou treinar agora? | séries por grupo vs. meta, e a lista de treinos |
| Progresso | Onde a carga está subindo, e onde eu travei? | índice por grupo e por exercício, 100 = mediana |
| Exercícios | O que eu tenho pra treinar? | modelos e o índice dos grupos, com o que é seu em cada |
| Exercícios · grupo | O que eu tenho de peito? | os seus do grupo, e o catálogo dele embaixo |
| Progresso · grupo | Esse grupo está subindo? | séries e volume por sessão |
| Treino | Melhorei desde a última vez? | delta da sessão anterior |
| Exercício | A carga subiu? | e1RM e peso máximo |
| Perfil | Quem eu sou, e como o app se comporta? | totais, metas, peso corporal, backup |
| Grupos | O que eu tenho pra classificar exercício? | nome, cor e uso de cada grupo |

A linha dos Grupos é a única que não responde com número: ela é manutenção do
vocabulário, não leitura de progresso. Por isso mora **atrás** dos Exercícios,
não do Progresso — e por isso não pode ganhar gráfico nem índice, que já têm
dono duas linhas acima.

**Histórico não é aba, é o resto de uma lista só.** O Treino mostra os 5 mais
recentes e um botão; `/historico` mostra todos, sob a mesma aba. Duas *abas*
era que dava duas listas disputando qual estava mais completa — a fatia e o
resto saem da mesma função (`workoutListNode({ limit })`), e por isso não
podem divergir.

Antes de acrescentar um número a uma tela, ache a pergunta dele nesta tabela.
Se ela já está respondida em outra linha, o número pertence àquela tela.

## Regras que quebram em silêncio

- **A cor do grupo vive no banco, e o token só existe depois de
  `applyGroupTokens()`** (`ui.js`). Ela gera um `<style>` que repete a cascata
  de três blocos do `styles.css`, e roda no bootstrap **e depois de toda
  escrita em grupo** — sem o segundo, um grupo recém-criado aparece sem cor
  nenhuma, sem erro. Os `--m-*` do `styles.css` são só o valor inicial.
- **Grupo criado pelo usuário ganha a anilha com a sigla.** Os 17 têm
  pictograma; quem não tem cai em `groupInitials()`, derivada do rótulo
  exibido. Ninguém fica sem desenho.
- **Os três `woff2` da Barlow precisam estar no `ASSETS` do `sw.js`**, senão a
  tipografia quebra offline.
- **O cartão de compartilhar lê `colorDark` do banco** (`share-image.js`):
  canvas não resolve `var()`, e o cartão é **sempre escuro** mesmo com o app no
  tema claro — ler o tema ativo daria as cores erradas. Fonte nova usada lá
  também precisa entrar no `loadFonts()`.
- **Rótulo em condensada e caixa alta ocupa mais que o texto normal sugere.**
  Vários textos precisaram encurtar por isso ("Treino em andamento" →
  "Em andamento", "recorde de carga (kg)" → "recorde kg"). Cheque no aparelho,
  não no editor.
- **A escala das barras da semana tem que incluir a meta** (`Math.max(meta,
  maior)`), senão o traço de referência sai da barra.
- **A aba ativa é tinta, não o destaque**: o vermelho já é o botão de treino no
  meio da tabbar, e dois vermelhos lado a lado brigavam.
- **`.section-title` dentro do próprio bloco perde a margem de cima.** Ele cai
  em `.section-title:first-child`, que existe pra encostar o primeiro título no
  topo da tela — com seis seções seguidas, todas colavam. O respiro entre
  seções mora no `.sec`, não no título.
- **O rótulo da tabbar existe duas vezes**: em `i18n-strings.js` e, estático,
  em `index.html`. O do HTML aparece antes do i18n rodar, então trocar só um
  faz o rótulo piscar o nome antigo. O `data-tab` do HTML tem que casar com o
  nome usado em `TABS` (`app.js`) e com a chave `app.tab.<nome>` — **e com a
  lista de `applyStaticLanguage()`**, que é um quarto lugar: ela ficou pedindo
  `'settings'` meses depois de Configurações sair da tabbar, e o rótulo do
  Perfil simplesmente nunca traduzia. Sem erro, sem teste quebrado.
- **Duas telas que falam do mesmo dado têm que ler a mesma fonte.** A busca de
  exercício dizia "última vez" a partir de `createdAt` da série (quando a
  *linha* foi gravada) e o Progresso, a partir da data do treino. Num backup
  importado os dois divergem, e o mesmo exercício aparecia como "Hoje" numa
  tela e "há 4 dias" na outra — nenhuma das duas errada sozinha.
- **Data sem hora ("2026-09-07") é meia-noite UTC pro `new Date()`**, o que
  volta um dia em fuso negativo — a pesagem de hoje aparecia como ontem. Os
  formatadores de `ui.js` e o `daysSince` de `profile.js` já tratam isso; quem
  escrever outro parse precisa lembrar.
- **Ícone e rótulo da aba mudam juntos.** A engrenagem sobreviveu meia hora ao
  lado de "Você" e lia como duas abas diferentes.
