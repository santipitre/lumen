#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
csp.py — única fuente de verdad de la Content-Security-Policy de Lumen.

GitHub Pages no deja mandar cabeceras HTTP, así que la CSP va en un <meta> por página.
En vez de mantener 31 copias a mano, este script CALCULA la política de cada página a
partir de lo que la página realmente usa (mira el HTML y los .js locales que carga) y
escribe el <meta>.

    python tools/csp.py            lista las páginas cuyo <meta> no coincide (exit 1 si hay)
    python tools/csp.py --apply    reescribe el <meta> de cada página
    python tools/csp.py --show X   imprime la política calculada para X.html
    python tools/csp.py --limpieza imprime qué le falta a cada página para pasar a ESTRICTAS

tools/check_static.py llama a este mismo cálculo: si alguien agrega una librería, un
host o un iframe y no regenera, el chequeo falla (no queda una CSP vieja que bloquee
una función en silencio).

QUÉ PROTEGE (y qué no)
  Protege: object-src 'none', base-uri, form-action, lista blanca de hosts para scripts,
  estilos, fuentes y sobre todo connect-src (dificulta sacar datos a un host ajeno).
  En las páginas de ESTRICTAS (M1, desde 28/11/2026) script-src NO lleva 'unsafe-inline': solo 'self',
  los CDN que use la página y el hash sha256 de cada <script> inline. Ahí SÍ se frena el XSS que
  intente inyectar un <script> o un onclick="...". Para eso la página tiene que estar limpia (cero
  handlers inline, ni en el HTML ni en los strings de sus .js): pendientes_inline() lo verifica y
  check_static falla si una página estricta deja de estarlo.
  En el resto de las páginas (todavía ~400 handlers inline) script-src sigue con 'unsafe-inline' y
  la CSP NO frena XSS inyectado. No inventar protección que no hay. style-src conserva 'unsafe-inline'
  en todas (los style="..." inline son mucho menos graves y migrarlos no vale el costo).
  Cada vez que cambia el texto de un <script> inline de una página estricta cambia su hash:
  correr  python tools/csp.py --apply  (check_static avisa si se olvida).

POR QUÉ 'unsafe-eval' YA NO ESTÁ (24/11/2026)
  ExcelJS 4.3.0 (cdnjs) usa eval al arrancar y sin 'unsafe-eval' NO carga. Todo el repo
  usa ahora ExcelJS 4.4.0 (jsDelivr, SRI fijado), que anda sin eval, así que ninguna
  página lleva 'unsafe-eval'. La detección por contenido sigue activa: si alguien vuelve
  a cargar 4.3.0 desde cdnjs, esa página recupera el permiso y el cambio se ve en el diff.
  Las páginas con OCR (Tesseract) llevan 'wasm-unsafe-eval', que es otra cosa.
