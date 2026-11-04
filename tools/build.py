"""Construit public/index.html à partir du design.

Entrées :
  design/Main.dc.html          source de la page (copie du canevas)
  design/assets/index.json     identifiant d'image du canevas (/_blob/<id>) -> fichier dans design/assets/
  tools/export-cache.html      un export du design (« Send to Netlify ») : on n'en garde que la coque
                               (chargeur, moteur de rendu, polices), le contenu vient de design/
  tools/reservation-client.js  fenêtre de réservation, ajoutée à la page

Usage : python3 -I tools/build.py
        python3 -I tools/build.py --refresh-shell   (récupère d'abord un nouvel export sur le site d'aperçu Netlify)
"""
import json, pathlib, re, shutil, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW = "https://miyu-site-vitrine-cd-9583b654a7.netlify.app/"
SHELL = ROOT / "tools" / "export-cache.html"
DESIGN = ROOT / "design" / "Main.dc.html"
ASSETS = ROOT / "design" / "assets"

if "--refresh-shell" in sys.argv:
    with urllib.request.urlopen(PREVIEW) as r:
        SHELL.write_bytes(r.read())

shell = SHELL.read_text(encoding="utf-8")
blocks = {}
for name in ("manifest", "template", "ext_resources", "page_order"):
    m = re.search(r'(<script type="__bundler/' + name + r'">)(.*?)(</script>)', shell, re.S)
    if not m:
        sys.exit(f"Export invalide : bloc {name} introuvable")
    blocks[name] = m
manifest = json.loads(blocks["manifest"].group(2))
old_tpl = json.loads(blocks["template"].group(2))
ext = json.loads(blocks["ext_resources"].group(2))

# Tête du gabarit exporté : <head> (moteur), <x-dc>, <helmet> et les polices intégrées.
h = old_tpl.index("<helmet>")
fonts_end = old_tpl.index("</style>", h) + len("</style>")
head = old_tpl[:fonts_end] + "\n"

# Corps : la source du design, à partir de ce qui suit le lien Google Fonts (remplacé par les polices intégrées).
src = DESIGN.read_text(encoding="utf-8")
link = re.search(r'<link href="https://fonts\.googleapis\.com/css2[^"]*" rel="stylesheet">\n', src)
if not link:
    sys.exit("Source du design : lien Google Fonts introuvable")
body = src[link.end():]
body = re.sub(r"</body>\s*</html>\s*$", "", body).rstrip() + "\n</body></html>"
tpl = head + body

# Images : chaque /_blob/<id> devient un fichier servi à part (/assets/…), mis en cache par le navigateur.
index = json.loads((ASSETS / "index.json").read_text())
used_ids = sorted(set(re.findall(r"/_blob/([0-9a-f]{32})", tpl)))
missing = [i for i in used_ids if i not in index]
if missing:
    sys.exit("Images absentes de design/assets/index.json : " + ", ".join(missing))
pub_assets = ROOT / "public" / "assets"
pub_assets.mkdir(parents=True, exist_ok=True)
for old in pub_assets.iterdir():
    old.unlink()
for bid in used_ids:
    name = index[bid]
    shutil.copy(ASSETS / name, pub_assets / name)
    tpl = tpl.replace("/_blob/" + bid, "/assets/" + name)
new_manifest = {}

# Garde de l'ancien manifeste ce qui sert encore (moteur, polices, ressources externes).
keep = {e["uuid"] for e in ext}
for u, entry in manifest.items():
    if u in tpl or u in keep:
        new_manifest[u] = entry

def put(block, text):
    global shell
    m = re.search(r'(<script type="__bundler/' + block + r'">)(.*?)(</script>)', shell, re.S)
    shell = shell[: m.start(2)] + text + shell[m.end(2):]

put("manifest", json.dumps(new_manifest, separators=(",", ":")))
put("template", json.dumps(tpl).replace("</", "<\\u002F"))
html = shell

# Nettoyage des ajouts propres au site d'aperçu Netlify.
html = re.sub(r'<script async src="/\.netlify/scripts/hud[^"]*"[^>]*></script>', "", html)
html = re.sub(r"<!-- This site is hosted on Netlify\..*?-->\n?", "", html, flags=re.S)

# Fenêtre de réservation.
client = (ROOT / "tools" / "reservation-client.js").read_text(encoding="utf-8")
i = html.index("</title>") + len("</title>")
html = html[:i] + "\n<script>\n" + client + "\n</script>\n" + html[i:]

out = ROOT / "public" / "index.html"
out.write_text(html, encoding="utf-8")
print(f"OK {out} {len(html):,} octets · {len(used_ids)} images dans public/assets · {len(new_manifest)} ressources intégrées")
