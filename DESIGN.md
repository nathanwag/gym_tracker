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
- **O degrau mais escuro precisa funcionar como traço fino, não só como barra.**
  A barra tem massa e aguenta escuro; o ícone de grupo é um traço de 2 px, e foi
  por isso que a opacidade da silhueta subiu pra 62%.

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
| `.hrow` / `.mo` | linha de treino / cabeçalho de mês | lista do histórico e sessões de um exercício |
| `.exc__banner` | foto em faixa com nome por cima | sessão (118 px), histórico (`--sm`, 90 px) |
| `.led` | livro-razão: peso e reps em colunas | sessão e detalhe do treino |
| `.livebar` | tempo/volume/séries correndo | sessão |
| `.exc-done` | exercício concluído, com régua do grupo | sessão |
| `.hero-photo` / `.recs` | foto sangrada + recordes em linha | tela de exercício |
| `.set-row` | linha de ajuste: rótulo à esquerda, valor à direita (`--tap` a torna acionável) | Você |
| `.pick` | opções da folha de escolha, a atual em destaque | qualquer `pickSheet()` |
| `.gidx` | índice por grupo: barra com referência em 100, a linha inteira navega | Progresso |
| `.srow` | sessão de um grupo: data + exercícios do dia, volume à direita | Progresso · grupo |
| `.delta` | o que mudou desde a última vez, exercício por exercício | detalhe do treino |
| `.chip` | pastilha de grupo com cor e, quando há, o índice | Progresso |
| `.sec` | seção com título e respiro próprio | Você |

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
- `groupField()` (`ui.js`) — o campo "grupo muscular" dos formulários. Estava
  copiado em quatro telas com a lista de `MUSCLE_GROUPS` montada à mão nas
  quatro.
- `historySwitch()` (`views/progress.js`) — o alternador *Lista · Progresso*.
  Mora na tela que o introduziu; o histórico importa de lá.

Duas cópias divergem no primeiro ajuste de coluna. Já aconteceu.

## Controles e alvos de toque

**Nada de menu do sistema.** `<select>` como *valor de uma linha* está proibido:
o menu que ele abre não obedece paleta, tipo nem raio de canto, então o único
momento em que a tela some é justamente o de escolher. Use **`pickSheet()`**,
pelo mesmo motivo que `confirmSheet()` existe contra o `confirm()` nativo.

A exceção é o **campo de formulário**: ao lado de um `<input>` de texto com a
mesma moldura, o `<select>` nativo é coerente — é o caso de `groupField()`. A
regra não é "select é feio", é **valor de linha usa folha, campo usa campo**.

**Quando a lista não cobre tudo, a última linha dela é a saída** — "Outro
valor…" abre uma segunda folha com o campo (é o passo de peso em Você). A lista
continua respondendo em um toque para quem quer 2,5, e quem tem anilha de 1,5
não fica de fora. Duas regras: se o valor guardado não está na lista, quem vem
marcada é a linha "Outro valor…" (senão a folha abre sem nada aceso), e o campo
aceita vírgula — é o que o teclado do celular oferece em português.

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
| Início · semana | Estou treinando o suficiente? | séries por grupo vs. meta |
| Progresso | Qual grupo saiu do meu normal? | índice, 100 = mediana |
| Progresso · grupo | Esse grupo está subindo? | séries e volume por sessão |
| Treino | Melhorei desde a última vez? | delta da sessão anterior |
| Exercício | A carga subiu? | e1RM e peso máximo |
| Você | — | não é leitura; é o que é seu |

Antes de acrescentar um número a uma tela, ache a pergunta dele nesta tabela.
Se ela já está respondida em outra linha, o número pertence àquela tela.

## Regras que quebram em silêncio

- **`groupColor` tem que ficar acima de `ICON_GROUPS`** em `ui.js`: os ícones
  chamam ela na inicialização do módulo, e `const` usada antes da declaração
  derruba o app no carregamento — não num teste.
- **As chaves de cor e de ícone têm que casar com `MUSCLE_GROUPS`** (`seed.js`).
- **Os três `woff2` da Barlow precisam estar no `ASSETS` do `sw.js`**, senão a
  tipografia quebra offline.
- **O cartão de compartilhar repete a paleta em hex** (`GROUP_COLORS` em
  `share-image.js`): canvas não resolve `var()`, e o cartão é **sempre escuro**
  mesmo com o app no tema claro — ler o tema ativo daria as cores erradas.
  Fonte nova usada lá também precisa entrar no `loadFonts()`.
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
  faz o rótulo piscar o nome antigo.
- **Ícone e rótulo da aba mudam juntos.** A engrenagem sobreviveu meia hora ao
  lado de "Você" e lia como duas abas diferentes.
