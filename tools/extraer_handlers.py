#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extraer_handlers.py — saca los handlers inline (onclick="…", onchange="…", …) de un HTML de Lumen
y los pasa a un .js propio, para poder quitar 'unsafe-inline' de script-src (ver tools/csp.py, M1).

    python tools/extraer_handlers.py medico.html            informe (no escribe nada)
    python tools/extraer_handlers.py medico.html --apply    reescribe el HTML y crea lumen-h-medico.js
    python tools/extraer_handlers.py medico.html --check    verifica que el .js generado sigue en sync
    python tools/extraer_handlers.py --estado               qué le falta a cada página para quedar estricta

QUÉ HACE
  Cada atributo on<evento>="código" se quita del tag y el tag recibe data-lh="<ids>". El código se copia
  TAL CUAL (decodificadas las entidades HTML) a lumen-h-<página>.js como function(event){ código }, y al
  final de ese archivo un binder ata cada función con addEventListener al elemento marcado. Se ata
  DIRECTO a cada elemento (no por delegación en document) para conservar el orden de propagación y los
  stopPropagation() que el handler inline ya tenía. `this` es el elemento y `return false` cancela el
  evento, igual que en un handler inline.

LO QUE ESTA HERRAMIENTA NO PUEDE VER (por eso csp.py/check_static lo buscan aparte)
  Código que dependía del ATRIBUTO: removeAttribute('onclick'), getAttribute('onclick'), selectores como
  button[onclick^="x"] o .tab-btn[onclick*="switchTab"]. Con el atributo quitado ese código deja de encontrar
  nada y falla en silencio (en medico.html eran tres casos y rompían un candado de permiso y el historial de
  pestañas). csp.pendientes_inline() los lista; se reemplazan por data-* propios.

QUÉ NO HACE (lo avisa y NO convierte; se resuelve a mano)
  - handlers dentro de strings de JS (innerHTML = '<button onclick=…'): no son atributos del HTML estático.
  - eventos load/error/etc. (el evento ya pasó cuando se ata) y handlers en <body>/<html>.
  - handlers dentro de <template> (querySelectorAll no entra ahí).
  - código del handler que usa un nombre que un handler inline resuelve contra el elemento o el
    document (open, close, value, id, title…): ahí el scope cambia y no se adivina.
  - entidades ambiguas (&x sin ';').

GARANTÍA
  Antes de escribir, compara con html.parser (stdlib, independiente de este tokenizador) que el HTML nuevo,
  con data-lh expandido de vuelta a on<evento>=código, es IDÉNTICO al original salvo el <script> agregado.
  Si no, aborta sin tocar nada. Y el .js generado pasa node --check si hay node.

