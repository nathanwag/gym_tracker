"""Gera o catalogo de exercicios (dados + figuras) a partir do free-exercise-db.

Fonte: https://github.com/yuhonas/free-exercise-db  — licenca Unlicense (dominio
publico). 873 exercicios, cada um com exatamente 2 fotos (posicao inicial e
final). Sao essas duas fotos que a tela de detalhe alterna em loop para mostrar
o movimento.

Este script roda SO EM DESENVOLVIMENTO e o resultado e commitado; o app em si
continua sem nenhuma dependencia. Por isso o Pillow e exigido aqui e em lugar
nenhum mais:

    pip install "pillow>=12"

A stdlib nao decodifica JPEG nem codifica WebP, entao nao ha caminho puro como
o de make_icons.py (que so desenha formas e escreve PNG com zlib).

Uso:
    python tools/build_catalog.py                 # baixa, converte e gera dados
    python tools/build_catalog.py --baixar        # so o download para .cache/
    python tools/build_catalog.py --converter     # so JPEG -> WebP
    python tools/build_catalog.py --dados         # so os .json
    python tools/build_catalog.py --sugerir-seed  # candidatos de slug (nao escreve)
    python tools/build_catalog.py --forcar        # reescreve mesmo sem mudanca

Reexecutar sem --forcar tem de deixar o `git status` limpo: cada arquivo e
codificado em memoria e comparado byte a byte com o que ja esta no disco. Isso
nao e otimizacao, e o que impede o repositorio de dobrar de tamanho a cada
regeracao — o git guarda todas as versoes para sempre.
"""

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Fixado num commit, nao em `main`: com `main` a geracao deixa de ser
# reproduzivel e um upstream novo produziria um diff gigante sem aviso.
UPSTREAM_REF = "b0eed061e1c832b3ed815fbaa4b45b3cdc14df49"
UPSTREAM_RAW = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{UPSTREAM_REF}"

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "tools" / ".cache"          # fora de www/: o Pages publica www/ inteira
DADOS = RAIZ / "tools" / "data"            # entradas editadas a mao (traducoes)
SAIDA_IMG = RAIZ / "www" / "img" / "ex"
SAIDA_DADOS = RAIZ / "www" / "data"

# Miniatura em 3:2 e nao quadrada: serve como quadrado de 44px com object-fit
# cover e tambem como previa 3:2 no catalogo. Regerar depois duplicaria o
# historico do git, entao a flexibilidade vale mais que os ~1,5 KB de diferenca.
THUMB_LARGURA = 160
THUMB_QUALIDADE = 60

# 480 e o meio-termo: .view tem max-width 620px (styles.css) e num iPhone de
# 390px a foto ocupa ~358px CSS. A origem so tem 850px, entao nao ha o que
# ganhar indo alem; 640 pesaria ~70% mais para uma diferenca dificil de ver.
FULL_LARGURA = 480
FULL_QUALIDADE = 68

# primaryMuscles[0] do upstream -> grupo do app (GRUPOS em www/js/seed.js).
# traps->Ombros porque "Encolhimento de ombros" ja esta em Ombros no seed;
# adductors/abductors->Pernas porque as cadeiras adutora/abdutora ja estao la.
MUSCULO_GRUPO = {
    "chest": "Peito",
    "lats": "Costas",
    "middle back": "Costas",
    "lower back": "Costas",
    "shoulders": "Ombros",
    "traps": "Ombros",
    "biceps": "Bíceps",
    "triceps": "Tríceps",
    "forearms": "Antebraço",
    "quadriceps": "Pernas",
    "hamstrings": "Pernas",
    "adductors": "Pernas",
    "abductors": "Pernas",
    "glutes": "Glúteos",
    "calves": "Panturrilha",
    "abdominals": "Abdômen",
    "neck": "Outros",
}

EQUIPAMENTO_PT = {
    "barbell": "barra",
    "dumbbell": "halteres",
    "cable": "polia",
    "machine": "máquina",
    "body only": "peso do corpo",
    "kettlebells": "kettlebell",
    "bands": "elástico",
    "medicine ball": "bola medicinal",
    "exercise ball": "bola suíça",
    "foam roll": "rolo de espuma",
    "e-z curl bar": "barra W",
    "other": "outros",
}

NIVEL_PT = {"beginner": "iniciante", "intermediate": "intermediário", "expert": "avançado"}

CATEGORIA_PT = {
    "strength": "força",
    "stretching": "alongamento",
    "plyometrics": "pliometria",
    "strongman": "strongman",
    "powerlifting": "powerlifting",
    "cardio": "cardio",
    "olympic weightlifting": "levantamento olímpico",
}


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto)
                   if unicodedata.category(c) != "Mn")


