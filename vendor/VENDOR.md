# vendor/ — librerías de terceros alojadas en el propio sitio

Desde el 27/11/2026 ninguna página de Lumen carga scripts desde un CDN (salvo `diagrama-mes.html`, que trae
pdf.js y Tesseract para OCR desde jsDelivr y lleva su propia CSP). Cada archivo de esta carpeta es **idéntico byte a byte**
al que se servía desde el CDN: el SRI (`integrity=`) de cada `<script>` es el mismo que ya estaba fijado.

## Reglas
- Para actualizar una librería: bajar la versión nueva, calcular su SRI (`openssl dgst -sha384 -binary X | openssl base64 -A`),
  reemplazar el archivo, cambiar el `integrity=` en TODAS las páginas que lo cargan y correr `python versionar.py <páginas>`.
- `tools/csp.py` calcula la CSP de cada página según lo que la página realmente nombra: un CDN solo se habilita si la página lo usa.
- `tools/check_static.py` no revisa esta carpeta (son archivos de terceros); el control es el SRI.

## Contenido
| Archivo | Origen (versión) | Bytes | SRI sha384 (inicio) |
|---|---|---|---|
| `FileSaver.min.js` | FileSaver.js/2.0.5/FileSaver.min.js | 2749 | `sha384-PlRSzpewlarQuj5a…` |
| `chart.umd.min.js` | Chart.js/4.4.0/chart.umd.min.js | 200632 | `sha384-DhxhYObIMeMNGyAG…` |
| `docx.umd.js` | docx@8.5.0/build/index.umd.js | 742858 | `sha384-4xaIisuLEy2lo2Hk…` |
| `exceljs.min.js` | exceljs@4.4.0/dist/exceljs.min.js | 947702 | `sha384-Pqp51FUN2/qzfxZx…` |
| `html2canvas.min.js` | html2canvas/1.4.1/html2canvas.min.js | 198689 | `sha384-ZZ1pncU3bQe8y31y…` |
| `jspdf.umd.min.js` | jspdf/2.5.1/jspdf.umd.min.js | 364463 | `sha384-JcnsjUPPylna1s1f…` |
| `qrcode.min.js` | qrcodejs/1.0.0/qrcode.min.js | 19927 | `sha384-3zSEDfvllQohrq0P…` |
| `supabase.js` | @supabase/supabase-js@2.119.2/dist/umd/supabase.js | 221417 | `sha384-A97u3Qnt9GZHURO9…` |
| `xlsx.full.min.js`, `xlsx.core.min.js` | SheetJS 0.20.3 oficial (cdn.sheetjs.com) | — | ver `integrity=` en las páginas |
| `xlsx-js-style.min.js` | xlsx-js-style 1.2.0 (npm; base SheetJS 0.18.5, solo **escribe** con estilos) | 425017 | `sha384-TKzdYxq/t9UpLrJcIQu2hp…` |

## Versiones unificadas el 27/11/2026
- `@supabase/supabase-js`: `medico.html` y `medico-sla.html` usaban 2.45.4; ahora todas las páginas usan 2.119.2.
- Chart.js: `jefe.html` usaba 4.4.1; ahora todas usan 4.4.0.
