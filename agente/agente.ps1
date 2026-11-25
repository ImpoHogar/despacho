# Despacho y Rutas - agente de Interakzion (versión 4.2)
# Cada minuto lee las proformas de Interakzion (Bodega y Perfumería) y las manda a la herramienta,
# con su número de factura, monto y plazo (contado o crédito, de cuentas por cobrar) cuando ya se facturó.
# Cuando cambia la tabla de clientes (o cada 30 minutos) manda también los clientes, para que
# Despacho tenga los clientes nuevos y los cambios de nombre, teléfono y dirección.
# Cada 5 minutos corre también «tiempos.ps1»: tiempos de alisto y chequeo de Interakzion, con quién
# alistó y quién chequeó y las unidades de cada proforma (para el reporte de Alisto). Va aparte: si
# algo falla ahí, las proformas y los clientes se siguen mandando igual.
# Cada 15 minutos corre «actualizar.ps1»: si Luis publicó una versión nueva del agente, se actualiza
# solo (con respaldo de la versión anterior). Va aparte: si falla, el agente sigue igual.
# Solo LEE las tablas: no cambia nada en Interakzion.
# Lo corre la tarea programada "Despacho y Rutas - Interakzion".

$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $aqui 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$log = Join-Path $aqui 'estado.txt'

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Text.Encoding]::RegisterProvider([Text.CodePagesEncodingProvider]::Instance) } catch {}
$amsg = ''
try { $amsg = [string](& (Join-Path $aqui 'actualizar.ps1') $aqui) } catch { $amsg = (' | ERROR actualizando: ' + $_.Exception.Message) }
$enc = [Text.Encoding]::GetEncoding(1252)

function Limpiar([string]$s) {
  if ($null -eq $s) { return '' }
  $sb = New-Object Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) { if ([int]$ch -ge 32 -and [int]$ch -ne 127) { [void]$sb.Append($ch) } }
  return $sb.ToString().Trim()
}

function Leer-Proformas([string]$ruta, [string]$dep, [int]$ultimos, [string]$desde, $plazos) {
  $fs = [IO.File]::Open($ruta, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $br = New-Object IO.BinaryReader($fs)
    $h = $br.ReadBytes(32)
    $n = [BitConverter]::ToUInt32($h, 4); $hl = [BitConverter]::ToUInt16($h, 8); $rl = [BitConverter]::ToUInt16($h, 10)
    $campos = @{}; $off = 1
    while ($true) {
      $fd = $br.ReadBytes(32)
      if ($fd.Length -lt 32 -or $fd[0] -eq 13) { break }
      $nom = [Text.Encoding]::ASCII.GetString($fd, 0, 11).Split([char]0)[0]
      $campos[$nom] = @($off, [int]$fd[16], [char]$fd[11]); $off += [int]$fd[16]
    }
    foreach ($k in 'FACTURA', 'CODIGO', 'NOMBRE', 'EST_BODEGA', 'FECHACREA') { if (-not $campos.ContainsKey($k)) { throw "Falta el campo $k en $ruta" } }
    $ini = [Math]::Max(0, [int64]$n - $ultimos)
    [void]$fs.Seek([int64]$hl + $ini * $rl, [IO.SeekOrigin]::Begin)
    $cant = [int]($n - $ini)
    $buf = $br.ReadBytes($cant * $rl)
    $out = New-Object Collections.ArrayList
    for ($i = 0; $i -lt [int]($buf.Length / $rl); $i++) {
      $b = $i * $rl
      if ($buf[$b] -eq 42) { continue }   # registro borrado
      $get = {
        param($k)
        if (-not $campos.ContainsKey($k)) { return '' }
        $c = $campos[$k]; $s = $enc.GetString($buf, $b + $c[0], $c[1])
        if ($c[2] -eq 'V' -and $s.Length -gt 0) {
          $L = [int][char]$s[$s.Length - 1]
          if ($L -lt $c[1]) { $resto = $s.Substring($L, $s.Length - 1 - $L); if ($resto.Trim(' ', [char]0) -eq '') { $s = $s.Substring(0, $L) } }
        }
        return (Limpiar $s.Replace([char]0, ' '))
      }
      $num = (& $get 'FACTURA'); if (-not $num) { continue }
      $num = ($num -replace '\.0+$', '').TrimStart('0'); if (-not $num) { continue }
      $est = (& $get 'EST_BODEGA')
      $fec = (& $get 'FECHACREA')
      $vivo = @('Proformado', 'En Alisto', 'Chequeo', 'En Chequeo', 'Listo') -contains $est
      if (-not $vivo -and $fec -lt $desde) { continue }
      $cj = (& $get 'CAJAS'); if (-not $cj) { $cj = '0' }
      $fa = ((& $get 'NROFAC') -replace '\.0+$', '').TrimStart('0')
      $mo = (& $get 'MONTO')
      $pl = ''
      if ($fa -and $plazos -and $plazos.ContainsKey($fa)) { $pl = $plazos[$fa] }
      [void]$out.Add(@{ n = $num; d = $dep; c = ((& $get 'CODIGO') -replace '\.0+$', ''); nm = (& $get 'NOMBRE'); e = $est; f = $fec; h = ((& $get 'HORA') -replace '[^0-9:]', ''); cj = ($cj -replace '\.0+$', ''); fa = $fa; mo = $mo; pl = $pl })
    }
    return $out
  } finally { $fs.Close() }
}


