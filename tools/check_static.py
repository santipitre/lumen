#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_static.py — chequeos ESTÁTICOS de Lumen (sin navegador, sin datos reales).

Corre igual en tu PC y en GitHub Actions:

    python tools/check_static.py                 revisa todo el repo
    python tools/check_static.py --update-baseline   fija el estado actual de los "cupos" (ver 4)

Qué verifica (cualquier falla => exit 1):
  1. SRI: todo <script>/<link> a jsDelivr/cdnjs/unpkg lleva integrity + crossorigin,
     salvo la lista SRI_EXCEPCIONES (cada una con su motivo).
  2. Versiones fijas: ningún CDN con @latest, @2 suelto o sin versión.
  3. Sellado de assets: versionar.py --check sobre todas las páginas.
  4. Anti-regresión de XSS (cupo que sólo baja): cuenta, por archivo, los lugares donde
     una celda del Excel (r['Columna']) se interpola en HTML sin escapar. Si un archivo
     SUBE respecto de tools/xss_baseline.json => falla. Si baja, se te avisa para que
     corras --update-baseline y quede el nuevo piso.
  5. Enlaces target="_blank" con rel="noopener noreferrer".
  6. Sintaxis: node --check de cada <script> inline y de cada .js (si hay node).
  7. Secretos / datos: ningún JWT con role=service_role, ni sb_secret_, ni exports
     .xls/.xlsx versionados.
