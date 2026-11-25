"""Publica una version nueva del agente de Interakzion para que se actualice solo.
Uso: python3 herramientas/publicar_agente.py <carpeta del agente> <version>
Copia los archivos a agente/ y escribe agente/version.json con la huella SHA-256 de cada uno.
El agente (actualizar.ps1) revisa ese archivo cada 15 minutos."""
import hashlib, json, os, shutil, sys
ARCH = ['agente.ps1', 'tiempos.ps1', 'actualizar.ps1', 'buscar_config.ps1', 'instalar_tarea.ps1',
        'lanzar.vbs', 'LEAME.txt', '1. ACTUALIZAR E INSTALAR.bat', '2. QUITAR (si ya no se usa).bat']
src, ver = sys.argv[1], sys.argv[2]
reiniciar = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else []
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'agente')
os.makedirs(dst, exist_ok=True)
lista = []
for n in ARCH:
    b = open(os.path.join(src, n), 'rb').read()
    open(os.path.join(dst, n), 'wb').write(b)
    lista.append({'nombre': n, 'sha256': hashlib.sha256(b).hexdigest().upper()})
json.dump({'version': ver, 'archivos': lista, 'reiniciarMarcas': reiniciar},
          open(os.path.join(dst, 'version.json'), 'w'), ensure_ascii=False, indent=1)
print('publicado', ver, len(lista), 'archivos')
