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

tools/check_static.py llama a este mismo cálculo: si alguien agrega una librería, un
host o un iframe y no regenera, el chequeo falla (no queda una CSP vieja que bloquee
una función en silencio).

QUÉ PROTEGE (y qué no)
  Protege: object-src 'none', base-uri, form-action, lista blanca de hosts para scripts,
  estilos, fuentes y sobre todo connect-src (dificulta sacar datos a un host ajeno).
  NO frena XSS inyectado: hay ~480 handlers inline (onclick=...) y script/style inline,
  y mientras existan, script-src necesita 'unsafe-inline'. Cuando se migren a
  addEventListener se puede sacar. No inventar protección que no hay.

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

def politica(p):
    c = contenido_pagina(p)
    eval_ = "ajax/libs/exceljs/" in c            # ExcelJS 4.3.0 (cdnjs)
    ocr = "tesseract" in c                        # OCR: wasm + datos de idioma
    # Solo se habilita un CDN si la página (o sus .js locales) lo nombra. Desde el 27/11/2026 las
    # librerías viven en vendor/ (ver vendor/VENDOR.md); queda jsDelivr sólo donde se usa de verdad (OCR).
    usa_jsd, usa_cdnjs = "cdn.jsdelivr.net" in c, "cdnjs.cloudflare.com" in c
    script = ["'self'", "'unsafe-inline'"] + ([JSD] if usa_jsd else []) + ([CDNJS] if usa_cdnjs else [])
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
    aplicar = "--apply" in argv
    difieren = []
    for p in paginas():
        want, have = politica(p), meta_actual(p)
        if have == want: continue
        difieren.append(p)
        if aplicar:
            t = _texto(p)
            nuevo = '<meta http-equiv="Content-Security-Policy" content="%s"/>' % want
            if have is None:
                if t.count("<head>") != 1: print("  ! %s: sin <head> único, no se pudo" % p.name); continue
                t = t.replace("<head>", "<head>\n" + nuevo, 1)
            else:
                assert len(META_RE.findall(t)) == 1, p.name
                t = META_RE.sub(lambda m: nuevo, t, count=1)
            with open(p, "w", encoding="utf-8", newline="") as f: f.write(t)
    for p in difieren:
        print(("  actualizado " if aplicar else "  DIFIERE ") + p.relative_to(RAIZ).as_posix())
    print("%d página(s) %s." % (len(difieren), "actualizadas" if aplicar else "no coinciden"))
    return 0 if (aplicar or not difieren) else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
