# -*- coding: utf-8 -*-
"""Reordena las subareas de ADMINISTRATIVO en app.html (Lumen). Idempotente.
Uso:  cd lumen-repo ; python patch_app_orden.py"""
import io, sys, os
P = 'app.html'
OLD = "{ padre: 'admin',   hijos: ['caja', 'personal', 'operativo', 'conciliacion', 'validacion', 'harefield'] },"
NEW = "{ padre: 'admin',   hijos: ['caja', 'conciliacion', 'validacion', 'harefield', 'operativo', 'personal'] },"
if not os.path.exists(P):
    sys.exit('No encuentro app.html en esta carpeta. Corre el script parado en lumen-repo.')
s = io.open(P, encoding='utf-8', newline='').read()
if NEW in s:
    print('app.html ya tiene el orden nuevo. Nada que hacer.'); sys.exit(0)
if s.count(OLD) != 1:
    sys.exit('NO APLICADO: no encuentro la linea de GRUPOS con el orden viejo. app.html cambio; avisale a Claude.')
io.open(P, 'w', encoding='utf-8', newline='').write(s.replace(OLD, NEW))
print('OK: orden nuevo -> Caja, Conciliacion, Validacion, Harefield, Operativo, Personal')
