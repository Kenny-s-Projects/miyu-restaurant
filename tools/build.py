"""Construit le site (français et anglais) à partir du design.

Entrées :
  design/Main.dc.html          source de la page, en français (copie du canevas)
  design/i18n/en.json          traductions anglaises : texte français -> texte anglais
  design/assets/index.json     identifiant d'image du canevas (/_blob/<id>) -> fichier dans design/assets/
  tools/export-cache.html      un export du design (« Send to Netlify ») : on n'en garde que la coque
                               (chargeur, moteur de rendu, polices), le contenu vient de design/
  tools/reservation-client.js  fenêtre de réservation, ajoutée à chaque page

Sorties :
  public/index.html            version française  (/)
  public/en/index.html         version anglaise   (/en/)
  public/assets/               images
  design/Main.en.dc.html       version anglaise de la source, pour l'aperçu dans le canevas

Usage : python3 -I tools/build.py
        python3 -I tools/build.py --refresh-shell   (récupère d'abord un nouvel export sur le site d'aperçu Netlify)
"""
import json, pathlib, re, shutil, sys, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from i18n import extract, translate  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW = "https://miyu-site-vitrine-cd-9583b654a7.netlify.app/"
SHELL = ROOT / "tools" / "export-cache.html"
DESIGN = ROOT / "design" / "Main.dc.html"
DESIGN_EN = ROOT / "design" / "Main.en.dc.html"
EN_JSON = ROOT / "design" / "i18n" / "en.json"
ASSETS = ROOT / "design" / "assets"
PUBLIC = ROOT / "public"
# Mise en page mobile : sans cette balise, les téléphones affichent la page bureau réduite (≈ 980 px)
# et les règles @media (max-width:720px) de la source ne s'appliquent jamais.
VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">'
SITE = "https://miyurestaurant.com"
# Favicon et aperçu des liens (WhatsApp, Facebook…), générés par tools/icons.py à partir du monogramme.
ICONS = ["favicon-32.png", "favicon-192.png", "apple-touch-icon.png", "apercu-lien.jpg"]


def head_tags(lang, meta):
    """Balises de favicon et d'aperçu des liens (Open Graph). Les URL d'image doivent être absolues."""
    url = f"{SITE}/" if lang == "fr" else f"{SITE}/en/"
    esc = lambda t: t.replace("&", "&amp;").replace('"', "&quot;")
    return (
        '<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">'
        '<link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">'
        '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">'
        '<meta name="theme-color" content="#022d33">'
        '<meta property="og:type" content="website">'
        '<meta property="og:site_name" content="MIYU">'
        f'<meta property="og:locale" content="{"fr_FR" if lang == "fr" else "en_US"}">'
        f'<meta property="og:url" content="{url}">'
        f'<meta property="og:title" content="{esc(meta["title"])}">'
        f'<meta property="og:description" content="{esc(meta["description"])}">'
        f'<meta property="og:image" content="{SITE}/assets/apercu-lien.jpg">'
        '<meta property="og:image:type" content="image/jpeg">'
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
        '<meta property="og:image:alt" content="Monogramme doré MIYU sur fond vert">'
        '<meta name="twitter:card" content="summary_large_image">'
    )

if "--refresh-shell" in sys.argv:
    with urllib.request.urlopen(PREVIEW) as r:
        SHELL.write_bytes(r.read())

SHELL_HTML = SHELL.read_text(encoding="utf-8")
CLIENT = (ROOT / "tools" / "reservation-client.js").read_text(encoding="utf-8")
INDEX = json.loads((ASSETS / "index.json").read_text())

META = {
    "fr": {
        "title": "MIYU — Restaurant & Lounge Bar à Pointe-Noire",
        "description": "MIYU, restaurant japonais et pan-asiatique, lounge bar et rooftop au cœur de Pointe-Noire. Sushis, grillades, cocktails et soirées. Réservez votre table en ligne.",
    },
    "en": {
        "title": "MIYU — Restaurant & Lounge Bar in Pointe-Noire",
        "description": "MIYU, Japanese and pan-Asian restaurant, lounge bar and rooftop in the heart of Pointe-Noire. Sushi, grills, cocktails and nights out. Book your table online.",
    },
}


def block(html, name):
    m = re.search(r'(<script type="__bundler/' + name + r'">)(.*?)(</script>)', html, re.S)
    if not m:
        sys.exit(f"Export invalide : bloc {name} introuvable")
    return m


def english_source(fr_src):
    """Version anglaise de la source : traductions + liens et langue de la page."""
    tr = json.loads(EN_JSON.read_text(encoding="utf-8"))
    en_src, missing = translate(fr_src, tr)
    if missing:
        print("Textes sans traduction anglaise (ajoutez-les à design/i18n/en.json) :")
        for t in missing:
            print("  -", t)
        sys.exit(1)
    en_src = en_src.replace('<html lang="fr">', '<html lang="en">', 1)
    en_src = en_src.replace('href="Main.en.dc.html" hreflang="en"', 'href="Main.dc.html" hreflang="fr"')
    return en_src