"""
import re, sys, pathlib, subprocess

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SB = "erjdncsnomwymjiaslpx.supabase.co"
JSD, CDNJS = "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"

# host de connect-src -> marcador que lo delata en la página o en sus .js locales
CONNECT_POR_MARCADOR = [
    ("https://generativelanguage.googleapis.com", "generativelanguage.googleapis.com"),
    ("https://api.anthropic.com", "api.anthropic.com"),
    ("https://api.openai.com", "api.openai.com"),
]
# páginas que ya tenían una política más estricta de imágenes y la conservan
IMG_ESTRICTO = {"conocimiento.html", "imagenes.html"}
# iframe que muestra un pedido médico desde una URL https arbitraria
FRAME_REMOTO = 'iframe title="pedido médico" src='

# Páginas ya migradas a CSP estricta (sin 'unsafe-inline' en script-src). Es un trinquete: se agregan
# cuando pendientes_inline() da vacío y no se sacan sin una decisión explícita. Clave = ruta relativa.
ESTRICTAS = {"medico.html"}

def _texto(p):
    # newline="" conserva CRLF/LF tal cual: reescribir no debe tocar los saltos de línea
    with open(p, encoding="utf-8", errors="replace", newline="") as f:
        return f.read()

def _scripts_locales(html):
    for m in re.finditer(r'<script[^>]+\bsrc="([^"#?]+\.js)[^"]*"', html, re.I):
        s = m.group(1)
        if not s.startswith(("http:", "https:", "//")):
            yield s

def contenido_pagina(p):
    """HTML + .js locales que carga (un nivel), en minúsculas."""
    html = _texto(p)
    # La propia <meta> de CSP no cuenta como evidencia: si no, un host que ya está en la política
    # se "confirma" a sí mismo para siempre (pasó con generativelanguage.googleapis.com, 27/11/2026).
    html = META_RE.sub("", html)
    partes = [html]
    for s in _scripts_locales(html):
        f = (p.parent / s).resolve()
        if f.exists():
            partes.append(_texto(f))
    return "\n".join(partes).lower()

def _es_libreria(f):
    return f.name.endswith(".min.js") or "vendor" in f.parts

def _lf(t):
    # el parser HTML normaliza CRLF y CR a LF dentro de un <script>; el hash se calcula sobre eso
    return t.replace("\r\n", "\n").replace("\r", "\n")

def scripts_inline(html):
    """[(cuerpo, ejecutable)] de cada <script> sin src (los JSON/plantillas no se ejecutan, no necesitan hash)."""
    import extraer_handlers as eh
    out = []
    cierre = re.compile(r"</script\s*>", re.I)
    for t in eh.leer_tags(html):
        if t["nombre"] != "script":
            continue
        atr = {a["nombre"].lower(): (a["valor"] or "") for a in t["attrs"]}
        if "src" in atr:
            continue
        f = cierre.search(html, t["fin"])
        cuerpo = html[t["fin"]: f.start() if f else len(html)]
        tipo = atr.get("type", "").strip().lower()
        ej = tipo in ("", "module") or re.fullmatch(r"(text|application)/(x-)?(java|ecma)script(\s*;.*)?", tipo) is not None
        out.append((cuerpo, ej))
    return out

def hashes_inline(p):
    """sha256 (base64) de cada <script> inline ejecutable de la página, más el del GUARD anti-iframe
    (que --apply reinserta junto a la <meta>, por eso se calcula aparte). Orden de aparición, sin repetir."""
    import base64, hashlib
    html = GUARD_RE.sub("", META_RE.sub("", _texto(p)))
    cuerpos = [c for c, ej in scripts_inline(html) if ej and c.strip()] + [GUARD_SCRIPT]
    vistos, out = set(), []
    for c in cuerpos:
        h = base64.b64encode(hashlib.sha256(_lf(c).encode("utf-8")).digest()).decode("ascii")
        if h not in vistos:
            vistos.add(h)
            out.append(h)
    return out

# onclick="..." dentro de un string de JS (innerHTML = '<button onclick="...'): un handler inline más, el navegador lo bloquea
HANDLER_JS_RE = re.compile(r"""\bon[a-z]{3,}\s*=\s*\\?["']""")
# código que depende del ATRIBUTO on*: selectores [onclick…], get/set/remove/hasAttribute('onclick'). Quitado el atributo
# (M1) deja de encontrar nada y falla en silencio; setAttribute('onclick', código) además lo bloquea la CSP.
DEP_ATTR_RE = re.compile(r"""\[\s*on[a-z]{3,}\s*[\^*$~|]?\s*=|\[\s*on[a-z]{3,}\s*\]|\b(?:get|set|remove|has)Attribute\(\s*['"`]on[a-z]{3,}""")
JSURL_RE = re.compile(r"""javascript\s*:""", re.I)

def _clave(p):
    try:
        return p.relative_to(RAIZ).as_posix()
    except ValueError:
        return p.name

def es_estricta(p):
    return _clave(p) in ESTRICTAS