def criar_slug(bruto: str) -> str:
    """`Barbell_Bench_Press_-_Medium_Grip` -> `barbell-bench-press-medium-grip`."""
    s = sem_acento(bruto).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-{2,}", "-", s).strip("-")


def escrever_se_mudou(caminho: Path, dados: bytes, forcar: bool = False) -> bool:
    """Escreve so quando o conteudo muda. Devolve True se escreveu."""
    if not forcar and caminho.exists() and caminho.read_bytes() == dados:
        return False
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(dados)
    return True


def escrever_json(caminho: Path, obj, forcar: bool = False) -> bool:
    # separators sem espaco a direita e ensure_ascii=False deixam o arquivo
    # menor e legivel; sort_keys mantem o diff estavel entre execucoes.
    texto = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    return escrever_se_mudou(caminho, texto.encode("utf-8") + b"\n", forcar)


def baixar(url: str, destino: Path, tentativas: int = 3) -> bool:
    """Baixa para `destino` se ainda nao existir. Devolve False se falhou."""
    if destino.exists() and destino.stat().st_size > 0:
        return True
    pedido = urllib.request.Request(url, headers={"User-Agent": "treino-build-catalog"})
    for tentativa in range(tentativas):
        try:
            with urllib.request.urlopen(pedido, timeout=30) as resposta:
                conteudo = resposta.read()
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(conteudo)
            return True
        except (urllib.error.URLError, TimeoutError, OSError):
            if tentativa == tentativas - 1:
                return False
    return False


def exigir_pillow():
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        sys.exit(
            'Falta o Pillow (so para gerar as figuras; o app nao usa).\n'
            '  pip install "pillow>=12"'
        )


# --------------------------------------------------------------------------
# Etapas
# --------------------------------------------------------------------------

def carregar_upstream() -> list:
    origem = CACHE / "exercises.json"
    if not baixar(f"{UPSTREAM_RAW}/dist/exercises.json", origem):
        sys.exit("Nao consegui baixar exercises.json. Verifique a conexao.")
    return json.loads(origem.read_text(encoding="utf-8"))


def indexar(upstream: list) -> dict:
    """Slug -> registro do upstream, abortando em colisao."""
    por_slug = {}
    for ex in upstream:
        # O app registra carga (peso x repeticoes); alongamento nao tem carga
        # pra registrar, entao fica fora do catalogo. Filtrado aqui (nao so em
        # etapa_dados) pra download/conversao de imagem tambem pularem.
        if ex.get("category") == "stretching":
            continue

        # O upstream nao traz `id` no dist/; o nome do diretorio das imagens e
        # a chave real (images[0] = "<Id>/0.jpg").
        src_id = ex["images"][0].split("/")[0]
        slug = criar_slug(src_id)
        if slug in por_slug:
            sys.exit(
                f"Colisao de slug: '{src_id}' e '{por_slug[slug]['srcId']}' viram '{slug}'.\n"
                "Dois exercicios compartilhariam a mesma foto. Ajuste criar_slug()."
            )
        por_slug[slug] = {"srcId": src_id, "ex": ex}
    return por_slug


def etapa_baixar(por_slug: dict):
    alvos = []
    for slug, info in por_slug.items():
        for i in (0, 1):
            alvos.append((
                f"{UPSTREAM_RAW}/exercises/{urllib.parse.quote(info['srcId'])}/{i}.jpg",
                CACHE / "img" / f"{slug}-{i}.jpg",
            ))

    pendentes = [(u, d) for u, d in alvos if not (d.exists() and d.stat().st_size > 0)]
    if not pendentes:
        print(f"download: {len(alvos)} imagens ja em cache")
        return

    print(f"download: {len(pendentes)} de {len(alvos)} imagens...")
    with ThreadPoolExecutor(max_workers=8) as pool:
        ok = list(pool.map(lambda par: baixar(par[0], par[1]), pendentes))

    falhas = ok.count(False)
    if falhas:
        print(f"  {falhas} falharam — rode de novo para tentar so as que faltam.")
    print(f"  {ok.count(True)} baixadas")


def _codificar(origem: Path, largura: int, qualidade: int) -> bytes:
    """Redimensiona e codifica em WebP, devolvendo os bytes (sem tocar no disco)."""
    from io import BytesIO

    from PIL import Image

    with Image.open(origem) as img:
        img = img.convert("RGB")
        altura = round(img.height * largura / img.width)
        img = img.resize((largura, altura), Image.LANCZOS)
        buffer = BytesIO()
        # method=6 e o encoder mais lento e mais denso; roda uma vez so.
        img.save(buffer, "WEBP", quality=qualidade, method=6)
    return buffer.getvalue()


