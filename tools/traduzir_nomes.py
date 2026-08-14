"""Gera tools/data/nomes_pt.json — os nomes do catalogo em portugues.

Os 873 nomes do free-exercise-db sao formulaicos ("Seated One-Arm Dumbbell
Palms-Down Wrist Curl"), entao a traducao e composicional: identifica o
movimento base, os qualificadores e o equipamento, e remonta na ordem que o
portugues usa na academia — "Rosca de punho unilateral sentado com halteres".

Isso da um resultado muito mais consistente do que 873 linhas escritas a mao,
onde o mesmo termo acabaria traduzido de tres jeitos diferentes.

O arquivo gerado e uma ENTRADA do build_catalog.py e pode ser editado a mao: o
script preserva qualquer traducao ja existente, a menos que venha --refazer.
Ou seja, corrigir um nome no JSON e definitivo.

Uso:
    python tools/traduzir_nomes.py           # traduz o que ainda falta
    python tools/traduzir_nomes.py --refazer # descarta e refaz tudo
    python tools/traduzir_nomes.py --amostra 40
"""

import argparse
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "www" / "data" / "catalogo.json"
SEED = RAIZ / "www" / "js" / "seed.js"
SAIDA = RAIZ / "tools" / "data" / "nomes_pt.json"


def nomes_do_seed() -> dict:
    """slug -> nome, tirados de www/js/seed.js.

    Os 74 exercicios da biblioteca inicial ja foram traduzidos e conferidos um
    a um. Sao a melhor traducao que existe no projeto, entao entram como fonte
    autoritativa: vencem a composicao automatica e nunca sao descartados por
    colisao — quando "Crunches" e "Sit-Up" disputam "Abdominal", quem fica com
    o nome e o que esta no seed."""
    texto = SEED.read_text(encoding="utf-8")
    achados = re.findall(r"\{\s*nome:\s*'([^']+)',\s*slug:\s*'([^']+)'\s*\}", texto)
    return {slug: nome for nome, slug in achados}

# Nomes que a composicao nao acerta — jargao consagrado, marcas ou expressoes
# que viraram outra coisa em portugues. Tem prioridade sobre tudo.
EXATOS = {
    "pullups": "Barra fixa",
    "pull-ups": "Barra fixa",
    "chin-up": "Barra fixa supinada",
    "mixed grip chin": "Barra fixa com pegada mista",
    "pushups": "Flexão de braço",
    "push-ups": "Flexão de braço",
    "good morning": "Bom dia (good morning)",
    "farmer's walk": "Farmer walk",
    "plank": "Prancha",
    "side bridge": "Prancha lateral",
    "russian twist": "Russian twist",
    "burpee": "Burpee",
    "mountain climber": "Escalador",
    "jumping rope": "Pular corda",
    "rope jumping": "Pular corda",
    "battling ropes": "Corda naval",
    "rope climb": "Subida na corda",
    "butterfly": "Crucifixo na máquina (voador)",
    "adductor": "Alongamento de adutores",
    "adductor/groin": "Alongamento de adutores",
    "thigh adductor": "Cadeira adutora",
    "thigh abductor": "Cadeira abdutora",
    "leg press": "Leg press",
    "hack squat": "Hack machine",
    "sled push": "Empurrada de trenó",
    "sled drag": "Puxada de trenó",
    "tire flip": "Virada de pneu",
    "atlas stone trainer": "Atlas stone",
    "atlas stones": "Atlas stones",
    "car deadlift": "Levantamento terra de carro",
    "log lift": "Levantamento de log",
    "yoke walk": "Caminhada com yoke",
    "keg load": "Carregamento de barril",
    "clean": "Clean",
    "power clean": "Power clean",
    "hang clean": "Hang clean",
    "clean and jerk": "Clean and jerk",
    "clean and press": "Clean and press",
    "snatch": "Arranco (snatch)",
    "power snatch": "Power snatch",
    "hang snatch": "Hang snatch",
    "muscle up": "Muscle up",
    "handstand push-ups": "Flexão em parada de mão",
    "bodyweight squat": "Agachamento livre (peso do corpo)",
    "iron cross": "Crucifixo com anilhas",
    "superman": "Superman",
    "bird dog": "Bird dog",
    "turkish get-up": "Turkish get-up",
}

