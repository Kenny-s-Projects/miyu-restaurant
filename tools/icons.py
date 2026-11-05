"""Génère le favicon et l'image d'aperçu des liens (WhatsApp, Facebook…) à partir du monogramme.

    python3 -I tools/icons.py   # puis python3 -I tools/build.py

Source : design/assets/monogram.jpg (monogramme doré sur fond vert).
Le fond est prolongé avec la couleur moyenne des bords de l'image pour obtenir les formats carrés et 1200 × 630.
"""
from pathlib import Path

from PIL import Image, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / "design" / "assets"
src = Image.open(ASSETS / "monogram.jpg").convert("RGB")
w, h = src.size

# Couleur du fond : moyenne d'une bande de 4 px sur le pourtour.
border = [src.getpixel((x, y)) for x in range(w) for y in range(h) if x < 4 or y < 4 or x >= w - 4 or y >= h - 4]
bg = tuple(round(sum(c[i] for c in border) / len(border)) for i in range(3))

# Masque aux bords adoucis pour fondre l'image dans le fond prolongé (pas de cassure visible).
mask = Image.new("L", (w, h), 0)
mask.paste(255, (6, 6, w - 6, h - 6))
mask = mask.filter(ImageFilter.GaussianBlur(4))


def compose(cw, ch, logo_h):
    canvas = Image.new("RGB", (cw, ch), bg)
    lw = round(w * logo_h / h)
    logo = src.resize((lw, logo_h), Image.LANCZOS)
    m = mask.resize((lw, logo_h), Image.LANCZOS)
    canvas.paste(logo, ((cw - lw) // 2, (ch - logo_h) // 2), m)
    return canvas


# Favicon : monogramme sur ~84 % de la hauteur d'un carré.
big = compose(512, 512, 430)
for size, name in [(32, "favicon-32.png"), (180, "apple-touch-icon.png"), (192, "favicon-192.png")]:
    big.resize((size, size), Image.LANCZOS).save(ASSETS / name, optimize=True)

# Aperçu des liens : 1200 × 630, monogramme centré.
compose(1200, 630, 470).save(ASSETS / "apercu-lien.jpg", quality=88, optimize=True, progressive=True)
print("fond", "#%02x%02x%02x" % bg, "· favicon-32.png, favicon-192.png, apple-touch-icon.png, apercu-lien.jpg")
