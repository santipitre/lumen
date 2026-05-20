# Lumen — commit y push de favicons nuevos
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\pitre\OneDrive\Documentos\Claude\Projects\Pyralis\lumen"

if (Test-Path ".git\index.lock") {
    Remove-Item ".git\index.lock" -Force
    Write-Host "Lock huerfano eliminado" -ForegroundColor Yellow
}

git add `
    favicon.ico `
    favicon-96x96.png `
    apple-touch-icon.png `
    icon-180.png `
    icon-192.png `
    icon-512.png `
    web-app-manifest-192x192.png `
    web-app-manifest-512x512.png `
    manifest.json `
    index.html `
    admin.html `
    medico.html `
    operativo.html `
    personal.html `
    tecnico.html `
    jefe.html `
    mensajeria.html

Write-Host "`nStatus:" -ForegroundColor Cyan
git status --short

Write-Host "`nCommiteando..." -ForegroundColor Cyan
git commit -m "fix(brand): regenerar favicons con logo Lumen nuevo + cache-bust"

Write-Host "`nPusheando..." -ForegroundColor Cyan
git push origin main

Write-Host "`nListo. Refresca tu navegador con Ctrl+Shift+R y volve a guardar el favorito." -ForegroundColor Green
