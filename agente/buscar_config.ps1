# Busca el config.json del agente que ya estaba instalado y lo copia a esta carpeta.
# Primero mira la tarea programada existente; si no, las carpetas de siempre.
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$destino = Join-Path $aqui 'config.json'
$candidatos = New-Object Collections.ArrayList
try {
  $t = Get-ScheduledTask -TaskName 'Despacho y Rutas - Interakzion' -ErrorAction Stop
  foreach ($a in $t.Actions) {
    foreach ($txt in @($a.Arguments, $a.Execute, $a.WorkingDirectory)) {
      if ($txt -match '"?([A-Za-z]:\\[^"]*?)\\(lanzar\.vbs|agente\.ps1)') { [void]$candidatos.Add((Join-Path $matches[1] 'config.json')) }
      elseif ($txt -and (Test-Path -LiteralPath $txt -PathType Container)) { [void]$candidatos.Add((Join-Path $txt 'config.json')) }
    }
  }
} catch {}
$u = $env:USERPROFILE
foreach ($base in @("$u\Downloads", "$u\Descargas", "$u\Documents", "$u\Documentos", "$u\Desktop", "$u\Escritorio", 'C:\')) {
  if (Test-Path -LiteralPath $base) {
    Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Despacho*Interakzion*' } | ForEach-Object {
      [void]$candidatos.Add((Join-Path $_.FullName 'config.json'))
      Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object { [void]$candidatos.Add((Join-Path $_.FullName 'config.json')) }
    }
  }
}
foreach ($c in $candidatos) {
  if ((Test-Path -LiteralPath $c) -and ((Resolve-Path -LiteralPath $c).Path -ne $destino)) {
    try {
      $j = Get-Content -LiteralPath $c -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j.clave -and $j.url) { Copy-Item -LiteralPath $c -Destination $destino -Force; Write-Host ('  Encontre la configuracion en: ' + (Split-Path -Parent $c)); exit 0 }
    } catch {}
  }
}
exit 1