# Movimento base. Ordem importa: a primeira expressao que casar vence, entao as
# mais longas vem antes ("incline bench press" antes de "bench press").
MOVIMENTOS = [
    ("incline bench press", "Supino inclinado"),
    ("decline bench press", "Supino declinado"),
    ("guillotine bench press", "Supino guilhotina"),
    ("bench press", "Supino"),
    ("incline press", "Supino inclinado"),
    ("decline press", "Supino declinado"),
    ("chest press", "Supino"),
    ("floor press", "Supino no chão"),
    ("board press", "Supino com board"),
    ("front squat", "Agachamento frontal"),
    ("hack squat", "Agachamento hack"),
    ("split squat", "Agachamento afundo"),
    ("pistol squat", "Agachamento pistol"),
    ("overhead squat", "Agachamento overhead"),
    ("full squat", "Agachamento completo"),
    ("squat", "Agachamento"),
    ("romanian deadlift", "Levantamento terra romeno"),
    ("stiff-legged deadlift", "Stiff"),
    ("stiff leg deadlift", "Stiff"),
    ("sumo deadlift", "Levantamento terra sumô"),
    ("deficit deadlift", "Levantamento terra com déficit"),
    ("clean deadlift", "Levantamento terra clean"),
    ("snatch deadlift", "Levantamento terra snatch"),
    ("deadlift", "Levantamento terra"),
    ("bent over row", "Remada curvada"),
    ("bent-over row", "Remada curvada"),
    ("upright row", "Remada alta"),
    ("inverted row", "Remada invertida"),
    ("renegade row", "Remada renegade"),
    ("t-bar row", "Remada cavalinho"),
    ("row", "Remada"),
    ("straight-arm pulldown", "Pulldown com braços estendidos"),
    ("straight arm pulldown", "Pulldown com braços estendidos"),
    ("lat pulldown", "Puxada"),
    ("pulldown", "Puxada"),
    ("pull-up", "Barra fixa"),
    ("pullup", "Barra fixa"),
    ("chin-up", "Barra fixa supinada"),
    ("hammer curl", "Rosca martelo"),
    ("preacher curl", "Rosca scott"),
    ("concentration curl", "Rosca concentrada"),
    ("reverse curl", "Rosca inversa"),
    ("wrist curl", "Rosca de punho"),
    ("spider curl", "Rosca spider"),
    ("zottman curl", "Rosca zottman"),
    ("drag curl", "Rosca drag"),
    ("leg curl", "Flexora"),
    ("bicep curl", "Rosca direta"),
    ("biceps curl", "Rosca direta"),
    ("curl", "Rosca"),
    ("leg extension", "Cadeira extensora"),
    ("calf raise", "Panturrilha"),
    ("calf press", "Panturrilha no leg press"),
    ("military press", "Desenvolvimento militar"),
    ("shoulder press", "Desenvolvimento"),
    ("arnold press", "Desenvolvimento Arnold"),
    ("overhead press", "Desenvolvimento"),
    ("push press", "Push press"),
    ("lateral raise", "Elevação lateral"),
    ("side lateral raise", "Elevação lateral"),
    ("front raise", "Elevação frontal"),
    ("rear delt raise", "Crucifixo inverso"),
    ("rear delt fly", "Crucifixo inverso"),
    ("shrug", "Encolhimento de ombros"),
    ("reverse fly", "Crucifixo inverso"),
    ("reverse flyes", "Crucifixo inverso"),
    ("flyes", "Crucifixo"),
    ("fly", "Crucifixo"),
    ("crossover", "Crossover"),
    ("pullover", "Pullover"),
    ("triceps pushdown", "Tríceps na polia"),
    ("tricep pushdown", "Tríceps na polia"),
    ("pushdown", "Tríceps na polia"),
    ("triceps extension", "Tríceps testa"),
    ("tricep extension", "Tríceps testa"),
    ("triceps press", "Tríceps"),
    ("kickback", "Coice"),
    ("dips", "Mergulho"),
    ("dip", "Mergulho"),
    ("push-up", "Flexão de braço"),
    ("push up", "Flexão de braço"),
    ("pushup", "Flexão de braço"),
    ("reverse crunch", "Abdominal infra"),
    ("oblique crunch", "Abdominal oblíquo"),
    ("crunch", "Abdominal"),
    ("sit-up", "Abdominal"),
    ("situp", "Abdominal"),
    ("leg raise", "Elevação de pernas"),
    ("leg lift", "Elevação de pernas"),
    ("knee raise", "Elevação de joelhos"),
    ("hip thrust", "Elevação pélvica"),
    ("glute bridge", "Ponte de glúteo"),
    ("hip raise", "Elevação de quadril"),
    ("walking lunge", "Afundo caminhando"),
    ("reverse lunge", "Afundo reverso"),
    ("lunge", "Afundo"),
    ("step-up", "Subida no banco"),
    ("step up", "Subida no banco"),
    ("thruster", "Thruster"),
    ("high pull", "Puxada alta"),
    ("stretch", "Alongamento"),
    ("twist", "Rotação de tronco"),
    ("raise", "Elevação"),
    ("press", "Desenvolvimento"),
    ("extension", "Extensão"),
    ("throw", "Arremesso"),
    ("jump", "Salto"),
    ("hold", "Isometria"),
    ("walk", "Caminhada"),
    ("carry", "Caminhada"),
]

