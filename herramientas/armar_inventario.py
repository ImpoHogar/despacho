#!/usr/bin/env python3
"""Arma inventario.js (pestaña «Inventario» de Despacho) a partir de la herramienta de relleno
(repositorio ImpoHogar/relleno-bodega, public/index.html), para que las pantallas sean las mismas.
Uso:  python3 herramientas/armar_inventario.py RUTA/relleno-bodega/public/index.html
"""
import re, sys, json, pathlib

src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
css = re.search(r'<style>([\s\S]*?)</style>', src).group(1)
js = re.search(r"<script>\s*'use strict';([\s\S]*?)</script>", src).group(1)

def rep(t, a, b, n=1):
    c = t.count(a)
    if c != n: raise SystemExit(f'No encontré (esperaba {n}, hay {c}): {a[:90]!r}')
    return t.replace(a, b)

# ---------- estilos: todo queda encerrado dentro de la pestaña ----------
# Colores: se toman los de Despacho (las variables de la página pasan dentro de la pestaña), así combina
# con el resto de la herramienta y cambia solo entre modo claro y oscuro.
raiz = re.search(r':root\{[\s\S]*?\}', css).group(0)
css = css.replace(raiz, ''':root{
  --card:var(--panel); --soft:var(--muted); --line2:var(--line);
  --brand:var(--ink); --brand2:var(--accent); --acc:var(--accent); --info:var(--r1);
  --okbg:color-mix(in srgb,var(--ok) 14%,var(--panel)); --warnbg:color-mix(in srgb,var(--warn) 14%,var(--panel));
  --badbg:color-mix(in srgb,var(--bad) 14%,var(--panel)); --infobg:color-mix(in srgb,var(--r1) 12%,var(--panel));
  --r:10px; --sh:none;
  font-family:var(--body);
}''', 1)
COLORES = [
    ('background:#fff', 'background:var(--panel)'),
    ('#f6f8fb', 'var(--sunk)'), ('#f8fafc', 'var(--sunk)'), ('#eef1f5', 'var(--sunk)'), ('#e9edf2', 'var(--sunk)'),
    ('#eceef1', 'var(--sunk)'), ('#f0f2f5', 'var(--line)'), ('#f8fbff', 'color-mix(in srgb,var(--accent) 7%,var(--panel))'),
    ('#173f6b', 'var(--ink)'), ('#6b4600', 'var(--ink)'), ('#7f1d17', 'var(--ink)'), ('#14532d', 'var(--ink)'),
    ('#efe7fd', 'color-mix(in srgb,var(--r3) 15%,var(--panel))'), ('#5b21b6', 'var(--r3)'), ('#7c3aed', 'var(--r3)'),
    ('#374151', 'var(--muted)'), ('#4b5563', 'var(--muted)'), ('#6b7280', 'var(--muted)'),
    ('background:#111827;color:#fff', 'background:var(--ink);color:var(--bg)'),
]
for a, b in COLORES:
    if a not in css: raise SystemExit('No encontré el color ' + a)
    css = css.replace(a, b)