def pendientes_inline(p):
    """Lo que impide quitar 'unsafe-inline' de script-src en esta página: handlers on*= en el HTML, en los strings
    de los .js locales que carga (un nivel; las librerías de vendor/ y *.min.js no se miran) y URLs javascript:.
    Los <script> inline NO cuentan: se permiten por hash. Lista vacía = la página puede ser estricta.
    Límite: un .js que cargue otro .js por código (createElement('script')) no se sigue; lo caza el test en navegador."""
    import extraer_handlers as eh
    html = META_RE.sub("", _texto(p))
    pend = []
    for linea, tag, nm, val, t, a in eh.handlers_en_tags(html):
        pend.append("handler inline en tag: %s línea %d <%s %s>" % (p.name, linea, tag, nm))
    sin_scripts = re.sub(r"<script\b.*?</script\s*>", "", html, flags=re.S | re.I)
    for m in JSURL_RE.finditer(sin_scripts):
        pend.append("URL javascript: en %s línea %d" % (p.name, sin_scripts.count("\n", 0, m.start()) + 1))
    for c, ej in scripts_inline(html):
        if ej:
            for m in DEP_ATTR_RE.finditer(c):
                pend.append("depende del atributo on* en un <script> inline de %s: %s" % (p.name, c[m.start():m.start() + 50].replace("\n", " ")))
    for s in _scripts_locales(html):
        f = (p.parent / s).resolve()
        if not f.exists() or _es_libreria(f):
            continue
        t = _texto(f)
        for m in DEP_ATTR_RE.finditer(t):
            pend.append("depende del atributo on* en %s línea %d: %s" % (f.name, t.count("\n", 0, m.start()) + 1, t[m.start():m.start() + 50].replace("\n", " ")))
        for m in HANDLER_JS_RE.finditer(t):
            pend.append("handler inline en string de %s línea %d: %s" % (f.name, t.count("\n", 0, m.start()) + 1, t[m.start():m.start() + 40].replace("\n", " ")))
        for m in JSURL_RE.finditer(t):
            pend.append("URL javascript: en %s línea %d" % (f.name, t.count("\n", 0, m.start()) + 1))
    return pend

def politica(p):
    c = contenido_pagina(p)
    eval_ = "ajax/libs/exceljs/" in c            # ExcelJS 4.3.0 (cdnjs)
    ocr = "tesseract" in c                        # OCR: wasm + datos de idioma
    # Solo se habilita un CDN si la página (o sus .js locales) lo nombra. Desde el 27/11/2026 las
    # librerías viven en vendor/ (ver vendor/VENDOR.md); queda jsDelivr sólo donde se usa de verdad (OCR).
    usa_jsd, usa_cdnjs = "cdn.jsdelivr.net" in c, "cdnjs.cloudflare.com" in c
    estricta = es_estricta(p)
    script = ["'self'"] + ([] if estricta else ["'unsafe-inline'"]) + ([JSD] if usa_jsd else []) + ([CDNJS] if usa_cdnjs else [])
    if estricta:
        script += ["'sha256-%s'" % h for h in hashes_inline(p)]
    if eval_: script.append("'unsafe-eval'")
    if ocr: script.append("'wasm-unsafe-eval'")
    connect = ["'self'", "https://" + SB, "wss://" + SB]
    for host, marca in CONNECT_POR_MARCADOR:
        if marca in c: connect.append(host)
    if ocr: connect.append(JSD)
    frame = ["'self'"] + (["https:"] if FRAME_REMOTO in c else [])
    img = ["'self'", "data:"] if p.name in IMG_ESTRICTO else ["'self'", "data:", "blob:", "https:"]
    d = [
        ("default-src", ["'self'"]),
        ("script-src", script),
        ("style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"] + ([CDNJS] if usa_cdnjs else [])),
        ("font-src", ["'self'", "https://fonts.gstatic.com", "data:"]),
        ("img-src", img),
        ("media-src", ["'self'", "blob:", "data:"]),
        ("connect-src", connect),
        ("worker-src", ["'self'", "blob:"]),
        ("frame-src", frame),
        ("object-src", ["'none'"]),
        ("base-uri", ["'self'"]),
        ("form-action", ["'self'"]),
    ]
    return "; ".join(k + " " + " ".join(v) for k, v in d)

