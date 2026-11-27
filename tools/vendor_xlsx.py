# -*- coding: utf-8 -*-
"""
vendor_xlsx.py — copia SheetJS 0.20.3 OFICIAL a vendor/ verificando su hash.

    python tools/vendor_xlsx.py <carpeta con xlsx.full.min.js y xlsx.core.min.js>

Se bajan de https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/ (cdnjs y npm se quedaron en 0.18.5, que tiene
CVE-2023-30533 -prototype pollution- y CVE-2024-22363 -ReDoS-). Los archivos NO se modifican: el integrity de
los <script> es el hash oficial. Si el hash no coincide, aborta sin escribir nada.
"""
import sys, hashlib, base64, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
OFICIAL = {
    "xlsx.full.min.js": "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT",
    "xlsx.core.min.js": "sha384-mnBT8sXCZGqGzeFvFdidh/dFZnwVtEn9eh9KkYSQXfJtUOzVku17NZodCX362Jw+",
}
def sri(b): return "sha384-" + base64.b64encode(hashlib.sha384(b).digest()).decode()

if len(sys.argv) != 2: sys.exit(__doc__)
src = pathlib.Path(sys.argv[1])
datos = {n: (src / n).read_bytes() for n in OFICIAL}
for n, esperado in OFICIAL.items():
    if sri(datos[n]) != esperado:
        sys.exit(f"ERROR: {n} no coincide con SheetJS 0.20.3 oficial ({sri(datos[n])}). No se escribio nada.")
(RAIZ / "vendor").mkdir(exist_ok=True)
for n, b in datos.items():
    (RAIZ / "vendor" / n).write_bytes(b)
    print(f"{n}: {len(b)} bytes  integrity=\"{sri(b)}\"")