# Forma de Despacho: letras, pestañas, botones, tarjetas y números como en el resto de la herramienta
css += '''
/* ---- apariencia de Despacho y Rutas ---- */
:host{background:transparent!important;border-radius:0!important;overflow:visible!important;font-size:16px!important}
h1,h2,h3,.grande,.hoja h2,.modal h3,.seccion h2{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em}
header.top{background:transparent;color:var(--ink);border-bottom:1px solid var(--line);margin-bottom:16px}
.top-in{padding:0 0 10px;max-width:none;gap:10px 16px}
.marca{font-family:var(--display);font-size:26px;text-transform:uppercase;letter-spacing:.03em;line-height:1.1}
.marca small{font-family:var(--body);font-size:12px;font-weight:600;letter-spacing:.12em;color:var(--muted);opacity:1;margin-top:2px}
.frescura{background:transparent;padding:0;font-size:14px;font-weight:600;border-radius:0;color:var(--ink)}
.frescura::before{width:10px;height:10px;background:var(--muted)}
.frescura.ok::before{background:var(--ok)}.frescura.warn::before{background:var(--warn)}.frescura.bad::before{background:var(--bad)}
#quien{display:none}
nav.tabs{padding:0 0 10px;max-width:none;gap:4px;flex-wrap:wrap;overflow:visible}
nav.tabs button{border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--muted);font-family:var(--display);font-size:17px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:6px 14px;min-height:40px}
nav.tabs button.act{background:var(--ink);border-color:var(--ink);color:var(--bg)}
nav.tabs .badge{background:var(--accent);color:var(--accent-ink);font-family:var(--mono);font-size:12px;border-radius:99px;padding:0 7px;vertical-align:1px}
main{max-width:none;padding:0 0 20px}
.panel,.kpi,.tarjeta{border-radius:12px}
.kpi{padding:10px 14px}
.kpi .l{font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
.kpi .v{font-family:var(--display);font-size:34px;line-height:1.1}
.kpi.act{outline:0;border-color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink)}
.traer b{font-family:var(--display);font-size:26px;color:var(--ink)}
.btn{min-height:44px;padding:8px 16px;font-weight:600;background:var(--panel);border-color:var(--line)}
.btn:hover{border-color:var(--muted)}
.btn.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.ok{color:#fff}
.btn.peq{min-height:36px;padding:4px 10px;font-size:14px}
.buscar input,.buscar select,.campo input,.campo select,.campo textarea{background:var(--sunk);border-color:var(--line);padding:11px 13px}
.campo label{font-weight:600;color:var(--ink);font-size:14px}
th{background:var(--sunk);text-transform:uppercase;letter-spacing:.06em;font-size:11px}
.hoja{background:var(--panel);color:var(--ink)}
.modal{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
.cerrar{background:var(--sunk);color:var(--ink)}
.chk label{background:var(--panel)}
'''
css = rep(css, ':root{', ':host{display:block;')
css = rep(css, 'html,body{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.45}',
          ':host{background:var(--bg);color:var(--ink);font-size:15px;line-height:1.45;border-radius:12px;overflow:hidden}')
css = rep(css, 'header.top{background:var(--brand);color:#fff;position:sticky;top:0;z-index:20}', 'header.top{background:var(--brand);color:#fff}')
css = rep(css, 'main{max-width:1200px;margin:0 auto;padding:14px 14px 70px}', 'main{max-width:1200px;margin:0 auto;padding:14px 14px 40px}')

html = '''<header class="top" id="barra">
  <div class="top-in">
    <div class="marca">Relleno de racks<small>ImpoHogar · Bodega</small></div>
    <div class="top-der">
      <span class="frescura" id="frescura">Sin datos</span>
      <span id="quien" class="mini" style="color:#cfdbe8"></span>
    </div>
  </div>
  <nav class="tabs" id="tabs">
    <button data-v="relleno" class="act">Relleno</button>
    <button data-v="inventario">Inventario</button>
    <button data-v="ingresos">Ingresos <span class="badge oculto" id="bIngresos"></span></button>
    <button data-v="movimientos">Movimientos</button>
    <button data-v="admin" class="oculto" id="tabAdmin">Administración</button>
  </nav>
</header>
<main id="app"><div class="vacio">Cargando…</div></main>
<div id="capa"></div>'''

# ---------- código: mismo de la herramienta, con la sesión de Despacho ----------
js = rep(js, "const $ = s => document.querySelector(s);", "const $ = s => R.querySelector(s);")
js = js.replace("document.querySelectorAll(", "R.querySelectorAll(")
js = js.replace("document.addEventListener(", "R.addEventListener(")
js = js.replace("document.body.appendChild(d)", "R.appendChild(d)")
js = js.replace("document.activeElement", "R.activeElement")
js = js.replace("document.querySelector('.modal-velo')", "R.querySelector('.modal-velo')")
js = rep(js, """async function api(ruta, op = {}) {
  const r = await fetch('/api' + ruta, { method: op.method || 'GET', headers: op.body ? { 'Content-Type': 'application/json' } : {}, body: op.body ? JSON.stringify(op.body) : undefined, credentials: 'same-origin' });""",
"""async function api(ruta, op = {}) {
  const h = { Authorization: 'Despacho ' + CTX.token() };
  if (op.body) h['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch(API + '/api' + ruta, { method: op.method || 'GET', headers: h, body: op.body ? JSON.stringify(op.body) : undefined, credentials: 'omit', cache: 'no-store' }); }
  catch (e) { throw new Error('No hay conexión con el servidor del relleno. Revise el internet e intente de nuevo.'); }""")
