"""Divide, valida e junta a traducao do catalogo feita por varios agentes.

O catalogo tem 873 exercicios e ~55 mil palavras de portugues a escrever. Isso
e feito em lotes por agentes em paralelo, e este script e o que torna o
resultado confiavel: nenhum lote entra nos arquivos de traducao sem passar pela
validacao.

Fluxo:
    python tools/traduzir_lotes.py criar     # gera os arquivos de entrada
    (agentes escrevem tools/data/lotes/saida/*.json)
    python tools/traduzir_lotes.py validar   # aprova ou reprova cada lote
    python tools/traduzir_lotes.py merge     # junta os aprovados nas entradas do gerador

Depois: tools/traduzir_nomes.py e tools/build_catalog.py --dados.

Por que arquivo e nao o relatorio do agente: 3.500 palavras de JSON num
relatorio truncam e corrompem. Arquivo e robusto e permite validar por fora.
"""

import argparse
import json
import random
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "www" / "data" / "catalogo.json"
INSTRUCOES = RAIZ / "www" / "data" / "instrucoes.json"
DADOS = RAIZ / "tools" / "data"
LOTES = DADOS / "lotes"
ENTRADA = LOTES / "entrada"
SAIDA = LOTES / "saida"

TAM_NOMES = 98
TAM_PASSOS = 50

# --------------------------------------------------------------------------
# Validacao
# --------------------------------------------------------------------------

# Palavras inglesas que denunciam traducao incompleta. So palavras que NAO
# existem em portugues — "de", "para", "no" existem nos dois e dariam falso
# positivo.
INGLES = {
    "the", "your", "you", "and", "with", "keep", "hold", "position", "repeat",
    "exercise", "movement", "starting", "until", "while", "this", "that",
    "then", "back", "down", "arms", "legs", "knees", "elbows", "shoulders",
    "chest", "hips", "floor", "bench", "barbell", "dumbbell", "weight",
    "reps", "repetitions", "slowly", "should", "will", "make", "sure",
    "inhale", "exhale", "grip", "bar", "body", "head", "feet", "hand", "hands",
}

# Nao existe um teste util de "contem palavra portuguesa": "Agachamento livre" e
# "Rosca martelo alternada" nao tem nenhuma preposicao e sao portugues perfeito.
# A ausencia de ingles ja e o sinal — foi o que a primeira versao errou,
# reprovando 115 dos 383 nomes que estao certos.

# Enchimento da origem que nao deve sobreviver a reescrita.
ENCHIMENTO = [
    re.compile(r"repita.{0,30}repeti", re.I),
    re.compile(r"esta (sera|e) a posi\w+ inicial", re.I),
    re.compile(r"n[uú]mero recomendado de repeti", re.I),
    re.compile(r"inspire.{0,40}expire", re.I),
]

MOJIBAKE = re.compile(r"Ã.|Â.|â€")

PASSOS_MIN, PASSOS_MAX = 3, 6
# 2 e nao 6: "Desça controlado." e um passo bom, e o estilo pede frase curta. O
# limite de baixo existe so para pegar passo vazio ou truncado.
PALAVRAS_MIN, PALAVRAS_MAX = 2, 45
NOME_MAX = 75

# Concordancia. E heuristica e nao da para distinguir adjetivo de adverbio:
# em "Rosca de punho palmas para baixo", "baixo" nao concorda com nada. Por
# isso vira AVISO, nao reprovacao — e "alto"/"baixo" ficam de fora, que quase
# sempre aparecem como "para cima/para baixo".
FEMININOS = {
    "rosca", "remada", "puxada", "elevacao", "flexao", "extensao", "prancha",
    "subida", "caminhada", "isometria", "ponte", "rotacao", "cadeira",
    "flexora", "mesa",
}
MASCULINOS_ERRADOS = {
    "alternado", "inclinado", "declinado", "deitado", "ajoelhado",
    "curvado", "assistido", "invertido", "completo",
}


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn").lower()


def palavras(texto: str) -> list:
    return re.findall(r"[a-z]+", sem_acento(texto))


def erros_de_texto(texto: str, onde: str, limite: int = 1) -> list:
    """`limite` = quantas palavras inglesas toleradas antes de reprovar.

    Nome aceita 1 porque estrangeirismo consagrado e permitido e alguns tem
    palavra funcional junto ("Clean and jerk"). Passo a passo nao tolera
    nenhuma: ali qualquer palavra inglesa e tradução inacabada."""
    erros = []
    if MOJIBAKE.search(texto):
        erros.append(f"{onde}: acentuação corrompida (mojibake)")

    residuo = set(palavras(texto)) & INGLES
    if len(residuo) >= limite:
        erros.append(f"{onde}: resíduo de inglês {sorted(residuo)[:4]}")
    return erros


