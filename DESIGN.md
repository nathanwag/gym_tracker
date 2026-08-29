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

Cartão (`.card`) virou **exceção**, não regra: só o que precisa mesmo estar
contido. Se for pôr algo num cartão, justifique.

## Peças compartilhadas (não duplique)

- `workoutRow()` (`ui.js`) — linha de treino; início e histórico usam a mesma.
- `setLedger()` (`ui.js`) — o livro-razão. `onPick` ausente deixa as linhas
  inertes (leitura); presente as torna tocáveis. `ghost` é a série do treino
  anterior na posição da próxima.
- `exerciseBanner()` (`media.js`) — cabeçalho com foto. `actions` muda por tela.
- `signatureHtml()`, `groupColor()` (`ui.js`).

Duas cópias divergem no primeiro ajuste de coluna. Já aconteceu.

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