"""
import sys, re, os, json, base64, subprocess, tempfile, pathlib, shutil

# Windows: la consola/pipe usa cp1252 y no puede imprimir ✓/✗/—
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

RAIZ = pathlib.Path(__file__).resolve().parent.parent
BASELINE = RAIZ / "tools" / "xss_baseline.json"
UPDATE = "--update-baseline" in sys.argv

# URL (sin esquema) -> motivo por el que NO lleva SRI. Cualquier otra sin SRI falla.
SRI_EXCEPCIONES = {
}
SRI_HOSTS = ("cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com", "cdn.tailwindcss.com")

errores, avisos = [], []
def err(m): errores.append(m)
def aviso(m): avisos.append(m)

def archivos(ext):
    try:
        out = subprocess.run(["git", "ls-files"], cwd=RAIZ, capture_output=True, text=True, check=True).stdout.split("\n")
        lista = [RAIZ / f for f in out if f.endswith(ext)]
    except Exception:
        lista = [p for p in RAIZ.rglob("*" + ext) if ".git" not in p.parts and "node_modules" not in p.parts]
    return sorted(p for p in lista if p.exists() and "_test" not in p.parts and "vendor" not in p.parts and not p.name.startswith("_") and not p.name.endswith(".min.js"))

def leer(p):
    return p.read_text(encoding="utf-8", errors="replace")

def rel(p):
    return p.relative_to(RAIZ).as_posix()

HTMLS = archivos(".html")
JSS = archivos(".js")

# ── 1 y 2: SRI y versiones fijas ───────────────────────────────────────────
TAG = re.compile(r"<(script|link)\b[^>]*?(?:src|href)=\"(https?://[^\"]+)\"[^>]*>", re.I)
for p in HTMLS:
    for m in TAG.finditer(leer(p)):
        tag, url = m.group(0), m.group(2)
        host = re.sub(r"^https?://", "", url).split("/")[0]
        if host not in SRI_HOSTS:
            continue
        ruta = re.sub(r"^https?://[^/]+/", "", url)
        if host.startswith("cdn.jsdelivr"):
            ruta = re.sub(r"^npm/", "", ruta)
        exc = next((k for k in SRI_EXCEPCIONES if k in url), None)
        if re.search(r"@latest\b|@\d+(/|$)|@\d+\.\d+(/|$)", url) or ("jsdelivr" in host and "npm/" in url and "@" not in ruta):
            if not exc:
                err(f"[versión] {rel(p)}: CDN sin versión exacta -> {url}")
        if exc:
            continue
        if "integrity=" not in tag or "crossorigin" not in tag:
            err(f"[SRI] {rel(p)}: falta integrity/crossorigin -> {url}")

# ── 2b: scripts que se cargan desde JS (createElement('script')) ───────────
# Deben ir con versión exacta y con integrity cerca. (El worker de pdf.js y los datos del OCR no admiten SRI.)
DYN = re.compile(r"""['"](https?://(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com)/[^'"\s]+\.js)['"]""")
for p in HTMLS + JSS:
    t = leer(p)
    en_tags = [(m.start(), m.end()) for m in TAG.finditer(t)]
    for m in DYN.finditer(t):
        if any(a <= m.start() < b for a, b in en_tags):
            continue
        url = m.group(1)
        if re.search(r"@latest\b|@\d+(/|$)|@\d+\.\d+(/|$)", url):
            err(f"[versión] {rel(p)}: carga dinámica sin versión exacta -> {url}")
        ventana = t[max(0, m.start() - 300): m.end() + 700]
        if "integrity" not in ventana and "SRI[" not in ventana:
            err(f"[SRI] {rel(p)}: carga dinámica sin integrity -> {url}")

# ── 2c: CSP de cada página = la que calcula tools/csp.py ───────────────────
# (object-src/base-uri/form-action incluidos). Si agregás una librería, un host o un iframe
# y no regenerás, falla: corré  python tools/csp.py --apply
sys.path.insert(0, str(RAIZ / "tools"))
import csp as _csp
for p in HTMLS:
    t = leer(p)
    m = re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]*)"', t, re.I)
    if not m:
        err(f"[CSP] {rel(p)}: falta <meta http-equiv=\"Content-Security-Policy\">")
        continue
    for d in ("object-src 'none'", "base-uri 'self'", "form-action 'self'"):
        if d not in m.group(1):
            err(f"[CSP] {rel(p)}: la CSP no tiene {d}")
    if _csp.GUARD not in t:
        err(f"[frame] {rel(p)}: falta el guard anti-iframe junto a la CSP -> corré: python tools/csp.py --apply")
    if m.group(1) != _csp.politica(p):
        err(f"[CSP] {rel(p)}: la CSP no coincide con tools/csp.py -> corré: python tools/csp.py --apply")

# ── 3: versionar.py --check ────────────────────────────────────────────────
# En GitHub Actions se saltea: allá los .js/.css salen con fin de línea LF y en tu PC pueden tener CRLF,
# así que el hash daría distinto sin que haya ningún problema real. Local (hook) sí se revisa.
vp = RAIZ / "versionar.py"
if vp.exists() and not os.environ.get("GITHUB_ACTIONS"):
    paginas = [rel(p) for p in HTMLS if "/" not in rel(p) or rel(p).startswith("salud/")]
    r = subprocess.run([sys.executable, str(vp), "--check"] + paginas, cwd=RAIZ, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"})
    if r.returncode != 0:
        salida = re.sub(r"\x1b\[[0-9;]*m", "", (r.stdout or "") + (r.stderr or ""))
        err("[versionar] hay assets con ?v= desfasado. Corré `python versionar.py <paginas>` y commiteá:\n    " +
            "\n    ".join(l for l in salida.splitlines() if l.strip() and "✓" not in l))

# ── 4: cupo anti-XSS ───────────────────────────────────────────────────────
SEGUROS = ("esc(", "escq(", "esch(", "escapehtml(", "bpesc(", "bpjs(", "tiesc(", "jsq(", "escattr(", "vresc(", "parsefloat(", "number(", "tolocale", "Neto", "===", "!==")
INTERP = re.compile(r"\$\{([^{}]*?\br\[['\"][^'\"]+['\"]\][^{}]*?)\}")
CONCAT = re.compile(r"""['"]\s*\+\s*\(?\s*r\[['"][^'"]+['"]\]""")
def contar(txt):
    n = 0
    for m in INTERP.finditer(txt):
        if not any(s.lower() in m.group(1).lower() for s in SEGUROS):
            n += 1
    n += len(CONCAT.findall(txt))
    return n
actual = {rel(p): c for p in HTMLS + JSS if (c := contar(leer(p)))}
if UPDATE:
    BASELINE.write_text(json.dumps(actual, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"baseline escrito: {len(actual)} archivos, {sum(actual.values())} puntos")
else:
    base = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else {}
    for f, c in sorted(actual.items()):
        if c > base.get(f, 0):
            err(f"[XSS] {f}: {c} interpolaciones de celdas del Excel sin escapar (cupo {base.get(f, 0)}). Envolvelas en esc()/escapeHtml().")
    bajaron = [f for f, c in base.items() if actual.get(f, 0) < c]
    if bajaron:
        aviso("[XSS] mejoró el cupo en: " + ", ".join(bajaron) + " -> corré `python tools/check_static.py --update-baseline` y commiteá tools/xss_baseline.json")

# ── 5: target=_blank sin noopener ──────────────────────────────────────────
BLANK = re.compile(r"<a\b[^>]*target=[\"']_blank[\"'][^>]*>", re.I)
for p in HTMLS + JSS:
    for m in BLANK.finditer(leer(p)):
        if "noopener" not in m.group(0).lower():
            err(f"[noopener] {rel(p)}: <a target=_blank> sin rel=\"noopener noreferrer\" -> {m.group(0)[:90]}")

# ── 6: sintaxis ────────────────────────────────────────────────────────────
if shutil.which("node"):
    def chk(codigo, sufijo, donde):
        with tempfile.NamedTemporaryFile("w", suffix=sufijo, delete=False, encoding="utf-8") as tf:
            tf.write(codigo); ruta = tf.name
        r = subprocess.run(["node", "--check", ruta], capture_output=True, text=True)
        os.unlink(ruta)
        if r.returncode != 0:
            err(f"[sintaxis] {donde}: {r.stderr.strip().splitlines()[:2]}")
    SC = re.compile(r"<script(?P<a>[^>]*)>(?P<b>.*?)</script>", re.S | re.I)
    for p in HTMLS:
        for i, m in enumerate(SC.finditer(leer(p)), 1):
            a, b = m.group("a"), m.group("b")
            if "src=" in a or not b.strip():
                continue
            t = re.search(r"type\s*=\s*[\"']([^\"']+)", a)
            if t and t.group(1).lower() not in ("text/javascript", "module", "application/javascript"):
                continue
            chk(b, ".mjs" if (t and t.group(1) == "module") else ".js", f"{rel(p)} script#{i}")
    for p in JSS:
        chk(leer(p), ".js", rel(p))
else:
    aviso("[sintaxis] node no está instalado: se saltea node --check")

# ── 7: secretos y datos ────────────────────────────────────────────────────
JWT = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}")
try:
    todos = subprocess.run(["git", "ls-files"], cwd=RAIZ, capture_output=True, text=True, check=True).stdout.split("\n")
except Exception:
    todos = []
for f in todos:
    if f.lower().endswith((".xls", ".xlsm")):
        err(f"[datos] export de Excel versionado (posibles datos reales): {f}")
for p in HTMLS + JSS:
    t = leer(p)
    if "sb_secret_" in t:
        err(f"[secreto] {rel(p)}: aparece sb_secret_")
    for m in JWT.finditer(t):
        try:
            pl = json.loads(base64.urlsafe_b64decode(m.group(1) + "=" * (-len(m.group(1)) % 4)))
            if pl.get("role") == "service_role":
                err(f"[secreto] {rel(p)}: JWT con role=service_role")
        except Exception:
            pass

# ── resultado ──────────────────────────────────────────────────────────────
for a in avisos: print("AVISO", a)
if errores:
    print(f"\n✗ {len(errores)} problema(s):")
    for e in errores: print(" -", e)
    sys.exit(1)
print(f"✓ chequeos estáticos OK ({len(HTMLS)} HTML, {len(JSS)} JS)")