def validar_passos(dados: dict, esperados: set) -> dict:
    """Devolve {slug: [erros]}. Slug sem erro entra no merge.

    Por slug e nao por lote: um agente que erra 1 de 50 nao pode fazer os
    outros 49 serem descartados e reescritos."""
    por_slug = {}
    for slug in sorted(esperados):
        erros = []
        if slug not in dados:
            por_slug[slug] = ["ausente na saída do agente"]
            continue

        passos = dados[slug]
        if not isinstance(passos, list) or not all(isinstance(p, str) for p in passos):
            por_slug[slug] = ["não é lista de strings"]
            continue
        if not PASSOS_MIN <= len(passos) <= PASSOS_MAX:
            erros.append(f"{len(passos)} passos (esperado {PASSOS_MIN}-{PASSOS_MAX})")

        for i, passo in enumerate(passos, 1):
            n = len(passo.split())
            if not PALAVRAS_MIN <= n <= PALAVRAS_MAX:
                erros.append(f"passo {i}: {n} palavras (esperado {PALAVRAS_MIN}-{PALAVRAS_MAX})")
            erros += erros_de_texto(passo, f"passo {i}")
            if any(p.search(passo) for p in ENCHIMENTO):
                erros.append(f"passo {i}: enchimento da origem («{passo[:40]}…»)")
        por_slug[slug] = erros
    return por_slug


def validar_nomes(dados: dict, esperados: set, ja_usados: dict, avisos: list = None) -> dict:
    """Devolve {slug: [erros]}. `ja_usados` mapeia nome normalizado -> slug.

    `ja_usados` e atualizado com os nomes aprovados, para que o proximo lote
    validado ja veja este como ocupado."""
    if avisos is None:
        avisos = []
    por_slug = {}

    for slug in sorted(esperados):
        erros = []
        if slug not in dados:
            por_slug[slug] = ["ausente na saída do agente"]
            continue

        nome = dados[slug]
        if not isinstance(nome, str) or not nome.strip():
            por_slug[slug] = ["nome vazio"]
            continue
        if len(nome) > NOME_MAX:
            erros.append(f"nome com {len(nome)} caracteres (máx {NOME_MAX})")
        if not nome[0].isupper():
            erros.append(f"não começa com maiúscula («{nome}»)")

        erros += erros_de_texto(nome, "nome", limite=2)

        chave = sem_acento(nome).strip()
        # `!= slug` e essencial: depois do merge o nome ja esta no catalogo, e
        # sem isso a revalidacao acusaria todo lote aprovado de colidir consigo
        # mesmo.
        if ja_usados.get(chave, slug) != slug:
            erros.append(f"«{nome}» já é o nome de {ja_usados[chave]}")

        toks = palavras(nome)
        if toks and toks[0] in FEMININOS:
            for t in toks[1:]:
                if t in MASCULINOS_ERRADOS:
                    avisos.append(f"{slug}: concordância? «{nome}» ({t})")

        if not erros:
            ja_usados[chave] = slug
        por_slug[slug] = erros
    return por_slug


# --------------------------------------------------------------------------
# Comandos
# --------------------------------------------------------------------------

def pendentes():
    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    instrucoes = json.loads(INSTRUCOES.read_text(encoding="utf-8"))
    nomes = [c for c in catalogo if not c["traduzido"]]
    passos = [c for c in catalogo
              if instrucoes.get(c["slug"], {}).get("idioma") == "en"]
    return catalogo, instrucoes, nomes, passos


