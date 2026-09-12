# -*- coding: utf-8 -*-
"""
============================================================
versionar.py — sella los assets de una página con su hash
============================================================
Reescribe los <link href> y <script src> locales de un HTML
poniéndoles ?v=<hash del contenido>.

    python versionar.py                 caja.html
    python versionar.py otra.html …     las que le pases
    python versionar.py --check         no escribe: sólo avisa
                                        si algo quedó desfasado

Para qué: GitHub Pages sirve todo con Cache-Control: max-age=600.
Sin ?v=, después de un deploy un navegador puede quedarse hasta
10 minutos con el HTML nuevo y un .js viejo en la caché — una
mezcla que no existió nunca y que nadie probó. Con el hash en la
URL, un archivo que cambió es una URL distinta: o cargás todo
nuevo, o todo viejo, pero nunca mitad y mitad.

Es idempotente: correlo las veces que quieras.
Corré esto SIEMPRE antes de commitear cambios en los assets.
============================================================
"""
import sys, re, io, hashlib, pathlib

AQUI = pathlib.Path(__file__).resolve().parent
CHECK = "--check" in sys.argv
PAGINAS = [a for a in sys.argv[1:] if not a.startswith("-")] or ["caja.html"]

# href="algo.css" o src="algo.js", sin http(s):// ni // adelante
REF = re.compile(r'(?P<attr>\b(?:href|src)=")(?P<archivo>(?!https?:|//|data:|#)[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(?P<fin>")')

if sys.platform == "win32":
    import os; os.system("")

def hash_de(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()[:8]

total_cambios = 0
total_faltantes = 0

for nombre in PAGINAS:
    pagina = AQUI / nombre
    if not pagina.exists():
        print(f"\033[31m✗ no existe {nombre}\033[0m"); total_faltantes += 1; continue

    html = io.open(pagina, encoding="utf-8", newline="").read()
    cambios, desfasados = [], []

    def sellar(m):
        global total_faltantes
        archivo = m.group("archivo")
        destino = (pagina.parent / archivo)
        if not destino.exists():
            desfasados.append((archivo, "NO EXISTE"))
            total_faltantes += 1
            return m.group(0)
        v = hash_de(destino)
        viejo = re.search(r"\?v=([0-9a-f]+)", m.group(0))
        if not viejo:
            cambios.append((archivo, "—", v))
        elif viejo.group(1) != v:
            cambios.append((archivo, viejo.group(1), v))
            desfasados.append((archivo, f"{viejo.group(1)} → {v}"))
        return f'{m.group("attr")}{archivo}?v={v}{m.group("fin")}'

    nuevo = REF.sub(sellar, html)

    if CHECK:
        if desfasados:
            print(f"\033[31m✗ {nombre}: {len(desfasados)} asset(s) con la versión vieja\033[0m")
            for a, d in desfasados: print(f"    {a}  {d}")
            total_faltantes += len(desfasados)
        else:
            print(f"\033[32m✓ {nombre}: todos los assets sellados y al día\033[0m")
        continue

    if nuevo != html:
        io.open(pagina, "w", encoding="utf-8", newline="").write(nuevo)
        print(f"\033[32m✓ {nombre}\033[0m")
        for a, antes, ahora in cambios:
            print(f"    {a:<20} {antes} → {ahora}")
        total_cambios += len(cambios)
    else:
        print(f"  {nombre}: ya estaba al día")

if CHECK:
    sys.exit(1 if total_faltantes else 0)
print(f"\n{total_cambios} asset(s) resellado(s)." if total_cambios else "\nNada que cambiar.")
sys.exit(1 if total_faltantes else 0)
