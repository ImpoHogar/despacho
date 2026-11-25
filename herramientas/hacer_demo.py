# Arma demo.html: la misma herramienta, con el servidor corriendo dentro del navegador (no toca la real).
import re,sys
idx=open('index.html').read()
srv=open(sys.argv[1]).read().replace('</script','<\\/script')
puente=open('herramientas/demo_puente.js').read()
url=re.search(r'var URL_GAS = "([^"]+)";',idx).group(1)
puente=puente.replace('__URL_GAS__',url)
a=idx.index('<script id="puente-gas">'); b=idx.index('</script>',a)+len('</script>')
idx=idx[:a]+'<script type="text/plain" id="demo-servidor">\n'+srv+'\n</script><script id="puente-gas">\n'+puente+'\n</script>'+idx[b:]
idx=idx.replace('<title>Despacho y Rutas</title>','<title>DEMOSTRACIÓN · Despacho y Rutas</title>',1)
n=idx.count('const SOMBRA_DESDE="20261124 17:00"'); assert n==1
idx=idx.replace('const SOMBRA_DESDE="20261124 17:00"','const SOMBRA_DESDE="00000000 00:00"')
idx=idx.replace('SOMBRA_DESDE_TS=new Date(2026,10,24,17,0,0).getTime()','SOMBRA_DESDE_TS=0')
banner='''<div id="demo-banda" style="position:sticky;top:0;z-index:999;background:#7c3aed;color:#fff;font:600 14px/1.3 Barlow,system-ui,sans-serif;padding:7px 14px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap">
<span>MODO DEMOSTRACIÓN · nada de lo que haga aquí llega a la herramienta real</span>
<button type="button" onclick="if(confirm('¿Empezar la demostración de cero?'))DEMO.reiniciar()" style="background:#fff;color:#5b21b6;border:0;border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer">Empezar de cero</button></div>'''
k=idx.index('<header class="top">'); idx=idx[:k]+banner+idx[k:]
open('demo.html','w').write(idx); print('demo.html',len(idx))