# Equipamento -> sufixo. Vem depois do movimento e dos qualificadores.
EQUIPAMENTOS = [
    ("smith machine", "no Smith"),
    ("e-z bar", "com barra W"),
    ("ez bar", "com barra W"),
    ("ez-bar", "com barra W"),
    ("cambered barbell", "com barra cambered"),
    ("trap bar", "com barra hexagonal"),
    ("barbell", "com barra"),
    ("dumbbell", "com halteres"),
    ("kettlebell", "com kettlebell"),
    ("cable", "na polia"),
    ("pulley", "na polia"),
    ("machine", "na máquina"),
    ("bands", "com elástico"),
    ("band", "com elástico"),
    ("chains", "com correntes"),
    ("medicine ball", "com bola medicinal"),
    ("exercise ball", "na bola suíça"),
    ("bosu ball", "no bosu"),
    ("stability ball", "na bola suíça"),
    ("plate", "com anilha"),
    ("sled", "no trenó"),
    ("rope attachment", "com corda"),
    ("v-bar attachment", "com barra V"),
    ("bodyweight", "livre"),
    ("suspended", "na fita de suspensão"),
    ("rings", "nas argolas"),
    ("ring", "nas argolas"),
    ("foam roll", "com rolo"),
    ("towel", "com toalha"),
    ("bench", "no banco"),
]

# Qualificadores, na ordem em que devem aparecer no nome final.
QUALIFICADORES = [
    ("incline", "inclinado"),
    ("decline", "declinado"),
    ("flat bench", "reto"),
    ("flat", "reto"),
    ("front", "frontal"),
    ("side", "lateral"),
    ("rear", "posterior"),
    ("close-grip", "pegada fechada"),
    ("close grip", "pegada fechada"),
    ("wide-grip", "pegada aberta"),
    ("wide grip", "pegada aberta"),
    ("wide stance", "base aberta"),
    ("narrow stance", "base fechada"),
    ("medium grip", "pegada média"),
    ("reverse grip", "pegada pronada"),
    ("underhand", "pegada supinada"),
    ("overhand", "pegada pronada"),
    ("neutral grip", "pegada neutra"),
    ("palms-down", "palmas para baixo"),
    ("palms down", "palmas para baixo"),
    ("palms-up", "palmas para cima"),
    ("palms up", "palmas para cima"),
    ("palm-up", "palmas para cima"),
    ("one arm", "unilateral"),
    ("one-arm", "unilateral"),
    ("single-arm", "unilateral"),
    ("single arm", "unilateral"),
    ("two-arm", "com os dois braços"),
    ("two arm", "com os dois braços"),
    ("one leg", "unilateral"),
    ("one-legged", "unilateral"),
    ("single-leg", "unilateral"),
    ("single leg", "unilateral"),
    ("alternating", "alternado"),
    ("alternate", "alternado"),
    ("seated", "sentado"),
    ("standing", "em pé"),
    ("lying", "deitado"),
    ("kneeling", "ajoelhado"),
    ("bent-over", "curvado"),
    ("bent over", "curvado"),
    ("behind the back", "por trás"),
    ("behind the head", "atrás da cabeça"),
    ("overhead", "acima da cabeça"),
    ("weighted", "com peso"),
    ("assisted", "assistido"),
    ("high", "alta"),
    ("low", "baixa"),
    # Variacoes de execucao e partes do corpo que aparecem como qualificador.
    ("box", "no caixote"),
    ("goblet", "goblet"),
    ("sumo", "sumô"),
    ("zercher", "zercher"),
    ("jefferson", "jefferson"),
    ("plie", "plié"),
    ("sissy", "sissy"),
    ("bulgarian", "búlgaro"),
    ("arnold", "Arnold"),
    ("zottman", "zottman"),
    ("spider", "spider"),
    ("hammer", "martelo"),
    ("hanging", "na barra"),
    ("captains chair", "na cadeira romana"),
    ("decline bench", "no banco declinado"),
    ("incline bench", "no banco inclinado"),
    ("scapular", "escapular"),
    ("plyo", "pliométrico"),
    ("jumping", "com salto"),
    ("jump", "com salto"),
    ("explosive", "explosivo"),
    ("isometric", "isométrico"),
    ("negative", "negativo"),
    ("partial", "parcial"),
    ("full range-of-motion", "amplitude completa"),
    ("powerlifting", "powerlifting"),
    ("parallel bar", "nas paralelas"),
    ("chest", "para peito"),
    ("triceps", "para tríceps"),
    ("neck", "de pescoço"),
    ("quad", "de quadríceps"),
    ("hamstring", "de posterior"),
    ("glute", "de glúteo"),
    ("calf", "de panturrilha"),
    ("groin", "de adutores"),
    ("hip", "de quadril"),
    ("shoulder", "de ombro"),
    ("wrist", "de punho"),
    ("ankle", "de tornozelo"),
    ("lat", "de dorsal"),
    ("middle back", "de dorsal médio"),
    ("lower back", "lombar"),
    ("upper back", "de dorsal superior"),
    ("abdominal", "abdominal"),
    ("oblique", "oblíquo"),
]