def cmd_criar(_args):
    catalogo, instrucoes, nomes, passos = pendentes()
    ENTRADA.mkdir(parents=True, exist_ok=True)
    SAIDA.mkdir(parents=True, exist_ok=True)

    usados = {sem_acento(c["nome"]).strip(): c["slug"] for c in catalogo if c["traduzido"]}
    (ENTRADA / "nomes_ja_usados.json").write_text(
        json.dumps(sorted(c["nome"] for c in catalogo if c["traduzido"]),
                   ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # Nomes: ordenados por grupo para o agente ver variantes do mesmo movimento
    # lado a lado e nomea-las de forma coerente.
    nomes.sort(key=lambda c: (c["grupo"], c["nomeEn"]))
    for i in range(0, len(nomes), TAM_NOMES):
        lote = nomes[i:i + TAM_NOMES]
        n = i // TAM_NOMES + 1
        (ENTRADA / f"nomes_{n:02d}.json").write_text(json.dumps(
            [{"slug": c["slug"], "nomeEn": c["nomeEn"], "grupo": c["grupo"],
              "equipamento": c["equipamento"]} for c in lote],
            ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # Passo a passo: agrupado por musculo. Um agente que faz 50 exercicios de
    # perna constroi vocabulario consistente para perna.
    passos.sort(key=lambda c: (c["grupo"], c["nomeEn"]))
    for i in range(0, len(passos), TAM_PASSOS):
        lote = passos[i:i + TAM_PASSOS]
        n = i // TAM_PASSOS + 1
        (ENTRADA / f"passos_{n:02d}.json").write_text(json.dumps(
            [{"slug": c["slug"], "nomeEn": c["nomeEn"], "grupo": c["grupo"],
              "equipamento": c["equipamento"],
              "instrucoesEn": instrucoes[c["slug"]]["passos"]} for c in lote],
            ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    n_nomes = -(-len(nomes) // TAM_NOMES)
    n_passos = -(-len(passos) // TAM_PASSOS)
    print(f"{len(nomes)} nomes  -> {n_nomes} lotes de ate {TAM_NOMES}")
    print(f"{len(passos)} passos -> {n_passos} lotes de ate {TAM_PASSOS}")
    print(f"entrada em {ENTRADA.relative_to(RAIZ)}")
    for g, c in Counter(p["grupo"] for p in passos).most_common():
        print(f"   {g:<14} {c}")


def _avaliar():
    """Percorre os lotes e devolve (bons, ruins) por tipo, com os avisos.

    Os arquivos sao lidos em ordem para que a checagem de nome duplicado veja
    o que os lotes anteriores ja ocuparam."""
    catalogo, _, _, _ = pendentes()
    usados = {sem_acento(c["nome"]).strip(): c["slug"] for c in catalogo if c["traduzido"]}

    bons = {"nomes": {}, "passos": {}}
    ruins = {"nomes": {}, "passos": {}}
    avisos = []

    for saida in sorted(SAIDA.glob("*.json")):
        entrada = ENTRADA / saida.name
        if not entrada.exists():
            continue
        # "re_nomes_01.json" tambem e lote de nome: sem o `in`, o prefixo de
        # reprocessamento faria o arquivo ser validado como passo a passo.
        tipo = "nomes" if "nomes_" in saida.name else "passos"
        esperados = {item["slug"] for item in json.loads(entrada.read_text(encoding="utf-8"))}

        try:
            dados = json.loads(saida.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            ruins[tipo].update({s: [f"JSON do lote inválido: {e}"] for s in esperados})
            continue
        dados = {k: v for k, v in dados.items() if not k.startswith("_")}

        resultado = (validar_nomes(dados, esperados, usados, avisos) if tipo == "nomes"
                     else validar_passos(dados, esperados))
        for slug, erros in resultado.items():
            if erros:
                ruins[tipo][slug] = erros
            else:
                bons[tipo][slug] = dados[slug]

    return bons, ruins, avisos


def cmd_validar(args):
    if not list(SAIDA.glob("*.json")):
        sys.exit(f"Nenhum lote em {SAIDA.relative_to(RAIZ)}")
    bons, ruins, avisos = _avaliar()

    for tipo in ("nomes", "passos"):
        b, r = len(bons[tipo]), len(ruins[tipo])
        if b or r:
            print(f"{tipo}: {b} aprovados, {r} reprovados")

    for tipo in ("nomes", "passos"):
        if not ruins[tipo]:
            continue
        print(f"\n--- {tipo} reprovados ---")
        motivos = Counter()
        for slug, erros in ruins[tipo].items():
            motivos[erros[0].split("(")[0].split("«")[0].strip()[:45]] += 1
        for motivo, n in motivos.most_common(args.mostrar):
            print(f"  {n:>4}  {motivo}")
        for slug, erros in list(ruins[tipo].items())[:args.mostrar]:
            print(f"        {slug}: {erros[0]}")

    if avisos:
        print(f"\n{len(avisos)} avisos de concordância (não reprovam):")
        for a in avisos[:args.mostrar]:
            print(f"  {a}")

    return 1 if (ruins["nomes"] or ruins["passos"]) else 0


def cmd_merge(args):
    bons, ruins, _ = _avaliar()

    # Merge preservando o que ja existe: os 74 escritos a mao sao a referencia
    # de estilo e nao podem ser sobrescritos.
    for caminho, novos in ((DADOS / "nomes_pt.json", bons["nomes"]),
                           (DADOS / "instrucoes_pt.json", bons["passos"])):
        if not novos:
            continue
        atual = json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else {}
        mantidos = sum(1 for s in novos if atual.get(s))
        combinado = {**atual, **{s: v for s, v in novos.items() if not atual.get(s)}}
        ordenado = {k: combinado[k]
                    for k in sorted(combinado, key=lambda k: (not k.startswith("_"), k))}
        caminho.write_text(
            json.dumps(ordenado, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{caminho.name}: +{len(novos) - mantidos} novos, {mantidos} já existiam")

    faltando = len(ruins["nomes"]) + len(ruins["passos"])
    if faltando:
        print(f"{faltando} ficaram de fora — rode `refazer` para gerar os lotes que faltam")


def cmd_refazer(args):
    """Gera novos arquivos de entrada só com o que ainda não foi aprovado.

    Substitui a entrada e apaga a saída correspondente, para o ciclo
    criar -> agente -> validar -> merge poder recomecar limpo."""
    catalogo, instrucoes, _, _ = pendentes()
    porslug = {c["slug"]: c for c in catalogo}
    _, ruins, _ = _avaliar()

    for pasta in (SAIDA, ENTRADA):
        for antigo in pasta.glob(f"re_{args.tipo}_*.json" if args.tipo != "tudo" else "re_*.json"):
            antigo.unlink()

    total = 0
    for tipo in ("nomes", "passos"):
        if args.tipo not in (tipo, "tudo"):
            continue
        tam = args.tamanho
        slugs = sorted(ruins[tipo])
        if not slugs:
            continue
        slugs.sort(key=lambda s: (porslug[s]["grupo"], porslug[s]["nomeEn"]))
        for i in range(0, len(slugs), tam):
            lote = slugs[i:i + tam]
            n = i // tam + 1
            nome = f"re_{tipo}_{n:02d}.json"
            itens = []
            for s in lote:
                c = porslug[s]
                item = {"slug": s, "nomeEn": c["nomeEn"], "grupo": c["grupo"],
                        "equipamento": c["equipamento"]}
                if tipo == "passos":
                    item["instrucoesEn"] = instrucoes[s]["passos"]
                itens.append(item)
            (ENTRADA / nome).write_text(
                json.dumps(itens, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            total += 1
        print(f"{tipo}: {len(slugs)} pendentes em {-(-len(slugs)//tam)} lotes")

    # Lista atualizada de nomes ocupados, para o agente nao repetir.
    bons, _, _ = _avaliar()
    usados = sorted({c["nome"] for c in catalogo if c["traduzido"]} | set(bons["nomes"].values()))
    (ENTRADA / "nomes_ja_usados.json").write_text(
        json.dumps(usados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{total} lotes de reprocessamento; nomes_ja_usados.json agora tem {len(usados)} nomes")


def cmd_amostra(args):
    catalogo, instrucoes, _, _ = pendentes()
    porslug = {c["slug"]: c for c in catalogo}
    pt = [s for s, v in instrucoes.items() if v["idioma"] == "pt"]
    random.seed(args.semente)
    for slug in random.sample(pt, min(args.n, len(pt))):
        c = porslug[slug]
        print(f"\n{c['nome']}   ({c['nomeEn']})")
        for p in instrucoes[slug]["passos"]:
            print(f"   • {p}")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("criar")
    v = sub.add_parser("validar"); v.add_argument("--mostrar", type=int, default=8)
    sub.add_parser("merge")
    r = sub.add_parser("refazer")
    r.add_argument("--tamanho", type=int, default=35)
    # Sem isto, refazer rodado no meio da execucao marcaria como pendente tudo
    # que os agentes ainda nao terminaram de escrever.
    r.add_argument("--tipo", choices=["nomes", "passos", "tudo"], default="tudo")
    a = sub.add_parser("amostra")
    a.add_argument("-n", type=int, default=15); a.add_argument("--semente", type=int, default=1)

    args = p.parse_args()
    sys.exit({"criar": cmd_criar, "validar": cmd_validar, "merge": cmd_merge,
              "refazer": cmd_refazer, "amostra": cmd_amostra}[args.cmd](args) or 0)


if __name__ == "__main__":
    main()