def etapa_converter(por_slug: dict, forcar: bool):
    exigir_pillow()
    escritos = inalterados = ausentes = 0

    for slug in sorted(por_slug):
        origens = [CACHE / "img" / f"{slug}-{i}.jpg" for i in (0, 1)]
        if not all(o.exists() for o in origens):
            ausentes += 1
            continue

        # A miniatura sai do frame 0, que e a posicao inicial do movimento.
        saidas = [
            (SAIDA_IMG / "thumb" / f"{slug}.webp", origens[0], THUMB_LARGURA, THUMB_QUALIDADE),
            (SAIDA_IMG / "full" / f"{slug}-0.webp", origens[0], FULL_LARGURA, FULL_QUALIDADE),
            (SAIDA_IMG / "full" / f"{slug}-1.webp", origens[1], FULL_LARGURA, FULL_QUALIDADE),
        ]
        for destino, origem, largura, qualidade in saidas:
            if escrever_se_mudou(destino, _codificar(origem, largura, qualidade), forcar):
                escritos += 1
            else:
                inalterados += 1

    print(f"figuras: {escritos} escritas, {inalterados} inalteradas", end="")
    print(f", {ausentes} exercicios sem origem" if ausentes else "")


def carregar_traducoes() -> dict:
    caminho = DADOS / "nomes_pt.json"
    if not caminho.exists():
        return {}
    return json.loads(caminho.read_text(encoding="utf-8"))


def carregar_comofazer_pt() -> dict:
    """Passo a passo escrito a mao em portugues, por slug.

    Chaves comecadas com _ sao comentarios do proprio arquivo."""
    caminho = DADOS / "comofazer_pt.json"
    if not caminho.exists():
        return {}
    bruto = json.loads(caminho.read_text(encoding="utf-8"))
    return {k: v for k, v in bruto.items() if not k.startswith("_") and v}


def etapa_dados(por_slug: dict, forcar: bool):
    traducoes = carregar_traducoes()
    passos_pt = carregar_comofazer_pt()
    catalogo, comofazer, faltando = [], {}, []

    for slug in sorted(por_slug):
        ex = por_slug[slug]["ex"]
        primarios = ex.get("primaryMuscles") or []
        grupo = MUSCULO_GRUPO.get(primarios[0], "Outros") if primarios else "Outros"

        nome_en = ex["name"]
        nome_pt = traducoes.get(slug)
        if not nome_pt:
            faltando.append(slug)

        catalogo.append({
            "slug": slug,
            "nome": nome_pt or nome_en,
            "nomeEn": nome_en,
            "traduzido": bool(nome_pt),
            "grupo": grupo,
            "equipamento": EQUIPAMENTO_PT.get(ex.get("equipment") or "other", "outros"),
            "nivel": NIVEL_PT.get(ex.get("level") or "", ""),
            "categoria": CATEGORIA_PT.get(ex.get("category") or "", ""),
            "primarios": sorted({MUSCULO_GRUPO.get(m, "Outros") for m in primarios}),
            # Os 17 musculos do upstream colapsam em 11 grupos, entao um
            # secundario costuma cair no mesmo grupo do principal. Repeti-lo em
            # "Também trabalha" so polui a tela.
            "secundarios": sorted({MUSCULO_GRUPO.get(m, "Outros")
                                   for m in (ex.get("secondaryMuscles") or [])}
                                  - {MUSCULO_GRUPO.get(m, "Outros") for m in primarios}),
            "srcId": por_slug[slug]["srcId"],
        })

        # O portugues escrito a mao ganha do texto original. Quem nao tem
        # versao em PT fica em ingles e a tela mostra o selo EN.
        if slug in passos_pt:
            comofazer[slug] = {"idioma": "pt", "passos": passos_pt[slug]}
        elif ex.get("instructions"):
            comofazer[slug] = {"idioma": "en", "passos": ex["instructions"]}

    # O manifesto e o que o app compara para decidir se precisa pre-baixar as
    # figuras; a versao muda sozinha quando o conjunto de slugs muda.
    manifesto = {
        "versao": f"{UPSTREAM_REF[:8]}-{len(catalogo)}",
        "slugs": [item["slug"] for item in catalogo],
    }

    mudou = sum([
        escrever_json(SAIDA_DADOS / "catalogo.json", catalogo, forcar),
        escrever_json(SAIDA_DADOS / "comofazer.json", comofazer, forcar),
        escrever_json(SAIDA_IMG / "manifest.json", manifesto, forcar),
    ])

    em_pt = sum(1 for v in comofazer.values() if v["idioma"] == "pt")
    print(f"dados: {len(catalogo)} exercicios, {mudou} de 3 arquivos atualizados")
    print(f"  passo a passo: {em_pt} em portugues, {len(comofazer) - em_pt} em ingles")

    if faltando:
        print(f"  {len(faltando)} nomes sem traducao (mostrados em ingles com selo EN)")
        esqueleto = DADOS / "nomes_pt.json"
        if not esqueleto.exists():
            escrever_json(esqueleto, {slug: None for slug in faltando})
            print(f"  esqueleto criado em {esqueleto.relative_to(RAIZ)}")


