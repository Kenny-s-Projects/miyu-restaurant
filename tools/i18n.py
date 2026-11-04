"""Traduction de la page : repère les textes français du design et les remplace par leur traduction.

- textes entre balises (hors <style> et <script>)
- attributs alt, aria-label, placeholder, title
- chaînes entre apostrophes dans la logique de la page (données des menus, etc.)
"""
import re

ATTRS = ("alt", "aria-label", "placeholder", "title")
_word = re.compile(r"[A-Za-zÀ-ÿ]")


def _is_text(t):
    t = t.strip()
    if not t or not _word.search(t):
        return False
    if re.fullmatch(r"(\{\{[^}]*\}\}\s*)+", t):
        return False
    return True


def _is_js_text(t):
    if not _is_text(t) or ";" in t or t.startswith(("/", "http", "#", "data:")):
        return False
    if re.match(r"^[a-z-]+:\s", t) or re.fullmatch(r"[\d.]+(px|ms|s|%)", t):  # styles
        return False
    if re.fullmatch(r"[a-z]+", t) and len(t) < 12:  # identifiants internes (resto, lounge, home…)
        return False
    if re.search(r"\b(px|rgba?|#[0-9a-f]{3,6})\b", t):  # styles
        return False
    return True


def _split(src):
    """Découpe la source en morceaux (type, texte) : 'html', 'style', 'script'."""
    out, i = [], 0
    for m in re.finditer(r"(<style\b[^>]*>.*?</style>)|(<script\b[^>]*>)(.*?)(</script>)", src, re.S):
        out.append(("html", src[i:m.start()]))
        if m.group(1):
            out.append(("raw", m.group(1)))
        else:
            out.append(("raw", m.group(2)))
            out.append(("script", m.group(3)))
            out.append(("raw", m.group(4)))
        i = m.end()
    out.append(("html", src[i:]))
    return out


def _js_strings(code):
    """Chaînes littérales '…' et "…" d'un code JavaScript : (début, fin, guillemet, contenu brut)."""
    i, n = 0, len(code)
    while i < n:
        c = code[i]
        if c == "/" and code[i + 1:i + 2] == "/":
            i = code.find("\n", i)
            i = n if i < 0 else i
        elif c == "/" and code[i + 1:i + 2] == "*":
            i = code.find("*/", i + 2)
            i = n if i < 0 else i + 2
        elif c in "'\"`":
            j = i + 1
            while j < n and code[j] != c:
                j += 2 if code[j] == "\\" else 1
            if c != "`":
                yield i, j + 1, c, code[i + 1:j]
            i = j + 1
        else:
            i += 1


def _unescape(raw):
    return re.sub(r"\\(.)", r"\1", raw)


def _escape(val, q):
    return val.replace("\\", "\\\\").replace(q, "\\" + q)
_txt = re.compile(r">([^<>]+)<")
_attr = re.compile(r'\b(' + "|".join(ATTRS) + r')="([^"]*)"')


def extract(src):
    seen, order = set(), []

    def add(t):
        t = t.strip()
        if t not in seen:
            seen.add(t)
            order.append(t)

    for kind, chunk in _split(src):
        if kind == "html":
            for m in _txt.finditer(chunk):
                if _is_text(m.group(1)):
                    add(m.group(1))
            for m in _attr.finditer(chunk):
                if _is_text(m.group(2)) and "{{" not in m.group(2):
                    add(m.group(2))
        elif kind == "script":
            for _, _, _, raw in _js_strings(chunk):
                if _is_js_text(_unescape(raw)):
                    add(_unescape(raw))
    return order


def translate(src, tr):
    missing = []

    def look(t):
        key = t.strip()
        if key in tr:
            return t.replace(key, tr[key]) if key else t
        missing.append(key)
        return t

    parts = []
    for kind, chunk in _split(src):
        if kind == "html":
            chunk = _txt.sub(lambda m: ">" + (look(m.group(1)) if _is_text(m.group(1)) else m.group(1)) + "<", chunk)
            chunk = _attr.sub(
                lambda m: f'{m.group(1)}="' + (look(m.group(2)) if _is_text(m.group(2)) and "{{" not in m.group(2) else m.group(2)) + '"',
                chunk,
            )
        elif kind == "script":
            out, last = [], 0
            for a, b, q, raw in _js_strings(chunk):
                val = _unescape(raw)
                if not _is_js_text(val):
                    continue
                new = look(val)
                if new != val:
                    out.append(chunk[last:a] + q + _escape(new, q) + q)
                    last = b
            chunk = "".join(out) + chunk[last:]
        parts.append(chunk)
    return "".join(parts), sorted(set(missing))