def build_page(src, lang, used):
    shell = SHELL_HTML
    manifest = json.loads(block(shell, "manifest").group(2))
    old_tpl = json.loads(block(shell, "template").group(2))
    ext = json.loads(block(shell, "ext_resources").group(2))

    # Tête du gabarit exporté : <head> (moteur), <x-dc>, <helmet> et les polices intégrées.
    h = old_tpl.index("<helmet>")
    head = old_tpl[: old_tpl.index("</style>", h) + len("</style>")] + "\n"
    meta = META[lang]
    alt = (
        f'{VIEWPORT}{head_tags(lang, meta)}<meta name="description" content="{meta["description"]}">'
        f'<link rel="alternate" hreflang="fr" href="{SITE}/"><link rel="alternate" hreflang="en" href="{SITE}/en/">'
        f'<link rel="alternate" hreflang="x-default" href="{SITE}/">'
    )
    head = re.sub(r'<html lang="[a-z]+">', f'<html lang="{lang}">', head, count=1)
    head = re.sub(r"<title>[^<]*</title>", f"<title>{meta['title']}</title>{alt}", head, count=1)

    # Corps : la source, à partir de ce qui suit le lien Google Fonts (remplacé par les polices intégrées).
    link = re.search(r'<link href="https://fonts\.googleapis\.com/css2[^"]*" rel="stylesheet">\n', src)
    if not link:
        sys.exit("Source du design : lien Google Fonts introuvable")
    body = re.sub(r"</body>\s*</html>\s*$", "", src[link.end():]).rstrip() + "\n</body></html>"
    tpl = head + body

    # Liens entre les deux langues.
    tpl = tpl.replace('href="Main.en.dc.html"', 'href="/en/"').replace('href="Main.dc.html"', 'href="/"')

    # Images : chaque /_blob/<id> devient un fichier servi à part (/assets/…).
    ids = sorted(set(re.findall(r"/_blob/([0-9a-f]{32})", tpl)))
    missing = [i for i in ids if i not in INDEX]
    if missing:
        sys.exit("Images absentes de design/assets/index.json : " + ", ".join(missing))
    for bid in ids:
        used.add(INDEX[bid])
        tpl = tpl.replace("/_blob/" + bid, "/assets/" + INDEX[bid])

    # Garde de l'ancien manifeste ce qui sert encore (moteur, polices, ressources externes).
    keep = {e["uuid"] for e in ext}
    new_manifest = {u: e for u, e in manifest.items() if u in tpl or u in keep}

    def put(html, name, text):
        m = block(html, name)
        return html[: m.start(2)] + text + html[m.end(2):]

    html = put(shell, "manifest", json.dumps(new_manifest, separators=(",", ":")))
    html = put(html, "template", json.dumps(tpl).replace("</", "<\\u002F"))

    # Coque : langue, titre, fond sombre pendant le chargement, sans les ajouts du site d'aperçu Netlify.
    html = html.replace("<html>", f'<html lang="{lang}">', 1)
    html = re.sub(r"<title>[^<]*</title>", f"<title>{meta['title']}</title>{VIEWPORT}{head_tags(lang, meta)}", html, count=1)
    html = html.replace("body { background: #faf9f5;", "body { background: #022d33;", 1)
    html = html.replace("#__bundler_thumbnail { position: fixed; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #faf9f5;",
                        "#__bundler_thumbnail { position: fixed; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #022d33;", 1)
    html = re.sub(r'<script async src="/\.netlify/scripts/hud[^"]*"[^>]*></script>', "", html)
    html = re.sub(r"<!-- This site is hosted on Netlify\..*?-->\n?", "", html, flags=re.S)

    # Fenêtre de réservation.
    i = html.index("</title>") + len("</title>")
    return html[:i] + "\n<script>\n" + CLIENT + "\n</script>\n" + html[i:]


fr_src = DESIGN.read_text(encoding="utf-8")
en_src = english_source(fr_src)
DESIGN_EN.write_text(en_src, encoding="utf-8")

used = set()
pages = {"fr": PUBLIC / "index.html", "en": PUBLIC / "en" / "index.html"}
for lang, src in (("fr", fr_src), ("en", en_src)):
    pages[lang].parent.mkdir(parents=True, exist_ok=True)
    pages[lang].write_text(build_page(src, lang, used), encoding="utf-8")

pub_assets = PUBLIC / "assets"
pub_assets.mkdir(parents=True, exist_ok=True)
for old in pub_assets.iterdir():
    old.unlink()
used.update(ICONS)
for name in sorted(used):
    shutil.copy(ASSETS / name, pub_assets / name)

for lang, p in pages.items():
    print(f"OK {lang} {p.relative_to(ROOT)} {p.stat().st_size:,} octets")
print(f"OK {len(used)} images dans public/assets · {len(extract(fr_src))} textes traduits")