# Plazo de cada factura (cuentas por cobrar): 0 = contado, 1 o más = crédito. Solo las últimas.
function Leer-Plazos([string]$ruta, [int]$ultimos) {
  $res = @{}
  if (-not (Test-Path -LiteralPath $ruta)) { return $res }
  $fs = [IO.File]::Open($ruta, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $br = New-Object IO.BinaryReader($fs)
    $h = $br.ReadBytes(32)
    $n = [BitConverter]::ToUInt32($h, 4); $hl = [BitConverter]::ToUInt16($h, 8); $rl = [BitConverter]::ToUInt16($h, 10)
    $campos = @{}; $off = 1
    while ($true) {
      $fd = $br.ReadBytes(32)
      if ($fd.Length -lt 32 -or $fd[0] -eq 13) { break }
      $nom = [Text.Encoding]::ASCII.GetString($fd, 0, 11).Split([char]0)[0]
      $campos[$nom] = @($off, [int]$fd[16]); $off += [int]$fd[16]
    }
    if (-not ($campos.ContainsKey('FACTURA') -and $campos.ContainsKey('PLAZO'))) { return $res }
    $ini = [Math]::Max(0, [int64]$n - $ultimos)
    [void]$fs.Seek([int64]$hl + $ini * $rl, [IO.SeekOrigin]::Begin)
    $buf = $br.ReadBytes([int]($n - $ini) * $rl)
    $cf = $campos['FACTURA']; $cp = $campos['PLAZO']
    for ($i = 0; $i -lt [int]($buf.Length / $rl); $i++) {
      $b = $i * $rl
      if ($buf[$b] -eq 42) { continue }
      $fac = ($enc.GetString($buf, $b + $cf[0], $cf[1]).Trim([char]0, ' ') -replace '\.0+$', '').TrimStart('0')
      if (-not $fac) { continue }
      $pl = ($enc.GetString($buf, $b + $cp[0], $cp[1]).Trim([char]0, ' ') -replace '\.0+$', '')
      if (-not $pl) { $pl = '0' }
      $res[$fac] = $pl
    }
  } finally { $fs.Close() }
  return $res
}