# Genero do movimento base, para a concordancia dos qualificadores. Sem isto
# sai "Rosca martelo alternado" em vez de "alternada" — o tipo de erro que
# denuncia traducao automatica na primeira olhada.
FEMININOS = {
    "Rosca", "Remada", "Puxada", "Elevação", "Flexão", "Extensão", "Panturrilha",
    "Prancha", "Barra", "Subida", "Caminhada", "Isometria", "Ponte", "Rotação",
    "Cadeira", "Flexora", "Corda",
}

# adjetivo masculino -> feminino
FEMININO_DE = {
    "alternado": "alternada", "inclinado": "inclinada", "declinado": "declinada",
    "sentado": "sentada", "deitado": "deitada", "ajoelhado": "ajoelhada",
    "curvado": "curvada", "assistido": "assistida", "invertido": "invertida",
    "completo": "completa", "reto": "reta", "alto": "alta", "baixo": "baixa",
}

# Movimentos genericos demais para ficarem sozinhos: "All Fours Quad Stretch"
# virando so "Alongamento" perde o exercicio inteiro. Quando sobra texto que
# nao foi reconhecido, e melhor deixar em ingles do que entregar um nome que
# parece certo e nao identifica nada.
GENERICOS = {
    "Alongamento", "Elevação", "Extensão", "Desenvolvimento", "Arremesso",
    "Salto", "Caminhada", "Isometria", "Rotação de tronco", "Puxada alta",
}


def concordar(movimento: str, qualificadores: list) -> list:
    if movimento.split()[0] not in FEMININOS:
        return qualificadores
    return [FEMININO_DE.get(q, q) for q in qualificadores]