check_static.py llama a verificar_pagina(): el .js no se edita a mano (lleva los datos fuente en un
comentario LH-DATA y se regenera igual byte a byte).
"""
import re, sys, json, html as _html, pathlib, subprocess, shutil, tempfile, os
from html.parser import HTMLParser

RAIZ = pathlib.Path(__file__).resolve().parent.parent

TAG_RE = re.compile(
    r'<([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s"\'<>/=]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+))?)*)(\s*)(/?)>', re.S)
ATTR_RE = re.compile(r'(\s+)([^\s"\'<>/=]+)(?:\s*=\s*("[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+))?', re.S)
EV_ATTR = re.compile(r'on[a-z]+')
RAW = ("script", "style", "textarea", "title")

# el evento ya ocurrió cuando el binder corre, o no se puede atar a un elemento
EVENTOS_NO = {"load", "error", "abort", "beforeunload", "unload", "pageshow", "pagehide", "popstate",
              "hashchange", "resize", "message", "storage", "online", "offline", "loadstart", "loadeddata",
              "loadedmetadata", "canplay", "canplaythrough", "readystatechange", "toggle"}
TAGS_NO = {"body", "html", "frameset"}

# Nombres que un handler INLINE resuelve contra el elemento / form / document antes que contra window.
# Si el código los usa sin punto, convertir a function cambiaría el significado.
SENSIBLES = set("""
open close write writeln title forms links images scripts all body head location cookie domain referrer URL
anchors applets embeds plugins styleSheets activeElement characterSet charset children defaultView designMode
dir doctype documentElement implementation lastModified readyState hidden visibilityState fonts fullscreen
id name value type checked disabled form style className classList parentNode parentElement firstChild
lastChild nextSibling previousSibling attributes dataset lang tabIndex innerHTML outerHTML innerText
textContent offsetWidth offsetHeight offsetTop offsetLeft clientWidth clientHeight scrollTop scrollLeft
scrollWidth scrollHeight click focus blur remove append prepend before after closest matches select submit
reset length options selectedIndex selected text label placeholder min max step src href target action method
files multiple required readOnly defaultValue elements item namedItem contains getAttribute setAttribute
hasAttribute removeAttribute querySelector querySelectorAll getElementById getElementsByClassName
getElementsByTagName createElement createTextNode addEventListener removeEventListener dispatchEvent
cloneNode appendChild removeChild insertBefore replaceChild childNodes nodeName nodeType nodeValue
offsetParent scrollIntoView setSelectionRange selectionStart selectionEnd validity checkValidity
reportValidity requestSubmit showModal show toggle open
""".split())
IGNORAR = set("""
if else return var let const function new typeof instanceof true false null undefined this event for while do
switch case break continue try catch finally throw in of void delete await async class extends super yield
default with debugger NaN Infinity
""".split())


def eol_de(texto):
    return "\r\n" if "\r\n" in texto else "\n"


def decodificar(v):
    """Decodifica solo referencias con ';' (lo que hace el parser HTML dentro de un atributo)."""
    return re.sub(r'&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);',
                  lambda m: _html.unescape(m.group(0)), v)


def entidad_ambigua(v):
    # '&' seguido de alfanumérico/# que NO cierra con ';' (los navegadores a veces lo dejan literal y
    # html.unescape lo convertiría): no se adivina
    return re.search(r'&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*)(?![A-Za-z0-9;])', v) is not None


def linea_de(texto, pos):
    return texto.count("\n", 0, pos) + 1


def leer_tags(texto):
    """Tags de apertura con sus atributos y offsets. Saltea comentarios y el contenido de script/style/…"""
    pos, prof_tpl, n = 0, 0, len(texto)
    while True:
        i = texto.find("<", pos)
        if i < 0:
            return
        if texto.startswith("<!--", i):
            j = texto.find("-->", i + 4)
            pos = n if j < 0 else j + 3
            continue
        if texto.startswith("<!", i) or texto.startswith("<?", i):
            j = texto.find(">", i)
            pos = n if j < 0 else j + 1
            continue
        if texto.startswith("</", i):
            m = re.match(r"</\s*([A-Za-z][A-Za-z0-9:-]*)", texto[i:i + 40])
            if m and m.group(1).lower() == "template" and prof_tpl > 0:
                prof_tpl -= 1
            j = texto.find(">", i)
            pos = n if j < 0 else j + 1
            continue
        m = TAG_RE.match(texto, i)
        if not m:
            pos = i + 1
            continue
        name = m.group(1).lower()
        base = m.start(2)
        attrs = []
        for a in ATTR_RE.finditer(m.group(2)):
            raw = a.group(3)
            val = None if raw is None else (raw[1:-1] if raw[0] in "\"'" else raw)
            attrs.append({"ini": base + a.start(), "fin": base + a.end(), "nombre": a.group(2),
                          "valor": val})
        yield {"ini": m.start(), "fin": m.end(), "nombre": name, "attrs": attrs, "m": m,
               "en_template": prof_tpl > 0}
        pos = m.end()
        if name == "template" and not m.group(4):
            prof_tpl += 1
        if name in RAW:
            c = re.compile(r"</%s\s*>" % name, re.I).search(texto, pos)
            pos = c.end() if c else n


def _sin_literales(code):
    out, i, n = [], 0, len(code)
    while i < n:
        c = code[i]
        if c in "'\"`":
            q = c
            i += 1
            while i < n and code[i] != q:
                if code[i] == "\\":
                    i += 1
                i += 1
            i += 1
            out.append(" ")
        elif code.startswith("//", i):
            j = code.find("\n", i)
            i = n if j < 0 else j
        elif code.startswith("/*", i):
            j = code.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def nombres_sensibles(code):
    if "`" in code and "${" in code:
        return ["plantilla con ${…}"]
    s = _sin_literales(code)
    locales = set(re.findall(r"\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)", s))
    for g in re.findall(r"function\s*[\w$]*\s*\(([^)]*)\)", s) + re.findall(r"\(([^()]*)\)\s*=>", s):
        locales.update(re.findall(r"[A-Za-z_$][\w$]*", g))
    locales.update(re.findall(r"(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>", s))
    usados = set(re.findall(r"(?<![\w$.])([A-Za-z_$][\w$]*)", s))
    return sorted(x for x in usados if x in SENSIBLES and x not in IGNORAR and x not in locales)


def handlers_en_tags(texto):
    """[(linea, tag, atributo, codigo_decodificado, tag_dict, attr_dict)] de todos los on*= de tags."""
    res = []
    for t in leer_tags(texto):
        for a in t["attrs"]:
            nm = a["nombre"].lower()
            if EV_ATTR.fullmatch(nm) and a["valor"] is not None:
                res.append((linea_de(texto, a["ini"]), t["nombre"], nm, a["valor"], t, a))
    return res


# ───────────────────────── generación del .js ─────────────────────────
def ident(stem):
    return "__lh_" + re.sub(r"[^A-Za-z0-9_]", "_", stem)


def nombre_js(stem):
    return "lumen-h-%s.js" % stem


def generar_js(stem, entradas, fuente):
    """entradas: [[id, evento, codigo], …]. Determinista: mismas entradas => mismos bytes."""
    datos = ("[\n" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in entradas) + "\n]").replace("*/", "*\\/")
    L = []
    L.append("/* GENERADO por tools/extraer_handlers.py — NO editar a mano (tools/check_static.py lo verifica).")
    L.append("   Handlers que estaban inline (atributos on<evento>) en %s, con el código tal cual." % fuente)
    L.append("   Cada elemento marcado con data-lh=\"<ids>\" recibe sus funciones al final de este archivo.")
    L.append("   Motivo: poder sacar 'unsafe-inline' de script-src (ver tools/csp.py y M1 del ROADMAP).")
    L.append("   Para cambiar un handler: editarlo en LH-DATA y correr  python tools/extraer_handlers.py %s --regenerar */" % fuente)
    L.append("/*LH-DATA")
    L.append(datos)
    L.append("LH-DATA*/")
    L.append("window.%s = {" % ident(stem))
    for i, ev, code in entradas:
        L.append("%d: [%s, function (event) {" % (i, json.dumps(ev)))
        L.append(code)
        L.append("}],")
    L.append("};")
    L.append("(function () {")
    L.append("  var T = window.%s;" % ident(stem))
    L.append("  var els = document.querySelectorAll('[data-lh]');")
    L.append("  Array.prototype.forEach.call(els, function (el) {")
    L.append("    el.getAttribute('data-lh').split(' ').forEach(function (id) {")
    L.append("      var h = T[id];")
    L.append("      if (!h) return;")
    L.append("      el.addEventListener(h[0], function (ev) {")
    L.append("        // quitar el id de data-lh (o el atributo entero) desactiva el handler, como antes quitar su atributo inline")
    L.append("        if ((' ' + (el.getAttribute('data-lh') || '') + ' ').indexOf(' ' + id + ' ') < 0) return;")
    L.append("        var r = h[1].call(el, ev);")
    L.append("        if (r === false) ev.preventDefault();")
    L.append("      });")
    L.append("    });")
    L.append("  });")
    L.append("})();")
    return "\n".join(L) + "\n"


def leer_data(js_texto):
    m = re.search(r"/\*LH-DATA\n(.*?)\nLH-DATA\*/", js_texto, re.S)
    if not m:
        return None
    return json.loads(m.group(1))


# ───────────────────────── equivalencia (independiente del tokenizador) ─────────────────────────
class _Ev(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ev = []

    def handle_starttag(self, tag, attrs):
        self.ev.append(("s", tag, tuple(sorted((k, v) for k, v in attrs))))

    def handle_startendtag(self, tag, attrs):
        self.ev.append(("s", tag, tuple(sorted((k, v) for k, v in attrs))))

    def handle_endtag(self, tag):
        self.ev.append(("e", tag))

    def handle_data(self, d):
        self.ev.append(("d", d))

    def handle_comment(self, d):
        self.ev.append(("c", d))

    def handle_decl(self, d):
        self.ev.append(("x", d))


def _eventos(texto, expandir=None, quitar_src=None):
    p = _Ev()
    p.feed(texto)
    p.close()
    out = []
    for e in p.ev:
        if e[0] == "s" and expandir is not None:
            attrs = dict(e[2])
            if "data-lh" in attrs:
                for i in attrs.pop("data-lh").split(" "):
                    ev, code = expandir[int(i)]
                    attrs["on" + ev] = code
            e = ("s", e[1], tuple(sorted(attrs.items())))
        out.append(e)
    # sacar el <script src="lumen-h-…"> agregado y el espacio en blanco que lo rodea
    if quitar_src:
        fin, i = [], 0
        while i < len(out):
            e = out[i]
            if e[0] == "s" and e[1] == "script" and dict(e[2]).get("src", "").split("?")[0] == quitar_src:
                i += 1
                if i < len(out) and out[i] == ("e", "script"):
                    i += 1
                continue
            fin.append(e)
            i += 1
        out = fin
    # unir datos contiguos y descartar los que son solo blancos (el salto de línea que se insertó)
    res = []
    for e in out:
        if e[0] == "d" and res and res[-1][0] == "d":
            res[-1] = ("d", res[-1][1] + e[1])
        else:
            res.append(e)
    return [e for e in res if not (e[0] == "d" and not e[1].strip())] if True else res


def _norm_datos(ev):
    # los blancos entre tags pueden cambiar al insertar el <script>: se comparan sin blancos en los bordes
    return [(e[0], e[1].strip()) if e[0] == "d" else e for e in ev]


def equivalentes(original, nuevo, entradas, js_nombre):
    exp = {i: (ev, decodificar(code) if False else code) for i, ev, code in entradas}
    a = _norm_datos(_eventos(original))
    b = _norm_datos(_eventos(nuevo, expandir=exp, quitar_src=js_nombre))
    if a == b:
        return None
    for k, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return "difiere el evento #%d:\n   original: %r\n   nuevo:    %r" % (k, str(x)[:300], str(y)[:300])
    return "distinta cantidad de eventos (%d vs %d)" % (len(a), len(b))


# ───────────────────────── extracción ─────────────────────────
def extraer(texto, stem, previas=None):
    """Devuelve (nuevo_texto, entradas, informe) o lanza ValueError si algo no cierra.
    informe = {'convertidos': [...], 'problemas': [...]}"""
    previas = [list(x) for x in (previas or [])]
    sig = max([x[0] for x in previas], default=0) + 1
    entradas = previas[:]
    problemas, convertidos, ediciones = [], [], []
    por_tag = {}
    ultimo_fin = -1
    for linea, tag, nm, val, t, a in handlers_en_tags(texto):
        ev = nm[2:]
        code = decodificar(val)
        donde = "línea %d <%s %s>" % (linea, tag, nm)
        if t["nombre"] in TAGS_NO:
            problemas.append("%s: handler en <%s> (se ata antes que exista lo que escucha)" % (donde, t["nombre"])); continue
        if ev in EVENTOS_NO:
            problemas.append("%s: evento '%s' ya ocurrió cuando se ata" % (donde, ev)); continue
        if t["en_template"]:
            problemas.append("%s: dentro de <template>" % donde); continue
        if entidad_ambigua(val):
            problemas.append("%s: entidad HTML ambigua (& sin ';') en el código" % donde); continue
        if not code.strip():
            problemas.append("%s: handler vacío" % donde); continue
        sens = nombres_sensibles(code)
        if sens:
            problemas.append("%s: usa %s (un handler inline lo resuelve contra el elemento/document): revisar a mano -> %s"
                             % (donde, ", ".join(sens), code[:80])); continue
        i = sig
        sig += 1
        entradas.append([i, ev, code])
        por_tag.setdefault(t["ini"], (t, []))[1].append((a, i))
        convertidos.append((linea, tag, nm, code))
        ultimo_fin = max(ultimo_fin, t["fin"])
    for ini, (t, lista) in por_tag.items():
        m = t["m"]
        attrs_raw = m.group(2)
        base = m.start(2)
        quitar = sorted(((a["ini"] - base, a["fin"] - base) for a, _ in lista), reverse=True)
        for x, y in quitar:
            attrs_raw = attrs_raw[:x] + attrs_raw[y:]
        ids = [str(i) for _, i in lista]
        previo = next((a for a in t["attrs"] if a["nombre"].lower() == "data-lh" and a["valor"] is not None), None)
        if previo is not None:
            # ya tenía data-lh: se agregan los ids al valor existente
            ids = previo["valor"].split() + ids
            x, y = previo["ini"] - base, previo["fin"] - base
            # (ojo: los offsets se corrieron si se quitaron atributos antes) -> recalcular sobre attrs_raw
            attrs_raw = re.sub(r'\s+data-lh\s*=\s*("[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+)', "", attrs_raw)
        nuevo_tag = "<%s%s data-lh=\"%s\"%s%s>" % (m.group(1), attrs_raw, " ".join(ids), m.group(3), m.group(4))
        ediciones.append((t["ini"], t["fin"], nuevo_tag))
    js = nombre_js(stem)
    ya_tiene_script = re.search(r'<script\b[^>]*\bsrc="%s(?:\?[^"]*)?"' % re.escape(js), texto) is not None
    if convertidos and not ya_tiene_script:
        # el binder tiene que correr cuando ya existen todos los elementos con handler: antes del primer
        # <script> que viene después del último de ellos
        pos = None
        for t in leer_tags(texto):
            if t["nombre"] == "script" and t["ini"] > ultimo_fin:
                pos = t["ini"]
                break
        eol = eol_de(texto)
        if pos is None:
            pos = texto.lower().rfind("</body>")
            if pos < 0:
                raise ValueError("no encuentro dónde insertar el <script> del binder (ni <script> posterior ni </body>)")
            ins = "<script src=\"%s\"></script>%s" % (js, eol)
        else:
            ini_linea = texto.rfind("\n", 0, pos) + 1
            ind = texto[ini_linea:pos]
            ind = ind if ind.strip() == "" else ""
            ins = "<script src=\"%s\"></script>%s%s" % (js, eol, ind)
        ediciones.append((pos, pos, ins))
    nuevo = texto
    for ini, fin, rep in sorted(ediciones, key=lambda e: (e[0], e[1]), reverse=True):
        nuevo = nuevo[:ini] + rep + nuevo[fin:]
    if convertidos:
        err = equivalentes(texto, nuevo, entradas, js)
        if err:
            raise ValueError("la verificación de equivalencia falló, no se escribe nada: " + err)
    return nuevo, entradas, {"convertidos": convertidos, "problemas": problemas}


def _node_check(js_texto):
    if not shutil.which("node"):
        return None
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8", newline="\n") as tf:
        tf.write(js_texto)
        ruta = tf.name
    try:
        r = subprocess.run(["node", "--check", ruta], capture_output=True, text=True)
        return None if r.returncode == 0 else r.stderr.strip()
    finally:
        os.unlink(ruta)


def verificar_pagina(p):
    """Para check_static: lista de errores del par HTML + lumen-h-<stem>.js. Vacío = en sync."""
    p = pathlib.Path(p)
    stem = p.stem
    texto = p.read_text(encoding="utf-8", errors="replace")
    jsp = p.parent / nombre_js(stem)
    usa = re.search(r'\bdata-lh="', texto) is not None
    if not jsp.exists():
        return ["%s tiene data-lh pero falta %s" % (p.name, jsp.name)] if usa else []
    errs = []
    js = jsp.read_text(encoding="utf-8", errors="replace")
    datos = leer_data(js)
    if datos is None:
        return ["%s: no tiene el bloque LH-DATA (¿se editó a mano?)" % jsp.name]
    if generar_js(stem, datos, p.name) != js.replace("\r\n", "\n"):
        errs.append("%s no coincide con lo que genera tools/extraer_handlers.py desde su LH-DATA (se editó a mano). "
                    "Editá LH-DATA y corré: python tools/extraer_handlers.py %s --regenerar" % (jsp.name, p.name))
    ids = {x[0] for x in datos}
    usados = set()
    for m in re.finditer(r'\bdata-lh="([^"]*)"', texto):
        for i in m.group(1).split():
            usados.add(int(i))
    for i in sorted(usados - ids):
        errs.append("%s: data-lh=\"%d\" no existe en %s" % (p.name, i, jsp.name))
    for i in sorted(ids - usados):
        errs.append("%s: el handler %d de %s no lo usa ningún elemento (quedó huérfano)" % (p.name, i, jsp.name))
    if not re.search(r'<script\b[^>]*\bsrc="%s(?:\?[^"]*)?"' % re.escape(jsp.name), texto):
        errs.append("%s no carga %s" % (p.name, jsp.name))
    return errs


def estado():
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import csp
    for p in csp.paginas():
        t = p.read_text(encoding="utf-8", errors="replace")
        hs = handlers_en_tags(t)
        conv = prob = 0
        try:
            _, _, inf = extraer(t, p.stem)
            conv, prob = len(inf["convertidos"]), len(inf["problemas"])
        except ValueError as e:
            prob = len(hs)
        pend = csp.pendientes_inline(p)
        marca = "ESTRICTA" if csp.es_estricta(p) else ("lista" if not pend else "")
        print("%-28s handlers=%3d  convertibles=%3d  a mano=%2d  otros pendientes=%2d  %s" % (
            p.name, len(hs), conv, prob, len([x for x in pend if "handler inline en tag" not in x]), marca))
    return 0


def main(argv):
    if "--estado" in argv:
        return estado()
    nombres = [a for a in argv if not a.startswith("-")]
    if not nombres:
        print(__doc__)
        return 2
    rc = 0
    for n in nombres:
        p = pathlib.Path(n)
        if not p.is_absolute():
            p = RAIZ / n
        if not p.exists():
            print("no existe %s" % n); return 2
        stem = p.stem
        jsp = p.parent / nombre_js(stem)
        if "--check" in argv:
            e = verificar_pagina(p)
            print(("✗ " + "\n✗ ".join(e)) if e else "✓ %s en sync" % p.name)
            rc |= 1 if e else 0
            continue
        with open(p, encoding="utf-8", errors="replace", newline="") as f:
            texto = f.read()
        previas = None
        if jsp.exists():
            previas = leer_data(jsp.read_text(encoding="utf-8"))
            if previas is None:
                print("%s existe y no tiene LH-DATA: no lo piso" % jsp.name); return 2
        if "--regenerar" in argv:
            if previas is None:
                print("no hay %s para regenerar" % jsp.name); return 2
            js = generar_js(stem, previas, p.name)
            e = _node_check(js)
            if e:
                print("✗ el .js regenerado no pasa node --check:\n" + e); return 1
            with open(jsp, "w", encoding="utf-8", newline="\n") as f:
                f.write(js)
            print("✓ regenerado %s" % jsp.name)
            continue
        try:
            nuevo, entradas, inf = extraer(texto, stem, previas)
        except ValueError as e:
            print("✗ %s: %s" % (p.name, e)); return 1
        print("%s: %d handler(es) convertible(s), %d a mano" % (p.name, len(inf["convertidos"]), len(inf["problemas"])))
        for linea, tag, nm, code in inf["convertidos"]:
            print("   ok  línea %-4d <%s %s>  %s" % (linea, tag, nm, code[:70].replace("\n", " ")))
        for pr in inf["problemas"]:
            print("   !!  " + pr)
        if "--apply" not in argv:
            print("(informe: no se escribió nada. Con --apply se aplica)")
            rc |= 1 if inf["problemas"] else 0
            continue
        if inf["problemas"] and "--parcial" not in argv:
            print("✗ hay handlers que no se pueden convertir solos: no se aplica nada. Resolvelos a mano o usá --parcial")
            return 1
        if not inf["convertidos"]:
            print("nada para convertir"); continue
        js = generar_js(stem, entradas, p.name)
        e = _node_check(js)
        if e:
            print("✗ el .js generado no pasa node --check, no se escribe nada:\n" + e); return 1
        with open(jsp, "w", encoding="utf-8", newline="\n") as f:
            f.write(js)
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(nuevo)
        print("✓ escrito %s y %s. Falta: python versionar.py %s && python tools/csp.py --apply" % (p.name, jsp.name, p.name))
    return rc


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):
        try: _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    sys.exit(main(sys.argv[1:]))