META_RE = re.compile(r'<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*/?>', re.I)

# Anti-clickjacking. GitHub Pages no permite la cabecera frame-ancestors y la <meta> no la admite, así que
# se oculta la página si la enmarca un origen ajeno (o un iframe con sandbox sin allow-same-origin):
# leer top.location.href lanza SecurityError y el <style> queda ocultando todo. Si no está enmarcada, o la
# enmarca el mismo origen (Lumen embebe sus propias páginas, p. ej. el Cronograma), se quita el <style>.
# Es defensa en profundidad; la solución real es la cabecera, que exige otro hosting (ver ROADMAP, M2).
GUARD_SCRIPT = 'try{if(top!==self){void top.location.href}document.getElementById("lumen-antiframe").remove()}catch(e){}'
GUARD = '<style id="lumen-antiframe">html{display:none!important}</style><script>' + GUARD_SCRIPT + '</script>'
GUARD_RE = re.compile(r'<style id="lumen-antiframe">.*?</script>', re.S)

def paginas():
    try:
        out = subprocess.run(["git", "ls-files"], cwd=RAIZ, capture_output=True, text=True, check=True).stdout.split("\n")
        lista = [RAIZ / f for f in out if f.endswith(".html")]
    except Exception:
        lista = [q for q in RAIZ.rglob("*.html") if ".git" not in q.parts]
    return sorted(q for q in lista if q.exists() and "_test" not in q.parts and not q.name.startswith("_"))

def meta_actual(p):
    m = META_RE.search(_texto(p))
    return m.group(1) if m else None

def main(argv):
    if "--show" in argv:
        n = argv[argv.index("--show") + 1]
        print(politica(next(q for q in paginas() if q.name == n or q.relative_to(RAIZ).as_posix() == n)))
        return 0
    if "--limpieza" in argv:
        for p in paginas():
            pend = pendientes_inline(p)
            print("%-30s %s  pendientes=%d" % (_clave(p), "ESTRICTA" if es_estricta(p) else ("lista para pasar" if not pend else "        "), len(pend)))
        return 0
    aplicar = "--apply" in argv
    difieren, sucias = [], []
    for p in paginas():
        if es_estricta(p):
            pend = pendientes_inline(p)
            if pend:
                # una CSP estricta sobre una página con handlers inline la rompe en silencio: no se escribe
                sucias.append((p, pend))
                continue
        want, have = politica(p), meta_actual(p)
        if have == want and (META_RE.search(_texto(p)).group(0) + GUARD) in _texto(p): continue
        difieren.append(p)
        if aplicar:
            t = _texto(p)
            nuevo = '<meta http-equiv="Content-Security-Policy" content="%s"/>' % want
            t = GUARD_RE.sub("", t)                       # el guard se vuelve a poner siempre junto a la <meta>
            if have is None:
                if t.count("<head>") != 1: print("  ! %s: sin <head> único, no se pudo" % p.name); continue
                t = t.replace("<head>", "<head>\n" + nuevo + GUARD, 1)
            else:
                assert len(META_RE.findall(t)) == 1, p.name
                t = META_RE.sub(lambda m: nuevo + GUARD, t, count=1)
            with open(p, "w", encoding="utf-8", newline="") as f: f.write(t)
    for p in difieren:
        print(("  actualizado " if aplicar else "  DIFIERE ") + p.relative_to(RAIZ).as_posix())
    for p, pend in sucias:
        print("  ESTRICTA PERO NO LIMPIA %s (%d):" % (_clave(p), len(pend)))
        for x in pend[:10]:
            print("      " + x)
    print("%d página(s) %s." % (len(difieren), "actualizadas" if aplicar else "no coinciden"))
    return 0 if (not sucias and (aplicar or not difieren)) else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