def traduzir(nome_en: str) -> str:
    bruto = nome_en.lower().strip()
    if bruto in EXATOS:
        return EXATOS[bruto]

    restante = bruto
    partes_consumidas = []

    def _tentar(termo: str) -> bool:
        nonlocal restante
        # \b nao funciona com hifen no fim; a checagem manual de fronteira e
        # mais previsivel aqui.
        i = restante.find(termo)
        if i < 0:
            return False
        antes_ok = i == 0 or not restante[i - 1].isalnum()
        fim = i + len(termo)
        depois_ok = fim >= len(restante) or not restante[fim].isalnum()
        if not (antes_ok and depois_ok):
            return False
        restante = (restante[:i] + " " + restante[fim:]).strip()
        return True

    def consumir(termo: str) -> bool:
        # O catalogo mistura singular e plural para o mesmo exercicio ("Barbell
        # Curl" e "Preacher Curls"). Sem isto, metade dos nomes de rosca, remada
        # e elevacao ficaria sem traducao.
        if _tentar(termo):
            return True
        if termo.endswith("s"):
            return False
        return _tentar(f"{termo}s") or _tentar(f"{termo}es")

    movimento = None
    for termo, pt in MOVIMENTOS:
        if consumir(termo):
            movimento = pt
            break

    if not movimento:
        return ""  # sem movimento reconhecido, melhor deixar para revisao manual

    quals = [pt for termo, pt in QUALIFICADORES if consumir(termo)]
    equips = [pt for termo, pt in EQUIPAMENTOS if consumir(termo)]

    sobra = re.sub(r"[^a-z]+", " ", restante).split()
    ignoraveis = {"the", "a", "an", "on", "with", "to", "of", "and", "or", "in",
                  "for", "from", "over", "up", "down", "version", "s"}
    resto = [p for p in sobra if p not in ignoraveis]

    # A regra que garante qualidade: so traduz quando o nome ingles INTEIRO foi
    # reconhecido. Sobrou "Goblet", "Plyo", "Scapular"? Entao a traducao perdeu
    # justamente o que distingue esse exercicio dos outros — e o resultado
    # seriam varias linhas identicas na busca. Nesses casos o ingles com selo
    # EN e mais util e mais honesto.
    if resto:
        return ""

    # "Side Lateral Raise" nao pode virar "Elevação lateral lateral": o
    # qualificador ja esta embutido no movimento.
    vistos = set(movimento.lower().split())
    quais = [q for q in concordar(movimento, quals) if q.lower() not in vistos]

    # Todos os equipamentos casados entram. Truncar em [:1] seria pior que
    # inutil: o termo foi CONSUMIDO na deteccao de sobra, entao descarta-lo faz
    # "Barbell Squat To A Bench" virar "Agachamento com barra" — silenciosamente
    # o mesmo nome de outro exercicio.
    partes = [movimento, *quais, *equips]
    saida = " ".join(partes)
    return saida[0].upper() + saida[1:] if saida else ""


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--refazer", action="store_true")
    p.add_argument("--amostra", type=int, default=0)
    args = p.parse_args()

    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    atuais = {}
    if SAIDA.exists() and not args.refazer:
        atuais = {k: v for k, v in json.loads(SAIDA.read_text(encoding="utf-8")).items() if v}

    # O seed vem por cima de qualquer traducao automatica ja gravada.
    do_seed = nomes_do_seed()
    atuais = {**atuais, **do_seed}

    saida, novos, falhas = {}, 0, []
    for item in catalogo:
        slug = item["slug"]
        if slug in atuais:
            saida[slug] = atuais[slug]
            continue
        pt = traduzir(item["nomeEn"])
        if pt:
            saida[slug] = pt
            novos += 1
        else:
            saida[slug] = None
            falhas.append(item["nomeEn"])

    # Dois exercicios diferentes com o mesmo nome em portugues sao pior que um
    # nome em ingles: na busca viram duas linhas identicas e nao da para saber
    # qual e qual. Os colididos voltam para o ingles, exceto os que ja estavam
    # no arquivo (esses foram escolhidos a mao).
    porNome = {}
    for slug, pt in saida.items():
        if pt:
            porNome.setdefault(pt, []).append(slug)

    colisoes = 0
    for pt, slugs in porNome.items():
        if len(slugs) < 2:
            continue
        for slug in slugs:
            if slug not in atuais:
                saida[slug] = None
                colisoes += 1

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(
        json.dumps(saida, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    traduzidos = sum(1 for v in saida.values() if v)
    # Conta depois da passagem de colisao: os rejeitados sao reprocessados a
    # cada rodada e voltariam a ser anunciados como "novos" para sempre.
    novos = sum(1 for slug, pt in saida.items() if pt and slug not in atuais)
    print(f"{traduzidos}/{len(saida)} traduzidos ({novos} novos nesta rodada)")
    if colisoes:
        print(f"{colisoes} devolvidos ao inglês por colisão de nome")
    if falhas:
        print(f"{len(falhas)} sem movimento reconhecido — ficam em ingles com selo EN:")
        for nome in falhas[:25]:
            print(f"   {nome}")
        if len(falhas) > 25:
            print(f"   ... e mais {len(falhas) - 25}")

    if args.amostra:
        print(f"\nAmostra de {args.amostra}:")
        mostrados = 0
        for item in catalogo:
            pt = saida.get(item["slug"])
            if not pt:
                continue
            print(f"   {item['nomeEn']:<58} -> {pt}")
            mostrados += 1
            if mostrados >= args.amostra:
                break


if __name__ == "__main__":
    main()
