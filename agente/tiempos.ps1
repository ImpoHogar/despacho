# Despacho y Rutas - tiempos de alisto y chequeo de Interakzion (lo llama agente.ps1)
# Lee la tabla tiempoalisto (inicio y fin de cada alisto y chequeo), quién alistó y quién chequeó,
# y las unidades y productos de cada proforma. Cada 5 minutos manda los de los últimos 2 días;
# la primera vez, desde el 1 de junio de 2026. Solo LEE las tablas: no cambia nada en Interakzion.
param($cfg, [string]$aqui)
$ErrorActionPreference = 'Stop'
$enc = [Text.Encoding]::GetEncoding(1252)
function Limpiar([string]$s) {
  if ($null -eq $s) { return '' }
  $sb = New-Object Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) { if ([int]$ch -ge 32 -and [int]$ch -ne 127) { [void]$sb.Append($ch) } }
  return $sb.ToString().Trim()
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
# ---------- Lectura general de tablas (solo lectura) ----------
function Abrir-Tabla([string]$ruta) {
  $fs = [IO.File]::Open($ruta, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
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
  return @{ fs = $fs; br = $br; n = $n; hl = $hl; rl = $rl; campos = $campos }
}
function Leer-Bloque($t, [int]$ultimos) {
  $ini = [Math]::Max(0, [int64]$t.n - $ultimos)
  [void]$t.fs.Seek([int64]$t.hl + $ini * $t.rl, [IO.SeekOrigin]::Begin)
  return ,($t.br.ReadBytes([int]($t.n - $ini) * $t.rl))
}
function Campo($t, $buf, [int]$b, [string]$k) {
  if (-not $t.campos.ContainsKey($k)) { return '' }
  $c = $t.campos[$k]; $s = $enc.GetString($buf, $b + $c[0], $c[1])
  if ($c[2] -eq 'V' -and $s.Length -gt 0) {
    $L = [int][char]$s[$s.Length - 1]
    if ($L -lt $c[1]) { $resto = $s.Substring($L, $s.Length - 1 - $L); if ($resto.Trim(' ', [char]0) -eq '') { $s = $s.Substring(0, $L) } }
  }
  return (Limpiar $s.Replace([char]0, ' '))
}
function Num([string]$s) { $s = ($s -replace '\.0+$', '').Trim(); if (-not $s) { return '' }; if ($s -match '^-?[0-9]+(\.[0-9]+)?$') { return $s.TrimStart('0') } ; return '' }
# Fecha y hora (tipo T de FoxPro): milisegundos desde una base fija, para restar; '' si está vacía
function Campo-Ms($t, $buf, [int]$b, [string]$k) {
  if (-not $t.campos.ContainsKey($k)) { return $null }
  $c = $t.campos[$k]; if ($c[2] -ne 'T') { return $null }
  $jd = [BitConverter]::ToInt32($buf, $b + $c[0]); $ms = [BitConverter]::ToInt32($buf, $b + $c[0] + 4)
  if ($jd -le 0) { return $null }
  return ([int64]$jd * 86400000 + $ms)
}
function Ms-Texto($v) { if ($null -eq $v) { return '' }; $d = (New-Object DateTime 1, 1, 1).AddMilliseconds([double]($v - [int64]1721426 * 86400000)); return $d.ToString('yyyyMMddHHmmss') }

# ---------- Tiempos de alisto y chequeo de Interakzion ----------
# Junta por proforma: alisto (LIS) y chequeo (CHK), con inicio, fin y minutos trabajados (suma de los tramos).
function Leer-Tiempos([string]$dir, [string]$dep, [string]$desde, [int]$ultTiempos, [int]$ultDetalle, [int]$ultCab, [int]$ultMovs) {
  $res = @{}
  $rt = Join-Path $dir 'tiempoalisto.DBF'
  if (-not (Test-Path -LiteralPath $rt)) { return $res }
  $desdeMs = $null
  $t = Abrir-Tabla $rt
  try {
    $buf = Leer-Bloque $t $ultTiempos
    for ($i = 0; $i -lt [int]($buf.Length / $t.rl); $i++) {
      $b = $i * $t.rl
      if ($buf[$b] -eq 42) { continue }
      $fac = Num (Campo $t $buf $b 'FACTURA'); if (-not $fac) { continue }
      $ini = Campo-Ms $t $buf $b 'INICIO'; $fin = Campo-Ms $t $buf $b 'FIN'
      if ($null -eq $ini -or $null -eq $fin -or $fin -lt $ini) { continue }
      if ((Ms-Texto $ini).Substring(0, 8) -lt $desde) { continue }
      $ser = (Campo $t $buf $b 'SERIE').ToUpper()
      $x = $res[$fac]; if (-not $x) { $x = @{ d = $dep; n = $fac; ai = $null; af = $null; am = 0.0; ci = $null; cf = $null; cm = 0.0; u = 0.0; l = 0; ua = ''; uc = ''; nm = '' }; $res[$fac] = $x }
      $min = ($fin - $ini) / 60000.0
      if ($ser -eq 'CHK') { $x.cm += $min; if ($null -eq $x.ci -or $ini -lt $x.ci) { $x.ci = $ini }; if ($null -eq $x.cf -or $fin -gt $x.cf) { $x.cf = $fin } }
      else { $x.am += $min; if ($null -eq $x.ai -or $ini -lt $x.ai) { $x.ai = $ini }; if ($null -eq $x.af -or $fin -gt $x.af) { $x.af = $fin } }
    }
  } finally { $t.fs.Close() }
  if (-not $res.Count) { return $res }
  # Unidades y productos (líneas) de cada proforma
  $rd = Join-Path $dir 'tabla103c.dbf'
  if (Test-Path -LiteralPath $rd) {
    $t = Abrir-Tabla $rd
    try {
      if ($t.campos.ContainsKey('FACTURA') -and $t.campos.ContainsKey('CANTIDAD')) {
        $buf = Leer-Bloque $t $ultDetalle
        $cf = $t.campos['FACTURA']
        for ($i = 0; $i -lt [int]($buf.Length / $t.rl); $i++) {
          $b = $i * $t.rl
          if ($buf[$b] -eq 42) { continue }
          $fac = ($enc.GetString($buf, $b + $cf[0], $cf[1]).Trim([char]0, ' ') -replace '\.0+$', '').TrimStart('0')
          $x = $res[$fac]; if (-not $x) { continue }
          $q = 0.0; [void][double]::TryParse((Campo $t $buf $b 'CANTIDAD'), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$q)
          $x.u += $q; $x.l += 1
        }
      }
    } finally { $t.fs.Close() }
  }
  # Quién alistó y quién chequeó (códigos de usuario de Interakzion) y el cliente
  $rc = Join-Path $dir 'tabla260c.dbf'
  if (Test-Path -LiteralPath $rc) {
    $t = Abrir-Tabla $rc
    try {
      $buf = Leer-Bloque $t $ultCab
      $cf = $t.campos['FACTURA']
      for ($i = 0; $i -lt [int]($buf.Length / $t.rl); $i++) {
        $b = $i * $t.rl
        if ($buf[$b] -eq 42) { continue }
        $fac = ($enc.GetString($buf, $b + $cf[0], $cf[1]).Trim([char]0, ' ') -replace '\.0+$', '').TrimStart('0')
        $x = $res[$fac]; if (-not $x) { continue }
        $x.ua = Num (Campo $t $buf $b 'USU_ALISTO'); $x.uc = Num (Campo $t $buf $b 'USURECHEQ'); $x.nm = (Campo $t $buf $b 'NOMBRE')
      }
    } finally { $t.fs.Close() }
  }
  # Bitácora de movimientos de Interakzion: «Alisto de Proforma» (LIS) y «Chequeo de Proforma» (CHK) dicen
  # quién alistó y quién chequeó (es lo que usa su Reporte Tiempo de Alisto). Manda sobre lo de la proforma.
  $rm = Join-Path $dir 'movs_usu.dbf'
  if (Test-Path -LiteralPath $rm) {
    $t = Abrir-Tabla $rm
    try {
      if ($t.campos.ContainsKey('DOCUMENTO') -and $t.campos.ContainsKey('SERIE2') -and $t.campos.ContainsKey('CODUSU')) {
        $buf = Leer-Bloque $t $ultMovs
        $cd = $t.campos['DOCUMENTO']
        for ($i = 0; $i -lt [int]($buf.Length / $t.rl); $i++) {
          $b = $i * $t.rl
          if ($buf[$b] -eq 42) { continue }
          $doc = ($enc.GetString($buf, $b + $cd[0], $cd[1]).Trim([char]0, ' ') -replace '\.0+$', '').TrimStart('0')
          $x = $res[$doc]; if (-not $x) { continue }
          if ((Campo $t $buf $b 'SERIE') -ne 'PRO') { continue }
          $s2 = (Campo $t $buf $b 'SERIE2').ToUpper()
          if ($s2 -eq 'LIS') { $cu = Num (Campo $t $buf $b 'CODUSU'); if ($cu) { $x.ua = $cu } }
          elseif ($s2 -eq 'CHK') { $cu = Num (Campo $t $buf $b 'CODUSU'); if ($cu) { $x.uc = $cu } }
        }
      }
    } finally { $t.fs.Close() }
  }
  return $res
}

# Nombres de los usuarios de Interakzion (solo código y nombre; nunca las claves)
function Leer-Usuarios([string]$dir) {
  $res = @{}
  $ru = Join-Path $dir 'tabla02.dbf'
  if (-not (Test-Path -LiteralPath $ru)) { return $res }
  $t = Abrir-Tabla $ru
  try {
    $buf = Leer-Bloque $t ([int]$t.n)
    for ($i = 0; $i -lt [int]($buf.Length / $t.rl); $i++) {
      $b = $i * $t.rl
      if ($buf[$b] -eq 42) { continue }
      $cod = Num (Campo $t $buf $b 'CODIGO'); if (-not $cod) { continue }
      $res[$cod] = (Campo $t $buf $b 'USUARIO')
    }
  } finally { $t.fs.Close() }
  return $res
}

$msg = ''
$tmArch = Join-Path $aqui 'tiempos2.marca'
  $primera = -not (Test-Path $tmArch)
  $edadT = 999; if (-not $primera) { $edadT = ((Get-Date) - (Get-Item $tmArch).LastWriteTime).TotalMinutes }
  if ($primera -or $edadT -ge 5) {
    if ($primera) { $desdeT = '20260601'; $uT = 200000; $uD = 400000; $uC = 60000; $uM = 400000 } else { $desdeT = (Get-Date).AddDays(-2).ToString('yyyyMMdd'); $uT = 3000; $uD = 30000; $uC = 6000; $uM = 30000 }
    $tiempos = New-Object Collections.ArrayList; $usuarios = @{}
    foreach ($s in $cfg.sistemas) {
      $ruta = $null
      foreach ($t0 in @($s.tablas)) { if (Test-Path -LiteralPath $t0) { $ruta = $t0; break } }
      if (-not $ruta) { continue }
      $dir = Split-Path -Parent $ruta
      $tt = Leer-Tiempos $dir $s.depto $desdeT $uT $uD $uC $uM
      foreach ($x in $tt.Values) { [void]$tiempos.Add($x) }
      $us = Leer-Usuarios $dir
      foreach ($x in $tt.Values) { foreach ($cu in @($x.ua, $x.uc)) { if ($cu -and $us.ContainsKey($cu)) { $usuarios[$s.depto + '|' + $cu] = $us[$cu] } } }
    }
    $enviados = 0; $okT = $true
    for ($p = 0; $p -lt [Math]::Max(1, $tiempos.Count); $p += 1500) {
      $sb = New-Object Text.StringBuilder
      [void]$sb.Append('{"fn":"apiInteraTiempos","args":[' + (Json-Texto $cfg.clave) + ',{"pc":' + (Json-Texto $env:COMPUTERNAME) + ',"us":{')
      $primero = $true
      foreach ($k in $usuarios.Keys) { if (-not $primero) { [void]$sb.Append(',') }; $primero = $false; [void]$sb.Append((Json-Texto $k) + ':' + (Json-Texto $usuarios[$k])) }
      [void]$sb.Append('},"t":[')
      $primero = $true
      $fin = [Math]::Min($tiempos.Count, $p + 1500)
      for ($j = $p; $j -lt $fin; $j++) {
        $x = $tiempos[$j]
        if (-not $primero) { [void]$sb.Append(',') }; $primero = $false
        [void]$sb.Append('{"d":' + (Json-Texto $x.d) + ',"n":' + (Json-Texto $x.n) + ',"nm":' + (Json-Texto $x.nm) + ',"ai":' + (Json-Texto (Ms-Texto $x.ai)) + ',"af":' + (Json-Texto (Ms-Texto $x.af)) + ',"am":' + ([Math]::Round($x.am, 2)).ToString([Globalization.CultureInfo]::InvariantCulture) + ',"ci":' + (Json-Texto (Ms-Texto $x.ci)) + ',"cf":' + (Json-Texto (Ms-Texto $x.cf)) + ',"cm":' + ([Math]::Round($x.cm, 2)).ToString([Globalization.CultureInfo]::InvariantCulture) + ',"u":' + ([Math]::Round($x.u, 2)).ToString([Globalization.CultureInfo]::InvariantCulture) + ',"l":' + $x.l + ',"ua":' + (Json-Texto $x.ua) + ',"uc":' + (Json-Texto $x.uc) + '}')
      }
      [void]$sb.Append(']}]}')
      $cuerpo = [Text.Encoding]::UTF8.GetBytes($sb.ToString())
      $r3 = Invoke-RestMethod -Uri $cfg.url -Method Post -Body $cuerpo -ContentType 'text/plain; charset=utf-8' -TimeoutSec 120
      if ($r3.ok -and $r3.r.ok) { $enviados += [int]$r3.r.n } else { $okT = $false; $e = $r3.e; if (-not $e) { $e = $r3.r.error }; $msg += (' | ERROR tiempos: ' + $e); break }
    }
    if ($okT) { Set-Content -Path $tmArch -Encoding UTF8 -Value (Get-Date).ToString('s'); $msg += (' | tiempos de alisto ' + $enviados) }
  }
return $msg