def etapa_sugerir_seed(por_slug: dict):
    """Candidatos de slug para os nomes PT do seed. Nao escreve nada."""
    seed = (RAIZ / "www" / "js" / "seed.js").read_text(encoding="utf-8")
    nomes = re.findall(r"^\s*'([^']+)',\s*$", seed, re.M)
    grupos = set(re.findall(r"^\s*'([^']+)',\s*$", seed.split("SEED_EXERCISES")[0], re.M))
    nomes = [n for n in nomes if n not in grupos]

    # Ponte minima PT->EN: sem isso quase nada casa por token.
    ponte = {
        "supino": "bench press", "reto": "", "inclinado": "incline",
        "declinado": "decline", "barra": "barbell", "halteres": "dumbbell",
        "maquina": "machine maquina", "crucifixo": "fly flyes",
        "polia": "cable", "flexao": "push-up", "braco": "arm",
        "puxada": "pulldown", "remada": "row", "curvada": "bent over",
        "unilateral": "one arm", "terra": "deadlift", "levantamento": "lift",
        "agachamento": "squat", "frontal": "front", "livre": "back",
        "cadeira": "machine", "extensora": "leg extension", "flexora": "leg curl",
        "mesa": "lying", "afundo": "lunge", "passada": "lunge",
        "bulgaro": "bulgarian split squat", "stiff": "stiff leg deadlift",
        "romeno": "romanian", "panturrilha": "calf raise", "pe": "standing",
        "sentado": "seated", "rosca": "curl", "direta": "", "alternada": "alternate",
        "martelo": "hammer", "scott": "preacher", "concentrada": "concentration",
        "inversa": "reverse", "triceps": "triceps", "corda": "rope",
        "testa": "lying extension", "frances": "overhead extension",
        "coice": "kickback", "fechado": "close-grip", "mergulho": "dips",
        "banco": "bench", "paralelas": "dips", "desenvolvimento": "press",
        "arnold": "arnold", "elevacao": "raise", "lateral": "lateral",
        "encolhimento": "shrug", "alta": "upright row", "ombros": "shoulder",
        "abdominal": "crunch", "supra": "crunch", "infra": "leg raise",
        "prancha": "plank", "pernas": "leg", "gluteo": "glute",
        "pelvica": "hip thrust", "adutora": "adductor", "abdutora": "abductor",
        "punho": "wrist", "leg": "leg press", "press": "press",
        "hack": "hack squat", "cavalinho": "t-bar row", "baixa": "seated cable row",
        "fixa": "pull-up", "supinada": "underhand", "estendidos": "straight arm",
        "voador": "fly", "invertido": "reverse", "crossover": "cable crossover",
        "farmer": "farmers walk", "walk": "walk",
    }

    def tokens_pt(nome: str) -> set:
        brutos = re.findall(r"[a-z0-9]+", sem_acento(nome).lower())
        saida = set()
        for t in brutos:
            saida.update(re.findall(r"[a-z0-9]+", ponte.get(t, t)))
        return {t for t in saida if len(t) > 2}

    print(f"\n{len(nomes)} nomes no seed. Melhores candidatos:\n")
    for nome in nomes:
        alvo = tokens_pt(nome)
        notas = []
        for slug, info in por_slug.items():
            cand = {t for t in re.findall(r"[a-z0-9]+", info["ex"]["name"].lower()) if len(t) > 2}
            if not cand:
                continue
            comum = len(alvo & cand)
            if comum:
                notas.append((comum / len(alvo | cand), slug, info["ex"]["name"]))
        notas.sort(reverse=True)
        print(f"  {nome}")
        for nota, slug, nome_en in notas[:3]:
            print(f"     {nota:.2f}  {slug:<52} {nome_en}")
        if not notas:
            print("     (nenhum candidato)")
        print()


# --------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--baixar", action="store_true")
    p.add_argument("--converter", action="store_true")
    p.add_argument("--dados", action="store_true")
    p.add_argument("--sugerir-seed", action="store_true")
    p.add_argument("--forcar", action="store_true")
    args = p.parse_args()

    tudo = not (args.baixar or args.converter or args.dados or args.sugerir_seed)

    por_slug = indexar(carregar_upstream())

    if args.sugerir_seed:
        etapa_sugerir_seed(por_slug)
        return
    if tudo or args.baixar:
        etapa_baixar(por_slug)
    if tudo or args.converter:
        etapa_converter(por_slug, args.forcar)
    if tudo or args.dados:
        etapa_dados(por_slug, args.forcar)


if __name__ == "__main__":
    main()