# Movimientos: nombre de quien lo hizo
js = rep(js, "<td>${fechaHora(x.fecha)}</td><td>${esc(x.usuario)}</td><td>${esc(NOMBRE_MOV[x.tipo] || x.tipo)}</td>",
              "<td>${fechaHora(x.fecha)}</td><td>${esc(x.nombre || x.usuario)}</td><td>${esc(NOMBRE_MOV[x.tipo] || x.tipo)}</td>")
js = rep(js, "${esc(NOMBRE_MOV[x.tipo] || x.tipo)}<div class=\"mini\">${esc(x.usuario)} · ${esc(x.nota || '')}</div>",
              "${esc(NOMBRE_MOV[x.tipo] || x.tipo)}<div class=\"mini\">${esc(x.nombre || x.usuario)} · ${esc(x.nota || '')}</div>")
# Movimientos: además, para el administrador, los cambios de configuración y de tarimas con su responsable
js = rep(js, """    const m = await api('/movimientos');
    if (vista !== 'movimientos') return;""", """    const m = await api('/movimientos');
    const bit = D.yo.admin ? await api('/bitacora').catch(() => []) : [];
    if (vista !== 'movimientos') return;""")
js = rep(js, """<tr><td colspan="6" class="vacio">Todavía no hay movimientos.</td></tr>'}</tbody></table></div></div>`;""",
"""<tr><td colspan="6" class="vacio">Todavía no hay movimientos.</td></tr>'}</tbody></table></div></div>
      ${bit.length ? `<div class="panel" style="margin-top:14px"><div style="padding:10px 12px;font-weight:700">Cambios de configuración, artículos y tarimas</div><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead>
      <tbody>${bit.map(x => `<tr><td>${fechaHora(x.fecha)}</td><td>${esc(x.nombre || x.usuario || '')}</td><td>${esc(NOMBRE_BIT[x.accion] || x.accion)}</td><td class="mini" style="word-break:break-word">${esc(String(x.detalle || '').slice(0, 300))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;""")
js = rep(js, "const nomArt = c =>", "const NOMBRE_BIT = { config: 'Configuración', articulo: 'Artículo', 'corregir-tarima': 'Tarima corregida', 'crear-usuario': 'Usuario creado', 'editar-usuario': 'Usuario cambiado', instalacion: 'Instalación' };\nconst nomArt = c =>")
# Administración: los usuarios se manejan en Despacho
js = rep(js, """    <div class="panel seccion"><h2>Usuarios</h2><div id="usuarios" class="mini">Cargando…</div>
      <div class="acciones"><button class="btn pri" id="nuevoUsuario">Agregar usuario</button></div></div>""",
"""    <div class="panel seccion"><h2>Usuarios</h2><div class="mini">Los usuarios, contraseñas y permisos se manejan en Despacho y Rutas → <b>Ajustes</b>. Quien tiene el puesto <b>Bodega</b> (permiso «Inventario») solo ve el relleno y registra traslados con su clave de 4 números.</div></div>""")
js = rep(js, """  try {
    const us = await api('/usuarios');""", """  try {
    const us = [];""")