function Leer-Clientes([string]$ruta, [string]$pref) {
  $fs = [IO.File]::Open($ruta, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $br = New-Object IO.BinaryReader($fs)
    $h = $br.ReadBytes(32)
    $n = [BitConverter]::ToUInt32($h, 4); $hl = [BitConverter]::ToUInt16($h, 8); $rl = [BitConverter]::ToUInt16($h, 10)
    $campos = @{}; $off = 1
    while ($true) {
      $fd = $br.ReadBytes(32)
      if ($fd.Length -lt 32 -or $fd[0] -eq 13) { break }
      $nom = [Text.Encoding]::ASCII.GetString($fd, 0, 11).Split([char]0)[0]
      $campos[$nom] = @($off, [int]$fd[16], [char]$fd[11]); $off += [int]$fd[16]
    }
    foreach ($k in 'CODIGO', 'NOMBRE') { if (-not $campos.ContainsKey($k)) { throw "Falta el campo $k en $ruta" } }
    [void]$fs.Seek([int64]$hl, [IO.SeekOrigin]::Begin)
    $buf = $br.ReadBytes([int]$n * $rl)
    $out = New-Object Collections.ArrayList
    for ($i = 0; $i -lt [int]($buf.Length / $rl); $i++) {
      $b = $i * $rl
      if ($buf[$b] -eq 42) { continue }
      $get = {
        param($k)
        if (-not $campos.ContainsKey($k)) { return '' }
        $c = $campos[$k]; $s = $enc.GetString($buf, $b + $c[0], $c[1])
        if ($c[2] -eq 'V' -and $s.Length -gt 0) {
          $L = [int][char]$s[$s.Length - 1]
          if ($L -lt $c[1]) { $resto = $s.Substring($L, $s.Length - 1 - $L); if ($resto.Trim(' ', [char]0) -eq '') { $s = $s.Substring(0, $L) } }
        }
        return (Limpiar $s.Replace([char]0, ' '))
      }
      $cod = ((& $get 'CODIGO') -replace '\.0+$', '').Trim()
      if ($cod -notmatch '^[0-9]+$') { continue }
      $cod = $cod.TrimStart('0'); if (-not $cod) { continue }
      [void]$out.Add(@{ k = ($pref + $cod); nm = (& $get 'NOMBRE'); d1 = (& $get 'DIRECCION1'); d2 = (& $get 'DIRECCION2'); t = (& $get 'TELEFONO'); z = (& $get 'CCODIGZONA'); f = (& $get 'FECHA') })
    }
    return $out
  } finally { $fs.Close() }
}

function Anotar([string]$linea) {
  $txt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $linea
  Set-Content -Path $log -Encoding UTF8 -Value $txt
  try {
    $hist = Join-Path $aqui 'historial.txt'
    Add-Content -Path $hist -Encoding UTF8 -Value $txt
    if ((Get-Item $hist).Length -gt 300KB) { $l = Get-Content $hist -Encoding UTF8; Set-Content -Path $hist -Encoding UTF8 -Value ($l | Select-Object -Last 1500) }
  } catch {}
}

