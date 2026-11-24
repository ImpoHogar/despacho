# Inserta la ayuda «¿Cómo se usa?»: estilos y caja antes de </body>, el código dentro del script principal.
import re
p='index.html';s=open(p).read();a=open('herramientas/ayuda.html').read()
s=re.sub(r'<!-- AYUDA:.*?<!-- /AYUDA -->\n?','',s,flags=re.S)
s=re.sub(r'/\* AYUDA-JS \*/.*?/\* /AYUDA-JS \*/\n?','',s,flags=re.S)
m=re.search(r'<script>\n(.*?)</script>\n<!-- /AYUDA -->',a,flags=re.S)
js=m.group(1); html=a[:m.start()]+'<!-- /AYUDA -->\n'
ini=s.index('<script>\n(function(){\n"use strict";')
fin=s.index('})();\n</script>',ini)
s=s[:fin]+'/* AYUDA-JS */\n'+js+'/* /AYUDA-JS */\n'+s[fin:]
i=s.rindex('</body>');s=s[:i]+html+s[i:]
open(p,'w').write(s);print('ayuda puesta')
