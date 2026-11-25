# Despacho y Rutas - actualizacion automatica del agente
# Cada 15 minutos revisa si Luis publico una version nueva del agente en la pagina de Despacho
# (https://impohogar.github.io/despacho/agente/). Si hay una:
#   1. Baja los archivos nuevos a la carpeta "_nuevo".
#   2. Revisa que cada archivo llego completo (huella SHA-256) y que los .ps1 no traen errores.
#   3. Guarda una copia de los archivos actuales en "respaldo\<version anterior>".
#   4. Pone los nuevos en su lugar. La proxima lectura (al minuto) ya usa la version nueva.
# Si algo falla no cambia nada y lo vuelve a intentar en 15 minutos.
# Nunca toca config.json (la clave) ni Interakzion.
param([string]$aqui)
$ErrorActionPreference = 'Stop'
$marca = Join-Path $aqui 'actualizar.marca'
if (Test-Path -LiteralPath $marca) {
  if (((Get-Date) - (Get-Item -LiteralPath $marca).LastWriteTime).TotalMinutes -lt 15) { return '' }
}
Set-Content -LiteralPath $marca -Encoding ASCII -Value (Get-Date).ToString('s')

$base = 'https://impohogar.github.io/despacho/agente/'
$sello = '?t=' + [DateTime]::UtcNow.Ticks
$vf = Join-Path $aqui 'version.txt'
$local = ''
if (Test-Path -LiteralPath $vf) { $local = (Get-Content -LiteralPath $vf -Raw).Trim() }

$man = Invoke-RestMethod -Uri ($base + 'version.json' + $sello) -TimeoutSec 30 -UseBasicParsing
$nueva = [string]$man.version
if (-not $nueva -or $nueva -eq $local) { return '' }

$permitidos = @('agente.ps1', 'tiempos.ps1', 'actualizar.ps1', 'buscar_config.ps1', 'instalar_tarea.ps1',
  'lanzar.vbs', 'LEAME.txt', '1. ACTUALIZAR E INSTALAR.bat', '2. QUITAR (si ya no se usa).bat')
$archivos = @($man.archivos)
if (-not $archivos.Count) { throw 'la lista de archivos viene vacia' }

$tmp = Join-Path $aqui '_nuevo'
if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
foreach ($a in $archivos) {
  $n = [string]$a.nombre
  if ($permitidos -notcontains $n) { throw ('archivo no permitido: ' + $n) }
  $dest = Join-Path $tmp $n
  Invoke-WebRequest -Uri ($base + [Uri]::EscapeDataString($n) + $sello) -OutFile $dest -UseBasicParsing -TimeoutSec 60
  $h = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
  if ($h -ne ([string]$a.sha256).ToUpper()) { throw ('el archivo ' + $n + ' llego incompleto') }
  if ($n -like '*.ps1') {
    $tk = $null; $errs = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($dest, [ref]$tk, [ref]$errs)
    if ($errs -and $errs.Count) { throw ('el archivo ' + $n + ' trae un error: ' + $errs[0].Message) }
  }
}

$nomResp = $local; if (-not $nomResp) { $nomResp = 'anterior' }
$resp = Join-Path (Join-Path $aqui 'respaldo') $nomResp
New-Item -ItemType Directory -Path $resp -Force | Out-Null
foreach ($a in $archivos) {
  $n = [string]$a.nombre
  $act = Join-Path $aqui $n
  if (Test-Path -LiteralPath $act) { Copy-Item -LiteralPath $act -Destination (Join-Path $resp $n) -Force }
  Copy-Item -LiteralPath (Join-Path $tmp $n) -Destination $act -Force
}
Remove-Item -LiteralPath $tmp -Recurse -Force
foreach ($m in @($man.reiniciarMarcas)) {
  $m = [string]$m
  if ($m -match '^[A-Za-z0-9_]+\.marca$' -and $m -ne 'actualizar.marca') {
    $p = Join-Path $aqui $m
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
  }
}
Set-Content -LiteralPath $vf -Encoding ASCII -Value $nueva
return (' | agente actualizado solo: version ' + $local + ' -> ' + $nueva)
