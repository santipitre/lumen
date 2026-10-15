# Handoff: módulo Cronogramas → Claude Code / Shipyard (Supabase)

Base visual aprobada: `boceto-cronogramas-imagenes-v16.html` (OK de Santiago). Es un HTML de un solo archivo con estado en memoria. Hay que pasarlo al Dashboard Imágenes H.Italiano (Lumen) con persistencia en Supabase, sin cambiar el diseño ni las reglas que ya funcionan.

## Qué NO hay que persistir como dato real (pendientes de Santiago)
- Franjas de Radiografías 08:00–20:00: son provisorias (`sh:true`, "Horario a confirmar").
- Zamira: licencia con tipo "Licencia (a especificar)" y inicio 01/10/2026 estimados.
- Reparto de las noches de Battistella entre Natalia y Celeste: salió del diagrama de octubre, verificar.
- Reemplazo de Hernán del 26/10 al 01/11 (Isabel) y Celeste 13–19 (Benitez): `est` vacío = por confirmar.
- Sábado de Joel: 09–12 son 3 h; él dijo 4 h (el ciclo de 44 h solo cierra con 4).
- Apellido de Ismael (TC), significado de las notas del calendario TC, Hualpa, bases semanales de TC/RM/RX y técnicos de RM.

## Modelo de datos (tablas sugeridas)
- `personas(key pk, grp [med|tec|adm], ap, nom, cel, email, mat, serv text[], suplente bool, pilltxt, disp, reg int, ofi bool, guard bool, tcd, hc bool, pend bool, repos text[], nodisp jsonb, est text[], area, ref bool, eq)`
- `franjas(id, tab, key fk, dia, d time, h time, sec, asig text[], guardia bool, sem int [0|1|2], turno, sh bool)`
- `guardias(id, key fk, fecha date, t [N|D])` — guardias de 12 h por fecha
- `turnos_extra(id, key fk, fecha, d, h, nota)`
- `licencias(id, key fk, tipo, desde date, hasta date null, obs)`
- `reemplazos(id, licencia_id fk, key fk null, nombre text null, d, h, nota, fechas date[], desde, hasta, est ['' | ok | no])`
- `feriados(fecha pk, nombre)`
- `tc_cronograma(fecha pk, medico)` + `tc_cambios(...)` — cronograma mensual del Hospital Central (carga mensual por upload; el mes cambia solo)
- `config(clave pk, valor jsonb)` — tarifas `{diurna:7467, nocturna:10075}`, SAT0 `2026-10-03`, tabla JEFA (Yesica Moyano por día)
- RLS: lectura para usuarios autenticados de la sede; escritura solo para rol administrativo.

## Reglas que hay que conservar tal cual
- `satTipo(d)`: sábados alternan; SAT0 = 03/10/2026 = Sábado 2; semanas pares desde el ancla = Sábado 2. `satTipoW(d)` = tipo del sábado anterior (para franjas de lunes a viernes de Joel: semana larga = sábado previo tipo 2, corta = tipo 1).
- Feriados: técnicos y administrativos no trabajan franjas semanales en feriado; TC: urgencias de R4 todo el día en feriado, 20:00–23:59 el resto.
- Reemplazos solo se generan los días en que el titular tiene franja (o guardia con d/h exacto); `fechas`, `desde`, `hasta` acotan.
- Pago técnicos: diurna 07–20, nocturna 20–07, partido por minuto; panel para Flavia, Natalia, Celeste y Hernán, con opción "sin horas propias de planta".
- Administrativos: máx. 2 simultáneos (Santiago, `ofi`, no cuenta); personas de licencia no aparecen en el cronograma, solo quien las reemplaza.
- Alerta de más de 48 h semanales en técnicos, reemplazos sin confirmar, guardias sin reemplazante, noches sin guardia.

## Orden de trabajo sugerido
1. Migraciones + RLS + seed desde el JSON que genera el boceto (botón "Copiar datos").
2. Capa de datos (carga al abrir, escritura optimista por cambio) reemplazando el estado en memoria.
3. Import mensual del diagrama de técnicos (xlsx) y del cronograma TC.
4. Pruebas con Playwright: errores JS, sin scroll horizontal a 1400/900/380 px, horas y $ de octubre 2026 (Flavia 210 h / $1.688.038; Natalia 84 h / $828.044; Celeste 132 h / $1.071.708; Hernán 66 h / $492.822, con todas las horas).
5. Revisión y commit lo hace Santiago.

## Prompt para pegar en Claude Code
```
Leé handoff-cronogramas-claude-code.md y abrí boceto-cronogramas-imagenes-v16.html. Implementá el módulo Cronogramas en el Dashboard Imágenes H.Italiano con persistencia en Supabase (tablas, RLS, seed desde el JSON del boceto). Mantené diseño y reglas del boceto. No cargues como definitivos los datos listados en "Qué NO hay que persistir". Mostrame el plan antes de tocar código.
```