js = rep(js, """    $('#usuarios').innerHTML = `""", """    if (false) $('#usuarios').innerHTML = `""")
# Sin pantalla de entrada propia: se usa la sesión de Despacho
js = rep(js, "async function mostrarLogin() {", "async function mostrarLoginOriginal() {")
js = rep(js, "      await api('/login', { method: 'POST', body: { usuario: $('#lUsu').value, clave: $('#lCla').value } });\n", "")
js = rep(js, "  if (t.id === 'salir') { try { await api('/logout', { method: 'POST' }); } catch (er) { } mostrarLogin(); return; }\n", "")
js = rep(js, """    D = await api('/datos');""", """    D = await api('/datos');
    // ¿Quién lo trae?: personas de Despacho con permiso de Inventario + las que ya lo han usado
    const pd = CTX.personas ? CTX.personas() : [], vistos = new Set();
    D.personas = [...pd, ...(D.personas || [])].filter(p => p && p.usuario && !vistos.has(p.usuario.toLowerCase()) && vistos.add(p.usuario.toLowerCase()))
      .sort((x, y) => String(x.nombre).localeCompare(String(y.nombre)));""")
js = rep(js, """// se refresca solo cada 3 minutos (sin molestar si hay una ventana abierta)
setInterval(() => { if (D && !R.querySelector('.modal-velo') && !$('#velo') && vista !== 'admin') cargar(); }, 180000);
cargar();""", """// se refresca solo cada 3 minutos (sin molestar si hay una ventana abierta), solo mientras la pestaña está abierta
REFRESCAR = () => { if (D && !R.querySelector('.modal-velo') && !$('#velo') && vista !== 'admin') cargar(); };
CARGAR = cargar;""")

modulo = '''/* ============================================================================
   Despacho y Rutas · pestaña «Inventario» (relleno de racks de Bodega)
   Es la misma herramienta de relleno (repositorio ImpoHogar/relleno-bodega) con el mismo servidor y los
   mismos datos; entra con la sesión de Despacho. Vive encerrada en esta pestaña: si algo falla aquí,
   no afecta rutas, GPS ni alisto.  ARCHIVO GENERADO con herramientas/armar_inventario.py
   ============================================================================ */
(function () {
'use strict';
const API = window.INVENTARIO_API || 'https://relleno-bodega.impoh.workers.dev';
let R = null, CTX = null, REFRESCAR = null, CARGAR = null, reloj = null;
function mostrarLogin() {
  D = null; if (R) { $('#capa').innerHTML = '';
    $('#app').innerHTML = '<div class="aviso warn">Su sesión de Despacho venció o su usuario no tiene permiso para Inventario. Salga y vuelva a entrar en Despacho.</div>'; }
}
''' + js + '''
window.InventarioModulo = {
  mostrar(contenedor, ctx) {
    CTX = ctx;
    if (!R || !contenedor.contains(R.host)) {
      const host = document.createElement('div'); host.className = 'inventario-host';
      contenedor.innerHTML = ''; contenedor.appendChild(host);
      R = host.attachShadow({ mode: 'open' });
      R.innerHTML = '<style>' + ESTILOS + '</style>' + PANTALLA;
      instalarEventos();
    }
    CARGAR();
    clearInterval(reloj); reloj = setInterval(() => { try { REFRESCAR(); } catch (e) { } }, 180000);
  },
  ocultar() { clearInterval(reloj); reloj = null; if (R) { const c = R.getElementById('capa'); if (c) c.innerHTML = ''; R.querySelectorAll('.modal-velo').forEach(x => x.remove()); } }
};
})();
'''
# Los manejadores de eventos se instalan sobre la pestaña cuando ya existe
ev_ini = modulo.index("R.addEventListener('click'")
ev_fin = modulo.index("// ===================== inicio de sesión")
eventos = modulo[ev_ini:ev_fin]
modulo = modulo[:ev_ini] + "function instalarEventos() {\n" + eventos + "}\n" + modulo[ev_fin:]
modulo = modulo.replace("window.InventarioModulo = {", "const ESTILOS = " + json.dumps(css, ensure_ascii=False) + ";\nconst PANTALLA = " + json.dumps(html, ensure_ascii=False) + ";\nwindow.InventarioModulo = {", 1)
out = pathlib.Path(__file__).resolve().parent.parent / 'inventario.js'
out.write_text(modulo, encoding='utf-8')
print('inventario.js listo:', len(modulo), 'caracteres')