function Json-Texto([string]$s) {
  $sb = New-Object Text.StringBuilder; [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    $c = [int]$ch
    if ($ch -eq '"') { [void]$sb.Append('\"') } elseif ($ch -eq '\') { [void]$sb.Append('\\') }
    elseif ($c -lt 32 -or $c -gt 126) { [void]$sb.Append(('\u{0:x4}' -f $c)) } else { [void]$sb.Append($ch) }
  }
  [void]$sb.Append('"'); return $sb.ToString()
}

try {
  $desde = (Get-Date).AddDays(-[int]$cfg.dias).ToString('yyyyMMdd')
  $todo = New-Object Collections.ArrayList
  $resumen = @()
  $tablasCli = @()
  foreach ($s in $cfg.sistemas) {
    $ruta = $null
    foreach ($t in @($s.tablas)) { if (Test-Path -LiteralPath $t) { $ruta = $t; break } }
    if (-not $ruta) { throw ('No encuentro la tabla de ' + $s.nombre + ' (' + (@($s.tablas) -join ' o ') + ')') }
    $plazos = @{}
    try { $plazos = Leer-Plazos (Join-Path (Split-Path -Parent $ruta) 'TABLA202.DBF') 6000 } catch { $plazos = @{} }
    $lista = Leer-Proformas $ruta $s.depto ([int]$cfg.ultimos) $desde $plazos
    foreach ($x in $lista) { [void]$todo.Add($x) }
    $resumen += ('{0}: {1}' -f $s.nombre, $lista.Count)
    $tc = Join-Path (Split-Path -Parent $ruta) 'tabla201.dbf'
    if (Test-Path -LiteralPath $tc) { $tablasCli += ,@($tc, $(if ($s.depto -eq 'P') { 'P' } else { '' }), $s.nombre) }
  }
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('{"fn":"apiInteraSync","args":[' + (Json-Texto $cfg.clave) + ',{"pc":' + (Json-Texto $env:COMPUTERNAME) + ',"p":[')
  $primero = $true
  foreach ($x in $todo) {
    if (-not $primero) { [void]$sb.Append(',') }; $primero = $false
    [void]$sb.Append('{"n":' + (Json-Texto $x.n) + ',"d":' + (Json-Texto $x.d) + ',"c":' + (Json-Texto $x.c) + ',"nm":' + (Json-Texto $x.nm) + ',"e":' + (Json-Texto $x.e) + ',"f":' + (Json-Texto $x.f) + ',"h":' + (Json-Texto $x.h) + ',"cj":' + (Json-Texto $x.cj) + ',"fa":' + (Json-Texto $x.fa) + ',"mo":' + (Json-Texto $x.mo) + ',"pl":' + (Json-Texto $x.pl) + '}')
  }
  [void]$sb.Append(']}]}')
  $cuerpo = [Text.Encoding]::UTF8.GetBytes($sb.ToString())
  $r = Invoke-RestMethod -Uri $cfg.url -Method Post -Body $cuerpo -ContentType 'text/plain; charset=utf-8' -TimeoutSec 60
  if (-not ($r.ok -and $r.r.ok)) {
    $e = $r.e; if (-not $e) { $e = $r.r.error }
    Anotar ('ERROR del servidor (proformas): ' + $e + $amsg); exit
  }
  $msg = 'OK - ' + ($resumen -join ' | ') + ' - proformas enviadas ' + $r.r.n
  if ($r.r.fac -and $r.r.fac.cambios) { $msg += (' | pedidos actualizados con factura/monto ' + $r.r.fac.cambios) }

  # ---- Clientes: cuando cambia la tabla o cada 30 minutos ----
  $marcaArch = Join-Path $aqui 'clientes.marca'
  $marca = ($tablasCli | ForEach-Object { (Get-Item -LiteralPath $_[0]).LastWriteTimeUtc.Ticks }) -join '|'
  $previa = ''; $edad = 999
  if (Test-Path $marcaArch) { $previa = (Get-Content $marcaArch -Raw -Encoding UTF8).Trim(); $edad = ((Get-Date) - (Get-Item $marcaArch).LastWriteTime).TotalMinutes }
  if ($tablasCli.Count -and ($marca -ne $previa -or $edad -ge 30)) {
    $cl = New-Object Collections.ArrayList
    foreach ($tc in $tablasCli) { foreach ($x in (Leer-Clientes $tc[0] $tc[1])) { [void]$cl.Add($x) } }
    $sb = New-Object Text.StringBuilder
    [void]$sb.Append('{"fn":"apiInteraClientes","args":[' + (Json-Texto $cfg.clave) + ',{"pc":' + (Json-Texto $env:COMPUTERNAME) + ',"c":[')
    $primero = $true
    foreach ($x in $cl) {
      if (-not $primero) { [void]$sb.Append(',') }; $primero = $false
      [void]$sb.Append('{"k":' + (Json-Texto $x.k) + ',"nm":' + (Json-Texto $x.nm) + ',"d1":' + (Json-Texto $x.d1) + ',"d2":' + (Json-Texto $x.d2) + ',"t":' + (Json-Texto $x.t) + ',"z":' + (Json-Texto $x.z) + ',"f":' + (Json-Texto $x.f) + '}')
    }
    [void]$sb.Append(']}]}')
    $cuerpo = [Text.Encoding]::UTF8.GetBytes($sb.ToString())
    $r2 = Invoke-RestMethod -Uri $cfg.url -Method Post -Body $cuerpo -ContentType 'text/plain; charset=utf-8' -TimeoutSec 120
    if ($r2.ok -and $r2.r.ok) {
      Set-Content -Path $marcaArch -Encoding UTF8 -Value $marca
      $msg += (' | clientes revisados ' + $r2.r.recibidos + ', nuevos ' + $r2.r.nuevos + ', actualizados ' + $r2.r.cambiados)
    } else {
      $e = $r2.e; if (-not $e) { $e = $r2.r.error }
      $msg += (' | ERROR clientes: ' + $e)
    }
  }
  try { $tmsg = & (Join-Path $aqui 'tiempos.ps1') $cfg $aqui; if ($tmsg) { $msg += [string]$tmsg } } catch { $msg += (' | ERROR tiempos: ' + $_.Exception.Message) }
  Anotar ($msg + $amsg)
} catch {
  Anotar ('ERROR: ' + $_.Exception.Message + $amsg)
}
