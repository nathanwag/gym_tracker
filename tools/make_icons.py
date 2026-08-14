"""Gera os icones PNG do app usando SO a biblioteca padrao do Python.

Pillow nao esta instalado nesta maquina e nao vale adicionar uma dependencia
so para desenhar quatro quadrados, entao os icones sao rasterizados aqui:
cada forma e um campo de distancia (SDF) de retangulo arredondado, o que da
antialiasing analitico e bordas limpas em qualquer tamanho.

Uso:  python tools/make_icons.py
Saida: www/icons/icon-180.png, icon-192.png, icon-512.png, icon-512-maskable.png
"""

import math
import os
import struct
import zlib

# Cores alinhadas ao tema escuro do app (css/styles.css).
BG_TOP = (0x1D, 0x22, 0x2C)
BG_BOTTOM = (0x0D, 0x0F, 0x14)
GLYPH = (0xFF, 0x7A, 0x1A)

# Halteres, em fracoes do lado do icone: (cx, cy, meia-largura, meia-altura, raio).
# O conjunto ocupa 65% da largura, cabendo na zona segura de 80% exigida pelos
# icones "maskable" do Android e na mascara arredondada do iOS.
BARBELL = [
    (0.5000, 0.500, 0.26563, 0.03320, 0.0332),   # barra
    (0.2988, 0.500, 0.04297, 0.14258, 0.0293),   # anilha grande esquerda
    (0.7012, 0.500, 0.04297, 0.14258, 0.0293),   # anilha grande direita
    (0.2080, 0.500, 0.03613, 0.09570, 0.0254),   # anilha pequena esquerda
    (0.7920, 0.500, 0.03613, 0.09570, 0.0254),   # anilha pequena direita
]

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www", "icons")


def rrect_sdf(px, py, cx, cy, hw, hh, r):
    """Distancia com sinal ate um retangulo arredondado (negativo = dentro)."""
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def render(size, corner_radius):
    """Rasteriza o icone em RGBA. corner_radius em fracao do lado (0 = quadrado)."""
    px_shapes = [(cx * size, cy * size, hw * size, hh * size, r * size) for cx, cy, hw, hh, r in BARBELL]
    tile_r = corner_radius * size
    half = size / 2.0
    buf = bytearray(size * size * 4)

    for y in range(size):
        py = y + 0.5
        t = y / (size - 1)
        bg = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        row = y * size * 4

        for x in range(size):
            px = x + 0.5

            # Cobertura do ladrilho (canto arredondado nos icones "any").
            if tile_r > 0:
                d = rrect_sdf(px, py, half, half, half, half, tile_r)
                tile_a = min(max(0.5 - d, 0.0), 1.0)
            else:
                tile_a = 1.0

            if tile_a <= 0.0:
                continue

            # Cobertura do glifo: uniao das formas = menor distancia.
            gd = min(rrect_sdf(px, py, *s) for s in px_shapes)
            ga = min(max(0.5 - gd, 0.0), 1.0)

            i = row + x * 4
            if ga <= 0.0:
                buf[i] = bg[0]
                buf[i + 1] = bg[1]
                buf[i + 2] = bg[2]
            else:
                buf[i] = round(bg[0] + (GLYPH[0] - bg[0]) * ga)
                buf[i + 1] = round(bg[1] + (GLYPH[1] - bg[1]) * ga)
                buf[i + 2] = round(bg[2] + (GLYPH[2] - bg[2]) * ga)
            buf[i + 3] = round(tile_a * 255)

    return buf


def write_png(path, size, rgba):
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filtro 0 (None) por linha
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    targets = [
        ("icon-180.png", 180, 0.0),           # apple-touch-icon: o iOS aplica a propria mascara
        ("icon-192.png", 192, 0.22),
        ("icon-512.png", 512, 0.22),
        ("icon-512-maskable.png", 512, 0.0),  # maskable: precisa sangrar ate a borda
    ]
    for name, size, radius in targets:
        path = os.path.join(OUT_DIR, name)
        write_png(path, size, render(size, radius))
        print(f"{name}  {size}x{size}  {os.path.getsize(path):,} bytes")


if __name__ == "__main__":
    main()
