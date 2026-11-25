@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Despacho y Rutas - enlace con Interakzion (version 4.2)
echo  ------------------------------------------------------
if not exist "%~dp0config.json" (
  echo  Buscando la configuracion del agente que ya estaba instalado...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0buscar_config.ps1"
)
if not exist "%~dp0config.json" (
  echo  No encontre el archivo config.json del agente anterior.
  echo  Copie estos archivos DENTRO de la carpeta "Despacho Interakzion" que ya tenia
  echo  instalada (la que tiene config.json^) y vuelva a abrir este archivo.
  echo.
  pause
  exit /b
)
echo  1/2  Creando la tarea que lee Interakzion cada minuto...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_tarea.ps1"
if errorlevel 1 (
  echo  No se pudo con el metodo nuevo; usando el metodo sencillo...
  schtasks /Create /F /SC MINUTE /MO 1 /TN "Despacho y Rutas - Interakzion" /TR "wscript.exe \"%~dp0lanzar.vbs\"" >nul
  if errorlevel 1 (
    echo  No se pudo crear la tarea. Avise a Luis.
    pause
    exit /b
  )
)
echo  2/2  Primera lectura de proformas, clientes y tiempos de alisto (puede tardar unos minutos)...
if exist "%~dp0clientes.marca" del "%~dp0clientes.marca" >nul 2>&1
if exist "%~dp0tiempos.marca" del "%~dp0tiempos.marca" >nul 2>&1
if exist "%~dp0tiempos2.marca" del "%~dp0tiempos2.marca" >nul 2>&1
if exist "%~dp0actualizar.marca" del "%~dp0actualizar.marca" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente.ps1"
echo.
type "%~dp0estado.txt"
echo.
echo  Si arriba dice OK, ya quedo funcionando solo, sin ventanas.
echo  Cada minuto manda las proformas, y los clientes cuando cambian en Interakzion.
echo  Desde esta version se actualiza sola: ya no hay que volver a instalar.
pause
