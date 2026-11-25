# Crea (o reemplaza) la tarea programada que corre el agente cada minuto.
# Arranca sola al encender la computadora y al iniciar sesion, aunque este con bateria, y si la
# computadora estuvo apagada o dormida corre apenas pueda.
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$nombre = 'Despacho y Rutas - Interakzion'
$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $aqui 'lanzar.vbs') + '"') -WorkingDirectory $aqui
$cada = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\' + $env:USERNAME)
$conf = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($cada, $alEntrar) -Settings $conf -Force | Out-Null
Write-Host '  Tarea creada.'
