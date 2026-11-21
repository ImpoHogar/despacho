/* ============================================================================
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

// ===================== utilidades =====================
const $ = s => R.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('es-CR');
const fmt1 = n => n == null || !isFinite(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('es-CR');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSem = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const fechaBonita = iso => { const d = new Date(iso + 'T12:00:00Z'); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; };
const fechaHora = s => { if (!s) return ''; const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); return d.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; R.appendChild(d); setTimeout(() => d.remove(), 3200); }
async function api(ruta, op = {}) {
  const h = { Authorization: 'Despacho ' + CTX.token() };
  if (op.body) h['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch(API + '/api' + ruta, { method: op.method || 'GET', headers: h, body: op.body ? JSON.stringify(op.body) : undefined, credentials: 'omit', cache: 'no-store' }); }
  catch (e) { throw new Error('No hay conexión con el servidor del relleno. Revise el internet e intente de nuevo.'); }
  let d = null; try { d = await r.json(); } catch (e) { }
  if (r.status === 401 && ruta !== '/login') { mostrarLogin(); throw new Error((d && d.error) || 'Sesión vencida'); }
  if (!r.ok) throw new Error((d && d.error) || ('Error ' + r.status));
  return d;
}
// "06/2028  07/2028" -> 2028-06 (el primero que venza) para ordenar
function claveVence(v) {
  if (!v) return '9999-99';
  const m = String(v).match(/(\d{1,2})\s*\/\s*0?(\d{2,4})/); if (!m) return '9999-98';
  let y = +m[2]; if (y < 100) y += 2000; return y + '-' + String(+m[1]).padStart(2, '0');
}

// ===================== estado =====================
let D = null;          // respuesta de /api/datos
let vista = 'relleno';
let filtroRelleno = 'todos';
let busqueda = '';

// ===================== cálculo del relleno =====================
function fechasRelleno(cfg) {
  const hoy = hoyCR(), dias = cfg.diasRelleno && cfg.diasRelleno.length ? cfg.diasRelleno : [3, 6];
  let actual = null;
  for (let k = 0; k < 8; k++) { const f = sumarDias(hoy, k); if (dias.includes(diaSem(f))) { actual = f; break; } }
  let siguiente = null;
  for (let k = 1; k < 9; k++) { const f = sumarDias(actual, k); if (dias.includes(diaSem(f))) { siguiente = f; break; } }
  const dif = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  return { hoy, actual, siguiente, esHoy: actual === hoy, hastaActual: dif(hoy, actual), entreRellenos: dif(actual, siguiente) };
}

// Fecha en Costa Rica de una hora guardada en UTC ("2026-11-18 14:05:00")
const diaDeHora = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

// Lo que hay en el rack de la ubicación principal:
//   punto de partida (lleno según el Excel de stock máximo, o el último conteo)
//   + lo que se trajo de la bodega 2 / excedentes − lo vendido en Interakzion, día por día.
//   Nunca baja de 0 ni pasa del stock máximo.
function calcularRack(a, ventas, entradas, hoy, totalSistema) {
  if (!(a.maximo > 0) || !a.base_fecha) return null;
  const primero = sumarDias(a.base_fecha, 1);
  const porDia = {};
  for (const e of entradas) if (!a.base_ts || e.fecha > a.base_ts) { const d = diaDeHora(e.fecha) < primero ? primero : diaDeHora(e.fecha); porDia[d] = (porDia[d] || 0) + e.cantidad; }
  let rack = a.base_cant, traido = 0, vendido = 0;
  for (let d = primero; d <= hoy; d = sumarDias(d, 1)) {
    const ent = porDia[d] || 0, ven = ventas[d] || 0;
    traido += ent; vendido += ven;
    rack = Math.min(a.maximo, Math.max(0, rack + ent - ven));
  }
  let topeSistema = false;
  if (totalSistema != null && totalSistema >= 0 && rack > totalSistema) { rack = totalSistema; topeSistema = true; }
  return { rack, traido, vendido, topeSistema };
}

function calcular() {
  const cfg = D.config, S = D.sistema || { articulos: {}, ventas: {} };
  const F = fechasRelleno(cfg);
  const porCodigo = {}, entPor = {};
  for (const l of D.lotes) (porCodigo[l.codigo] || (porCodigo[l.codigo] = [])).push(l);
  for (const e of D.entradas || []) (entPor[e.codigo] || (entPor[e.codigo] = [])).push(e);
  const out = [];
  for (const a of D.articulos) {
    const s = S.articulos[a.codigo] || null;
    const lotes = (porCodigo[a.codigo] || []).filter(l => l.cantidad > 0 || l.estado === 'pendiente');
    const b2 = lotes.filter(l => l.tipo === 'bodega2').reduce((t, l) => t + l.cantidad, 0);
    const ex = lotes.filter(l => l.tipo === 'excedente').reduce((t, l) => t + l.cantidad, 0);
    const fuera = b2 + ex;
    const total = s ? s.g + (cfg.bodegasQueSuman || []).reduce((t, b) => t + (s.b[b] || 0), 0) : null;
    const caja = a.unid_caja || 1;
    const max = a.maximo > 0 ? a.maximo : 0;
    // venta por día: la mayor entre lo reciente y el promedio largo (así se notan las temporadas)
    const v = (S.ventas && S.ventas[a.codigo]) || {};
    const suma = n => { let t = 0; for (let k = 0; k < n; k++) t += v[sumarDias(F.hoy, -k)] || 0; return t; };
    const corta = suma(cfg.ventanaCorta) / cfg.ventanaCorta, larga = suma(cfg.ventanaLarga) / cfg.ventanaLarga;
    const diaria = Math.max(corta, larga);
    const R = s ? calcularRack(a, v, entPor[a.codigo] || [], F.hoy, total) : null;
    const rack = R ? R.rack : null;
    const alcanza = rack == null ? null : diaria > 0 ? rack / diaria : Infinity;
    // lo que habrá el día del relleno y lo que se necesita para llegar al siguiente
    const enRelleno = rack == null ? null : Math.max(0, rack - diaria * F.hastaActual);
    const necesidad = diaria * (F.entreRellenos + (cfg.margenDias || 0));
    // se rellena hasta el stock máximo, en cajas completas (para que quepa)
    const espacio = rack == null ? 0 : Math.floor((max - enRelleno) / caja) * caja;
    const traer = Math.min(espacio, fuera);
    const noCabe = max > 0 && necesidad > max;   // aun lleno no alcanza hasta el siguiente relleno
    let estado = 'ok';
    if (!a.activo) estado = 'pendiente';
    else if (!s || rack == null) estado = 'sindatos';
    else if (enRelleno >= necesidad || espacio < caja) estado = 'ok';
    else if (fuera <= 0) estado = 'sin';
    else if (alcanza < F.hastaActual + 1) estado = 'urgente';
    else estado = 'rellenar';
    out.push({ a, s, lotes, b2, ex, fuera, total, caja, max, corta, larga, diaria, R, rack, alcanza, enRelleno, necesidad, espacio, traer, noCabe,
      lleno: max && rack != null ? rack / max : null, estado, estante: s && s.e });
  }
  return { F, filas: out };
}
const ORDEN_EST = { urgente: 0, rellenar: 1, sin: 2, ok: 3, sindatos: 4, pendiente: 5 };
const NOMBRE_EST = { urgente: 'Urgente', rellenar: 'Rellenar', sin: 'Sin de dónde traer', ok: 'Bien', sindatos: 'Sin datos', pendiente: 'Pendiente' };
// "50 cajas", "50 cajas + 3 unid.", "3 unid."
function enCajas(n, caja) {
  if (n == null || !isFinite(n)) return '—';
  n = Math.round(n);
  if (n === 0) return '0';
  if (!(caja > 1)) return fmt(n) + ' unid.';
  const c = Math.floor(n / caja), r = n - c * caja;
  return (c ? fmt(c) + (c === 1 ? ' caja' : ' cajas') : '') + (c && r ? ' + ' : '') + (r || !c ? fmt(r) + ' unid.' : '');
}
const cajasNum = (n, caja) => { const x = caja > 1 ? n / caja : n; return Math.abs(x) >= 10 ? fmt(x) : fmt1(x); };
const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
const textoAlcanza = x => x == null ? '—' : !isFinite(x) ? 'sin venta' : x > 60 ? 'más de 60 días' : x < 1 ? 'menos de 1 día' : fmt1(x) + (Math.round(x * 10) === 10 ? ' día' : ' días');
function barra(f) {
  const p = Math.max(0, Math.min(1, f.lleno || 0));
  const col = p < 0.25 ? 'var(--bad)' : p < 0.5 ? 'var(--acc)' : 'var(--ok)';
  return `<div class="rack"><div class="rack-txt"><span>En el rack: <b>${enCajas(f.rack, f.caja)}</b> de ${enCajas(f.max, f.caja)}</span><span>${pct(f.lleno)}</span></div>
    <div class="rack-bar"><i style="width:${(p * 100).toFixed(1)}%;background:${col}"></i></div></div>`;
}

// ===================== pantallas =====================
function frescura() {
  const el = $('#frescura');
  if (!D || !D.generado) { el.className = 'frescura bad'; el.textContent = 'Sin datos del conector'; return; }
  const min = (Date.now() - Date.parse(D.generado)) / 60000;
  el.className = 'frescura ' + (min < (D.config.minutosAlertaDatos || 20) ? 'ok' : min < 120 ? 'warn' : 'bad');
  el.textContent = 'Interakzion: ' + (min < 1 ? 'ahora' : min < 60 ? 'hace ' + Math.round(min) + ' min' : fechaHora(D.generado));
}

function render() {
  if (!D) return;
  frescura();
  R.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('act', b.dataset.v === vista));
  const pend = D.lotes.filter(l => l.estado === 'pendiente').length;
  $('#bIngresos').textContent = pend; $('#bIngresos').classList.toggle('oculto', !pend);
  ({ relleno: vRelleno, inventario: vInventario, ingresos: vIngresos, movimientos: vMovimientos, admin: vAdmin })[vista]();
}

function vRelleno() {
  const { F, filas } = calcular();
  const activos = filas.filter(f => f.a.activo);
  const aviso = !D.sistema ? '<div class="aviso bad">Todavía no han llegado datos de Interakzion. Revise que el conector esté encendido en la PC de la oficina.</div>' : '';
  const titulo = F.esHoy ? 'Hoy es día de relleno' : 'Próximo relleno: ' + fechaBonita(F.actual);
  const sub = F.esHoy
    ? `Llene cada ubicación hasta su stock máximo con lo que dice cada tarjeta. Así alcanza hasta el ${fechaBonita(F.siguiente)}.`
    : `Faltan ${F.hastaActual} día${F.hastaActual === 1 ? '' : 's'}. Lo marcado como <b>urgente</b> se acaba antes: tráigalo ya. Lo demás puede esperar al ${fechaBonita(F.actual)}.`;
  // Solo se avisa lo que se puede rellenar (hay en bodega 2 o en excedentes). Lo agotado del todo no sale aquí.
  const porTraer = activos.filter(f => f.estado === 'urgente' || f.estado === 'rellenar');
  let lista = filtroRelleno === 'todos' ? porTraer : porTraer.filter(f => f.estado === filtroRelleno);
  lista.sort((x, y) => ORDEN_EST[x.estado] - ORDEN_EST[y.estado] || (x.lleno - y.lleno) || y.traer - x.traer);
  const totCajas = porTraer.reduce((t, f) => t + f.traer / f.caja, 0);
  const k = (id, cls, l, n) => `<button class="kpi ${cls} ${filtroRelleno === id ? 'act' : ''}" data-filtro="${id}"><div class="l">${l}</div><div class="v">${n}</div></button>`;
  const hoyHecho = (D.entradas || []).filter(e => diaDeHora(e.fecha) === F.hoy).reverse();
  const pendArt = filas.filter(f => !f.a.activo && f.a.marca === 'Skala').length;
  $('#app').innerHTML = aviso + `
    <div class="panel dia"><div><div class="grande">${titulo}</div><div class="sub">${sub}</div></div></div>
    <div class="kpis">
      ${k('todos', '', 'Por rellenar', porTraer.length)}
      ${k('urgente', 'bad', 'Urgentes', porTraer.filter(f => f.estado === 'urgente').length)}
      <div class="kpi fijo"><div class="l">Cajas a traer</div><div class="v">${fmt(totCajas)}</div></div>
    </div>
    ${pendArt && !D.yo.soloRelleno ? `<div class="aviso info">${pendArt} artículos de Skala todavía no entran al cálculo (vea Inventario → Pendientes).</div>` : ''}
    ${lista.length ? lista.map(tarjeta).join('') : `<div class="panel vacio">${filtroRelleno === 'todos' ? '✅ Nada que rellenar por ahora. Todo lo que tiene mercadería en la bodega 2 o en excedentes alcanza hasta el siguiente relleno.' : 'No hay urgentes.'}</div>`}
    ${hoyHecho.length ? `<div class="panel seccion hecho"><h2>Ya registrado hoy</h2>${hoyHecho.map(e => {
      const a = D.articulos.find(x => x.codigo === e.codigo) || {};
      return `<div class="fila-h"><span>✓</span><div><b>${esc(a.descripcion || e.codigo)}</b><div class="mini">${enCajas(e.cantidad, a.unid_caja)} · ${esc(e.nombre || e.usuario)} · ${fechaHora(e.fecha).split(', ').pop()}</div></div></div>`;
    }).join('')}</div>` : ''}`;
}

function tarjeta(f) {
  const a = f.a;
  const fuentesEx = f.lotes.filter(l => l.tipo === 'excedente' && l.cantidad > 0);
  const fuentesB2 = f.lotes.filter(l => l.tipo === 'bodega2' && l.cantidad > 0)
    .sort((x, y) => (x.estado === 'pendiente') - (y.estado === 'pendiente') || claveVence(x.vence).localeCompare(claveVence(y.vence)) || x.cantidad - y.cantidad);
  const lineaLote = (l, i) => `<div class="fuente">
      <div class="d">${l.tipo === 'excedente' ? '<b>Excedente</b> · ' + esc(l.ubicacion || '') : (l.estado === 'pendiente' ? '<b>Ingreso sin ubicar</b>' : '<b>' + esc(l.tarima || 'Tarima') + '</b> · ' + esc(l.ubicacion || 'sin ubicación'))}
        <small>Hay ${enCajas(l.cantidad, f.caja)}${l.vence ? ' · vence ' + esc(l.vence) : ''}${i === 0 && l.tipo !== 'excedente' && fuentesB2.length > 1 ? ' · <b>sacar de aquí primero</b>' : ''}</small></div>
      ${D.yo.mueve ? `<button class="btn pri" data-traer="${l.id}" data-sug="${f.traer}">${l.tipo === 'excedente' ? 'Bajé de aquí' : 'Traje de aquí'}</button>` : ''}
    </div>`;
  // tarimas de la bodega 2 que hacen falta para completar lo que hay que traer (sale primero lo que vence primero)
  let nB2 = 0;
  for (let acum = fuentesEx.reduce((t, l) => t + l.cantidad, 0); nB2 < fuentesB2.length && (acum < f.traer || nB2 === 0); nB2++) acum += fuentesB2[nB2].cantidad;
  let msg = '';
  if (f.traer < f.espacio) msg += `<div class="mini nota">Solo hay ${enCajas(f.fuera, f.caja)} fuera de la principal; traiga eso.</div>`;
  if (f.noCabe) msg += `<div class="mini nota">Aun lleno, el rack no alcanza hasta el siguiente relleno: revíselo a media semana.</div>`;
  if (fuentesEx.length && fuentesB2.length) msg += `<div class="mini nota">Hay en excedentes y en la bodega 2: usted decide de dónde le conviene más.</div>`;
  return `<div class="tarjeta ${f.estado}">
    <div class="t1">
      <div class="nom" ${D.yo.soloRelleno ? '' : `data-art="${esc(a.codigo)}" style="cursor:pointer"`}>${esc(a.descripcion)} <span class="tag ${f.estado}">${NOMBRE_EST[f.estado]}</span>
        <small>Ubicación principal: <b>${esc(f.estante || '—')}</b> · ${esc(a.codigo)}</small></div>
      <div class="traer"><span>Traer</span><b>${enCajas(f.traer, f.caja)}</b><span>${fmt(f.traer)} unidades</span></div>
    </div>
    ${barra(f)}
    <div class="mini">Alcanza ${textoAlcanza(f.alcanza)} · se venden unas ${cajasNum(f.diaria * 7, f.caja)} ${f.caja > 1 ? 'cajas' : 'unid.'} por semana</div>
    ${msg}
    <div class="fuentes"><div class="lbl">De dónde traerlo</div>${fuentesEx.map(l => lineaLote(l, -1)).join('')}${fuentesB2.slice(0, nB2).map(lineaLote).join('')}
      ${fuentesB2.length > nB2 ? `<details class="mas"><summary>Otras ${fuentesB2.length - nB2} tarimas en la bodega 2</summary>${fuentesB2.slice(nB2).map((l, i) => lineaLote(l, i + nB2)).join('')}</details>` : ''}</div>
  </div>`;
}

function vInventario() {
  const { filas } = calcular();
  const q = busqueda.trim().toLowerCase();
  let l = filas.filter(f => !q || f.a.descripcion.toLowerCase().includes(q) || f.a.codigo.includes(q));
  const act = l.filter(f => f.a.activo).sort((x, y) => ORDEN_EST[x.estado] - ORDEN_EST[y.estado] || (x.lleno - y.lleno) || x.a.descripcion.localeCompare(y.a.descripcion));
  const pen = l.filter(f => !f.a.activo).sort((x, y) => (x.a.marca !== 'Skala') - (y.a.marca !== 'Skala') || x.a.descripcion.localeCompare(y.a.descripcion));
  const fila = f => `<tr class="clic" data-art="${esc(f.a.codigo)}">
      <td>${esc(f.a.descripcion)}<div class="mini">${esc(f.a.codigo)} · ${esc(f.estante || '—')}</div></td>
      <td><span class="tag ${f.estado}">${NOMBRE_EST[f.estado]}</span></td>
      <td class="num">${f.rack == null ? '—' : cajasNum(f.rack, f.caja)}</td><td class="num">${f.max ? cajasNum(f.max, f.caja) : '—'}</td><td class="num">${pct(f.lleno)}</td>
      <td class="num">${cajasNum(f.b2, f.caja)}</td><td class="num">${cajasNum(f.ex, f.caja)}</td>
      <td class="num">${cajasNum(f.diaria * 7, f.caja)}</td><td class="num">${f.alcanza == null || !isFinite(f.alcanza) ? '—' : f.alcanza > 60 ? '+60' : fmt1(f.alcanza)}</td></tr>`;
  const filaM = f => `<div class="fila-m" data-art="${esc(f.a.codigo)}"><div class="a">${esc(f.a.descripcion)} <span class="tag ${f.estado}">${NOMBRE_EST[f.estado]}</span></div>
      ${f.a.activo && f.rack != null ? barra(f) : `<div class="mini">${esc(f.a.pendiente || '')}</div>`}
      <div class="b"><span>Bodega 2 <b>${enCajas(f.b2, f.caja)}</b></span><span>Exced. <b>${enCajas(f.ex, f.caja)}</b></span>${f.a.activo ? `<span>Alcanza <b>${textoAlcanza(f.alcanza)}</b></span>` : ''}</div></div>`;
  const tabla = (arr, t, cols) => !arr.length ? '' : `<div class="panel" style="margin-bottom:14px"><div style="padding:10px 12px;font-weight:700">${t} <span class="gris">(${arr.length})</span></div>
    <div class="tabla-wrap resp"><table><thead><tr><th>Artículo</th><th>Estado</th><th class="num">En el rack</th><th class="num">Máximo</th><th class="num">Lleno</th><th class="num">Bodega 2</th><th class="num">Excedentes</th><th class="num">Venta/semana</th><th class="num">Alcanza (días)</th></tr></thead>
    <tbody>${arr.map(cols).join('')}</tbody></table></div><div class="lista-movil">${arr.map(filaM).join('')}</div></div>`;
  const filaP = f => `<tr class="clic" data-art="${esc(f.a.codigo)}"><td>${esc(f.a.descripcion)}<div class="mini">${esc(f.a.codigo)} · ${esc(f.a.marca)}</div></td><td colspan="8" class="mini">${esc(f.a.pendiente || 'No entra al cálculo')}</td></tr>`;
  const pv = R.activeElement && R.activeElement.id === 'buscarInv';
  $('#app').innerHTML = `<div class="buscar"><input id="buscarInv" type="search" placeholder="Buscar por nombre o código…" value="${esc(busqueda)}">
      ${D.yo.admin ? '<button class="btn" id="descargarInv">Descargar inventario bodega 2</button>' : ''}</div>
    <div class="mini" style="margin:-4px 0 10px">Cantidades en cajas. <b>En el rack</b> = lo que había al empezar (lleno según el stock máximo, o el último conteo) + lo que se trajo − lo vendido en Interakzion. Nunca pasa del stock máximo.</div>
    ${tabla(act, 'En el cálculo de relleno', fila)}${tabla(pen, 'Pendientes (no entran al cálculo todavía)', filaP)}`;
  if (pv) { const i = $('#buscarInv'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

function vIngresos() {
  const pend = D.lotes.filter(l => l.estado === 'pendiente');
  const art = c => (D.articulos.find(a => a.codigo === c) || {}).descripcion || c;
  $('#app').innerHTML = `<div class="aviso info">Aquí aparecen solos los ingresos de Skala y Maxell que se registran en Interakzion. Como todo llega a la bodega 2, quedan sumados ahí. Solo falta anotar en qué tarima y ubicación quedaron.</div>
    ${pend.length ? pend.map(l => `<div class="tarjeta rellenar">
      <div class="t1"><div class="nom">${esc(art(l.codigo))}<small>${esc(l.codigo)} · ${esc(l.nota || '')}</small></div><div class="traer"><b>${fmt(l.cantidad)}</b><span>unidades</span></div></div>
      ${D.yo.admin ? `<div class="dos" style="margin-top:10px"><div class="campo"><label>Tarima</label><input id="t${l.id}" placeholder="Ej. TB-102"></div><div class="campo"><label>Ubicación</label><input id="u${l.id}" placeholder="Ej. Z40"></div></div>
      <div class="campo"><label>Vencimiento (opcional)</label><input id="v${l.id}" placeholder="Ej. 09/2028"></div>
      <div class="acciones"><button class="btn" data-directo="${l.id}">Se fue directo a la principal</button><button class="btn ok" data-ubicar="${l.id}">Guardar ubicación</button></div>` : ''}
    </div>`).join('') : '<div class="panel vacio">No hay ingresos pendientes de ubicar.</div>'}`;
}

async function vMovimientos() {
  $('#app').innerHTML = '<div class="vacio">Cargando movimientos…</div>';
  try {
    const m = await api('/movimientos');
    const bit = D.yo.admin ? await api('/bitacora').catch(() => []) : [];
    if (vista !== 'movimientos') return;
    $('#app').innerHTML = `<div class="panel"><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Artículo</th><th class="num">Cantidad</th><th>Detalle</th></tr></thead>
      <tbody>${m.map(x => `<tr><td>${fechaHora(x.fecha)}</td><td>${esc(x.nombre || x.usuario)}</td><td>${esc(NOMBRE_MOV[x.tipo] || x.tipo)}</td><td>${esc(nomArt(x.codigo))}</td><td class="num">${fmt(x.cantidad)}</td><td class="mini">${esc(x.nota || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Todavía no hay movimientos.</td></tr>'}</tbody></table></div></div>
      ${bit.length ? `<div class="panel" style="margin-top:14px"><div style="padding:10px 12px;font-weight:700">Cambios de configuración, artículos y tarimas</div><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead>
      <tbody>${bit.map(x => `<tr><td>${fechaHora(x.fecha)}</td><td>${esc(x.nombre || x.usuario || '')}</td><td>${esc(NOMBRE_BIT[x.accion] || x.accion)}</td><td class="mini" style="word-break:break-word">${esc(String(x.detalle || '').slice(0, 300))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  } catch (e) { $('#app').innerHTML = `<div class="aviso bad">${esc(e.message)}</div>`; }
}
const NOMBRE_MOV = { 'conteo-rack': 'Rack de la principal corregido', traslado: 'Traslado bodega 2 → principal', 'bajar-excedente': 'Bajó de excedentes', conteo: 'Corrección por conteo', ingreso: 'Ingreso (Interakzion)', ubicar: 'Ingreso ubicado', 'directo-principal': 'Ingreso directo a principal', alta: 'Tarima agregada' };
const NOMBRE_BIT = { config: 'Configuración', articulo: 'Artículo', 'corregir-tarima': 'Tarima corregida', 'crear-usuario': 'Usuario creado', 'editar-usuario': 'Usuario cambiado', instalacion: 'Instalación' };
const nomArt = c => (D.articulos.find(a => a.codigo === c) || {}).descripcion || c;

async function vAdmin() {
  if (!D.yo.admin) { vista = 'relleno'; return render(); }
  const c = D.config;
  $('#app').innerHTML = `
    <div class="panel seccion"><h2>Días de relleno y cálculo</h2>
      <div class="chk" id="cfgDias">${DIAS.map((d, i) => `<label><input type="checkbox" value="${i}" ${c.diasRelleno.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
      <div class="dos" style="margin-top:10px">
        <div class="campo"><label>Días de margen (colchón)</label><input id="cfgMargen" type="number" min="0" max="14" step="0.5" value="${c.margenDias}"></div>
        <div class="campo"><label>Venta reciente: últimos N días</label><input id="cfgCorta" type="number" min="7" max="60" value="${c.ventanaCorta}"></div>
        <div class="campo"><label>Promedio largo: últimos N días</label><input id="cfgLarga" type="number" min="30" max="120" value="${c.ventanaLarga}"></div>
      </div>
      <div class="mini">Para cada artículo se usa la venta por día más alta entre la reciente y el promedio largo, así no se queda corto en temporada alta.</div>
      <div class="acciones"><button class="btn pri" id="guardarCfg">Guardar</button></div></div>
    <div class="panel seccion"><h2>Usuarios</h2><div class="mini">Los usuarios, contraseñas y permisos se manejan en Despacho y Rutas → <b>Ajustes</b>. Quien tiene el puesto <b>Bodega</b> (permiso «Inventario») solo ve el relleno y registra traslados con su clave de 4 números.</div></div>
    <div class="panel seccion"><h2>Artículos</h2>
      <div class="mini" style="margin-bottom:8px">Solo los artículos activos entran al cálculo. El stock máximo es lo que cabe en la ubicación principal. Si le pone stock máximo a un artículo que no tenía, arranca como lleno y se activa solo.</div>
      <div class="tabla-wrap"><table><thead><tr><th>Artículo</th><th>Marca</th><th>Activo</th><th class="num">Unid./caja</th><th class="num">Stock máximo (cajas)</th><th>Desde (corte)</th><th>Pendiente por</th></tr></thead><tbody>
      ${D.articulos.map(a => `<tr><td>${esc(a.descripcion)}<div class="mini">${esc(a.codigo)}</div></td><td>${esc(a.marca)}</td>
        <td><input type="checkbox" data-activo="${esc(a.codigo)}" ${a.activo ? 'checked' : ''}></td>
        <td class="num"><input style="width:64px;text-align:right" type="number" min="1" data-caja="${esc(a.codigo)}" value="${a.unid_caja}"></td>
        <td class="num"><input style="width:80px;text-align:right" type="number" min="1" data-max="${esc(a.codigo)}" value="${a.maximo ? Math.round(a.maximo / (a.unid_caja || 1) * 10) / 10 : ''}" placeholder="—"></td>
        <td><input style="width:120px" type="date" data-corte="${esc(a.codigo)}" value="${esc(a.corte || '')}"></td>
        <td><input style="width:100%;min-width:180px" data-pend="${esc(a.codigo)}" value="${esc(a.pendiente || '')}"></td></tr>`).join('')}
      </tbody></table></div></div>
    ${D.yo.rol === 'admin' ? `<div class="panel seccion"><h2>Conector de Interakzion</h2><div id="conectorInfo" class="mini">Cargando…</div></div>` : ''}`;
  try {
    const us = [];
    if (false) $('#usuarios').innerHTML = `<div class="tabla-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Activo</th><th></th></tr></thead><tbody>
      ${us.map(u => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.usuario)}</td><td><select data-rol="${u.id}">${['admin', 'gerencia', 'bodega', 'consulta'].map(r => `<option ${u.rol === r ? 'selected' : ''} value="${r}">${ROLES_N[r]}</option>`).join('')}</select></td>
        <td><input type="checkbox" data-uact="${u.id}" ${u.activo ? 'checked' : ''}></td><td><button class="btn peq" data-uclave="${u.id}">Cambiar contraseña</button></td></tr>`).join('')}
      </tbody></table></div><div class="mini" style="margin-top:6px">Bodega: registra traslados, conteos e ingresos. Consulta: solo ve. Gerencia: además configura.</div>`;
    if ($('#conectorInfo')) {
      const k = await api('/conector');
      $('#conectorInfo').innerHTML = `<p>En la PC de la oficina que tiene acceso a la carpeta de Interakzion de bodega, el archivo <code>conector.config.json</code> debe tener:</p>
        <p>Dirección (url): <code>${esc(k.url)}</code></p><p>Clave (token): <code>${esc(k.token)}</code></p>
        <p>Archivos del conector: <a href="/conector/conector-relleno.js" download>conector-relleno.js</a> · los .bat de instalación vienen en la carpeta <code>conector</code> del proyecto.</p>`;
    }
  } catch (e) { toast(e.message); }
}
const ROLES_N = { admin: 'Administrador', gerencia: 'Gerencia', bodega: 'Bodega', consulta: 'Consulta' };

// ===================== detalle de un artículo =====================
async function abrirArticulo(codigo) {
  const { filas } = calcular();
  const f = filas.find(x => x.a.codigo === codigo); if (!f) return;
  const s = f.s || { b: {} }, a = f.a, R = f.R;
  const otras = Object.entries(s.b || {}).filter(([b, n]) => n && !(D.config.bodegasQueSuman || []).includes(+b));
  const lotes = f.lotes.slice().sort((x, y) => (x.tipo === 'excedente') - (y.tipo === 'excedente') || claveVence(x.vence).localeCompare(claveVence(y.vence)));
  const partida = a.base_fecha ? (a.base_ts && a.base_ts.startsWith(D.maximosTs || '¬') ? 'lleno según el Excel de stock máximo' : 'último ajuste') : '';
  $('#capa').innerHTML = `<div class="velo" id="velo"><div class="hoja">
    <button class="cerrar" data-cerrar>✕</button>
    <h2>${esc(a.descripcion)}</h2><div class="sub">${esc(a.codigo)} · ${esc(a.marca)} · Ubicación principal: <b>${esc(f.estante || '—')}</b> · ${f.caja} unid. por caja</div>
    ${!a.activo ? `<div class="aviso warn">Pendiente: ${esc(a.pendiente || 'no entra al cálculo todavía')}</div>` : ''}
    ${f.rack != null ? barra(f) : ''}
    <div class="grid2">
      <div class="dato dest"><span>Traer en el relleno</span><b>${f.estado === 'urgente' || f.estado === 'rellenar' ? enCajas(f.traer, f.caja) : 'Nada'}</b></div>
      <div class="dato"><span>Alcanza</span><b>${textoAlcanza(f.alcanza)}</b></div>
      <div class="dato"><span>Bodega 2</span><b>${enCajas(f.b2, f.caja)}</b></div>
      <div class="dato"><span>Excedentes</span><b>${enCajas(f.ex, f.caja)}</b></div>
      <div class="dato"><span>Venta reciente (${D.config.ventanaCorta} días)</span><b>${cajasNum(f.corta * 7, f.caja)} ${f.caja > 1 ? 'cajas' : 'unid.'}/semana</b></div>
      <div class="dato"><span>Promedio (${D.config.ventanaLarga} días)</span><b>${cajasNum(f.larga * 7, f.caja)} ${f.caja > 1 ? 'cajas' : 'unid.'}/semana</b></div>
    </div>
    ${R ? `<h3>Cómo se calcula lo que hay en el rack</h3>
      <div class="cuenta">
        <div><span>Al final del ${fechaBonita(a.base_fecha)} (${partida})</span><b>${fmt(a.base_cant)}</b></div>
        <div><span>+ Traído de la bodega 2 / excedentes desde entonces</span><b>${fmt(R.traido)}</b></div>
        <div><span>− Vendido en Interakzion desde entonces</span><b>${fmt(R.vendido)}</b></div>
        <div class="tot"><span>= En el rack ahora (unidades, sin pasar de ${fmt(f.max)})</span><b>${fmt(f.rack)}</b></div>
      </div>
      ${R.topeSistema ? '<div class="mini">Se limitó a la existencia total de Interakzion.</div>' : ''}
      ${D.yo.admin ? `<div class="acciones"><button class="btn" data-contar="${esc(a.codigo)}">Corregir: lo conté</button><button class="btn ok" data-lleno="${esc(a.codigo)}">Está lleno</button></div>` : ''}` : ''}
    <div class="mini" style="margin-top:8px">Existencia total en Interakzion: ${fmt(f.total)} (bodega general ${fmt(s.g)}${(D.config.bodegasQueSuman || []).map(b => ' + ' + esc(D.config.nombresBodegas[b] || 'bodega ' + b) + ' ' + fmt((s.b || {})[b] || 0)).join('')})${otras.length ? ' · no cuentan: ' + otras.map(([b, n]) => 'bodega ' + b + ': ' + fmt(n)).join(', ') : ''}</div>
    <h3>Tarimas y excedentes</h3>
    ${lotes.length ? lotes.map(l => `<div class="fuente">
        <div class="q">${enCajas(l.cantidad, f.caja)}</div>
        <div class="d"><b>${l.tipo === 'excedente' ? 'Excedente' : esc(l.tarima || (l.estado === 'pendiente' ? 'Ingreso sin ubicar' : 'Tarima'))}</b> · ${esc(l.ubicacion || 'sin ubicación')}
          <small>${l.vence ? 'Vence ' + esc(l.vence) + ' · ' : ''}${esc(l.nota || '')}</small></div>
        ${D.yo.admin ? `<button class="btn peq" data-editlote="${l.id}">Corregir</button>${l.cantidad > 0 ? `<button class="btn peq pri" data-traer="${l.id}" data-sug="${f.traer}">Traje de aquí</button>` : ''}` : ''}
      </div>`).join('') : '<div class="mini">No hay nada en la bodega 2 ni en excedentes.</div>'}
    ${D.yo.admin ? `<div class="acciones"><button class="btn" data-nuevolote="${esc(a.codigo)}">Agregar tarima o excedente</button></div>` : ''}
    <h3>Últimos movimientos</h3><div id="movArt" class="mini">Cargando…</div>
  </div></div>`;
  try {
    const m = await api('/movimientos?codigo=' + encodeURIComponent(codigo));
    const el = $('#movArt'); if (!el) return;
    el.innerHTML = m.length ? `<table><tbody>${m.map(x => `<tr><td>${fechaHora(x.fecha)}</td><td>${esc(NOMBRE_MOV[x.tipo] || x.tipo)}<div class="mini">${esc(x.nombre || x.usuario)} · ${esc(x.nota || '')}</div></td><td class="num">${fmt(x.cantidad)}</td></tr>`).join('')}</tbody></table>` : 'Sin movimientos todavía.';
  } catch (e) { }
}

function modalRack(codigo, lleno) {
  const a = D.articulos.find(x => x.codigo === codigo) || {}; const caja = a.unid_caja || 1;
  const enviar = async (cant, m) => {
    try { await api('/articulo/' + encodeURIComponent(codigo) + '/rack', { method: 'POST', body: { cantidad: cant } }); if (m) m.remove(); toast('Rack actualizado'); await cargar(); abrirArticulo(codigo); }
    catch (e) { if (m) m.querySelector('#rErr').textContent = e.message; else toast(e.message); }
  };
  if (lleno) { if (confirm(`¿La ubicación principal de ${a.descripcion} está llena (${enCajas(a.maximo, caja)})?`)) enviar(a.maximo); return; }
  const m = modal(`<h3>¿Cuánto hay en el rack?</h3><div class="sub">${esc(a.descripcion)}<br>Stock máximo: ${enCajas(a.maximo, caja)}</div>
    <div class="dos"><div class="campo"><label>Cajas completas</label><input id="rC" type="number" min="0" inputmode="numeric"></div>
      <div class="campo"><label>Unidades sueltas</label><input id="rU" type="number" min="0" inputmode="numeric" value="0"></div></div>
    <div class="mini">Desde ahora la herramienta sigue contando con lo que se traiga y lo que se venda.</div>
    <div class="err" id="rErr"></div>
    <div class="acciones"><button class="btn" data-cancelar>Cancelar</button><button class="btn ok" id="rOk">Guardar</button></div>`);
  m.querySelector('#rC').focus();
  m.querySelector('#rOk').onclick = () => enviar((+m.querySelector('#rC').value || 0) * caja + (+m.querySelector('#rU').value || 0), m);
}

// ===================== modales =====================
function modal(html) { const d = document.createElement('div'); d.className = 'modal-velo'; d.innerHTML = `<div class="modal">${html}</div>`; R.appendChild(d); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-cancelar]')) d.remove(); }); return d; }

function modalTraslado(loteId, sugerido) {
  const l = D.lotes.find(x => x.id === loteId); if (!l) return;
  const a = D.articulos.find(x => x.codigo === l.codigo) || {}; const caja = a.unid_caja || 1;
  const pre = Math.min(l.cantidad, sugerido > 0 ? sugerido : l.cantidad);
  const m = modal(`<h3>${l.tipo === 'excedente' ? 'Bajar de excedentes' : 'Traer de la bodega 2'}</h3>
    <div class="sub">${esc(a.descripcion)}<br>${l.tipo === 'excedente' ? 'Excedente ' : (esc(l.tarima || 'Tarima') + ' · ')}${esc(l.ubicacion || '')} — hay ${enCajas(l.cantidad, caja)}${sugerido > 0 ? '<br>Para llenar el rack faltan <b>' + enCajas(sugerido, caja) + '</b>' : ''}</div>
    ${caja > 1 ? `<div class="dos"><div class="campo"><label>Cajas que trae (de ${caja})</label><input id="mCajas" type="number" min="0" inputmode="numeric" value="${pre % caja === 0 ? pre / caja : ''}"></div>
      <div class="campo"><label>Unidades en total</label><input id="mUnid" type="number" min="1" inputmode="numeric" value="${pre}"></div></div>`
      : `<div class="campo"><label>Unidades</label><input id="mUnid" type="number" min="1" inputmode="numeric" value="${pre}"></div>`}
    <div class="dos"><div class="campo"><label>¿Quién lo trae?</label><select id="mQuien">${(D.personas || []).map(p => `<option value="${esc(p.usuario)}" ${p.usuario.toLowerCase() === D.yo.usuario.toLowerCase() ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
      <div class="campo"><label>Su contraseña</label><input id="mClave" type="password" inputmode="numeric" autocomplete="off"></div></div>
    <div class="campo"><label>Nota (opcional)</label><input id="mNota" placeholder=""></div>
    <div class="mini">Cada relleno queda registrado a nombre de quien lo trae.</div>
    <div class="err" id="mErr"></div>
    <div class="acciones"><button class="btn" data-cancelar>Cancelar</button><button class="btn ok" id="mOk">Registrar</button></div>`);
  const cj = m.querySelector('#mCajas'), un = m.querySelector('#mUnid');
  if (cj) { cj.oninput = () => { if (cj.value !== '') un.value = (+cj.value) * caja; }; un.oninput = () => { cj.value = (+un.value) % caja === 0 ? (+un.value) / caja : ''; }; }
  (cj || un).focus(); (cj || un).select();
  m.querySelector('#mOk').onclick = async () => {
    const b = m.querySelector('#mOk'); b.disabled = true;
    try {
      if (!m.querySelector('#mClave').value) { m.querySelector('#mErr').textContent = 'Escriba su contraseña para confirmar'; b.disabled = false; return; }
      await api('/traslado', { method: 'POST', body: { lote_id: l.id, cantidad: +un.value, nota: m.querySelector('#mNota').value, quien: m.querySelector('#mQuien').value, clave: m.querySelector('#mClave').value } });
      m.remove(); toast('Registrado: ' + enCajas(+un.value, caja) + ' · ' + a.descripcion); await cargar(); if ($('#velo')) abrirArticulo(l.codigo);
    } catch (e) { m.querySelector('#mErr').textContent = e.message; b.disabled = false; }
  };
}

function modalLote(loteId) {
  const l = D.lotes.find(x => x.id === loteId); if (!l) return;
  const a = D.articulos.find(x => x.codigo === l.codigo) || {};
  const m = modal(`<h3>Corregir ${l.tipo === 'excedente' ? 'excedente' : 'tarima'}</h3><div class="sub">${esc(a.descripcion)}</div>
    <div class="dos"><div class="campo"><label>Tarima</label><input id="eT" value="${esc(l.tarima || '')}"></div><div class="campo"><label>Ubicación</label><input id="eU" value="${esc(l.ubicacion || '')}"></div></div>
    <div class="dos"><div class="campo"><label>Unidades contadas</label><input id="eC" type="number" min="0" inputmode="numeric" value="${l.cantidad}"></div><div class="campo"><label>Vencimiento</label><input id="eV" value="${esc(l.vence || '')}"></div></div>
    <div class="campo"><label>Motivo / nota</label><input id="eN" value="${esc(l.nota || '')}"></div>
    <div class="mini">Si cambia las unidades, queda registrado como corrección por conteo. Ponga 0 si la tarima ya no existe.</div>
    <div class="err" id="eErr"></div>
    <div class="acciones"><button class="btn" data-cancelar>Cancelar</button><button class="btn ok" id="eOk">Guardar</button></div>`);
  m.querySelector('#eOk').onclick = async () => {
    try {
      await api('/lote/' + l.id, { method: 'PUT', body: { tarima: m.querySelector('#eT').value, ubicacion: m.querySelector('#eU').value, cantidad: +m.querySelector('#eC').value, vence: m.querySelector('#eV').value, nota: m.querySelector('#eN').value, motivo: m.querySelector('#eN').value, ubicar: l.estado === 'pendiente' && !!m.querySelector('#eU').value.trim() } });
      m.remove(); toast('Guardado'); await cargar(); abrirArticulo(l.codigo);
    } catch (e) { m.querySelector('#eErr').textContent = e.message; }
  };
}

function modalNuevoLote(codigo) {
  const a = D.articulos.find(x => x.codigo === codigo) || {};
  const m = modal(`<h3>Agregar tarima o excedente</h3><div class="sub">${esc(a.descripcion)}</div>
    <div class="campo"><label>Dónde está</label><select id="nTipo"><option value="bodega2">Bodega 2</option><option value="excedente">Excedente (rack alto)</option></select></div>
    <div class="dos"><div class="campo"><label>Tarima</label><input id="nT"></div><div class="campo"><label>Ubicación</label><input id="nU"></div></div>
    <div class="dos"><div class="campo"><label>Unidades</label><input id="nC" type="number" min="1" inputmode="numeric"></div><div class="campo"><label>Vencimiento</label><input id="nV" placeholder="09/2028"></div></div>
    <div class="campo"><label>Nota</label><input id="nN"></div><div class="err" id="nErr"></div>
    <div class="acciones"><button class="btn" data-cancelar>Cancelar</button><button class="btn ok" id="nOk">Agregar</button></div>`);
  m.querySelector('#nOk').onclick = async () => {
    try {
      await api('/lote', { method: 'POST', body: { codigo, tipo: m.querySelector('#nTipo').value, tarima: m.querySelector('#nT').value, ubicacion: m.querySelector('#nU').value, cantidad: +m.querySelector('#nC').value, vence: m.querySelector('#nV').value, nota: m.querySelector('#nN').value } });
      m.remove(); toast('Agregado'); await cargar(); abrirArticulo(codigo);
    } catch (e) { m.querySelector('#nErr').textContent = e.message; }
  };
}

function modalUsuario() {
  const m = modal(`<h3>Agregar usuario</h3>
    <div class="campo"><label>Nombre</label><input id="uN" placeholder="Esteban"></div>
    <div class="campo"><label>Usuario (para entrar)</label><input id="uU" placeholder="esteban" autocapitalize="off"></div>
    <div class="campo"><label>Rol</label><select id="uR"><option value="bodega">Bodega (registra traslados e ingresos)</option><option value="consulta">Consulta (solo ve)</option><option value="gerencia">Gerencia</option>${D.yo.rol === 'admin' ? '<option value="admin">Administrador</option>' : ''}</select></div>
    <div class="campo"><label>Contraseña (mínimo 4, puede ser la de Interakzion)</label><input id="uC" type="text"></div><div class="err" id="uErr"></div>
    <div class="acciones"><button class="btn" data-cancelar>Cancelar</button><button class="btn ok" id="uOk">Crear</button></div>`);
  m.querySelector('#uOk').onclick = async () => {
    try { await api('/usuarios', { method: 'POST', body: { nombre: m.querySelector('#uN').value, usuario: m.querySelector('#uU').value, rol: m.querySelector('#uR').value, clave: m.querySelector('#uC').value } }); m.remove(); toast('Usuario creado'); vAdmin(); }
    catch (e) { m.querySelector('#uErr').textContent = e.message; }
  };
}

function descargarInventario() {
  const q = x => { const t = String(x == null ? '' : x); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const filas = [['Código', 'Descripción', 'Dónde', 'Tarima', 'Ubicación', 'Unidades', 'Cajas', 'Vencimiento', 'Estado', 'Nota']];
  for (const l of D.lotes.filter(l => l.cantidad > 0 || l.estado === 'pendiente')) {
    const a = D.articulos.find(x => x.codigo === l.codigo) || {};
    filas.push([l.codigo, a.descripcion, l.tipo === 'excedente' ? 'Excedente' : 'Bodega 2', l.tarima, l.ubicacion, l.cantidad, a.unid_caja > 1 ? Math.round(l.cantidad / a.unid_caja * 10) / 10 : '', l.vence, l.estado === 'pendiente' ? 'Sin ubicar' : 'Ubicado', l.nota]);
  }
  const blob = new Blob(['﻿' + filas.map(f => f.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'inventario_bodega2_' + hoyCR() + '.csv'; a.click();
}

// ===================== eventos =====================
function instalarEventos() {
R.addEventListener('click', async e => {
  const t = e.target;
  const tab = t.closest('#tabs button'); if (tab) { if (D && D.yo.soloRelleno) return; vista = tab.dataset.v; render(); window.scrollTo(0, 0); return; }
  const fil = t.closest('[data-filtro]'); if (fil) { filtroRelleno = filtroRelleno === fil.dataset.filtro ? 'todos' : fil.dataset.filtro; render(); return; }
  if (t.closest('[data-cerrar]') || t.id === 'velo') { $('#capa').innerHTML = ''; return; }
  const tr = t.closest('[data-traer]'); if (tr) { modalTraslado(+tr.dataset.traer, +tr.dataset.sug); return; }
  const ct = t.closest('[data-contar]'); if (ct) { modalRack(ct.dataset.contar, false); return; }
  const ll = t.closest('[data-lleno]'); if (ll) { modalRack(ll.dataset.lleno, true); return; }
  const ed = t.closest('[data-editlote]'); if (ed) { modalLote(+ed.dataset.editlote); return; }
  const nl = t.closest('[data-nuevolote]'); if (nl) { modalNuevoLote(nl.dataset.nuevolote); return; }
  const ar = t.closest('[data-art]'); if (ar) { if (!D.yo.soloRelleno) abrirArticulo(ar.dataset.art); return; }
  const ub = t.closest('[data-ubicar]');
  if (ub) {
    const id = ub.dataset.ubicar; ub.disabled = true;
    try { await api('/lote/' + id, { method: 'PUT', body: { tarima: $('#t' + id).value, ubicacion: $('#u' + id).value, vence: $('#v' + id).value, ubicar: true } }); toast('Ubicación guardada'); await cargar(); }
    catch (er) { toast(er.message); ub.disabled = false; }
    return;
  }
  const di = t.closest('[data-directo]');
  if (di) {
    if (!confirm('¿Este ingreso se acomodó directo en la ubicación principal? Se quita de la bodega 2.')) return;
    try { await api('/lote/' + di.dataset.directo + '/directo', { method: 'POST' }); toast('Listo'); await cargar(); } catch (er) { toast(er.message); }
    return;
  }
  if (t.id === 'descargarInv') { descargarInventario(); return; }
  if (t.id === 'nuevoUsuario') { modalUsuario(); return; }
  const uc = t.closest('[data-uclave]');
  if (uc) { const c = prompt('Contraseña nueva (mínimo 4 caracteres):'); if (!c) return; try { await api('/usuarios/' + uc.dataset.uclave, { method: 'PUT', body: { clave: c } }); toast('Contraseña cambiada'); } catch (er) { toast(er.message); } return; }
  if (t.id === 'guardarCfg') {
    try {
      const dias = [...R.querySelectorAll('#cfgDias input:checked')].map(x => +x.value);
      const r = await api('/config', { method: 'PUT', body: { diasRelleno: dias, margenDias: +$('#cfgMargen').value, ventanaCorta: +$('#cfgCorta').value, ventanaLarga: +$('#cfgLarga').value } });
      D.config = r.config; toast('Configuración guardada');
    } catch (er) { toast(er.message); }
  }
});
R.addEventListener('change', async e => {
  const t = e.target;
  const put = async (codigo, body) => { try { await api('/articulo/' + encodeURIComponent(codigo), { method: 'PUT', body }); toast('Guardado'); await cargar(false); } catch (er) { toast(er.message); } };
  if (t.dataset.activo) return put(t.dataset.activo, { activo: t.checked });
  if (t.dataset.caja) return put(t.dataset.caja, { unid_caja: +t.value });
  if (t.dataset.max) { const a = D.articulos.find(x => x.codigo === t.dataset.max) || {}; return put(t.dataset.max, { maximo: t.value === '' ? null : Math.round(+t.value * (a.unid_caja || 1)) }); }
  if (t.dataset.corte) return put(t.dataset.corte, { corte: t.value });
  if (t.hasAttribute('data-pend')) return put(t.dataset.pend, { pendiente: t.value });
  if (t.dataset.rol) { try { await api('/usuarios/' + t.dataset.rol, { method: 'PUT', body: { rol: t.value } }); toast('Rol cambiado'); } catch (er) { toast(er.message); } return; }
  if (t.dataset.uact) { try { await api('/usuarios/' + t.dataset.uact, { method: 'PUT', body: { activo: t.checked } }); toast('Guardado'); } catch (er) { toast(er.message); t.checked = !t.checked; } }
});
R.addEventListener('input', e => { if (e.target.id === 'buscarInv') { busqueda = e.target.value; vInventario(); } });

}
// ===================== inicio de sesión =====================
async function mostrarLoginOriginal() {
  D = null; $('#barra').classList.add('oculto'); $('#capa').innerHTML = '';
  let inst = false; try { inst = (await api('/estado')).necesitaInstalacion; } catch (e) { }
  $('#app').innerHTML = `<div class="panel login"><h1>Relleno de racks</h1><div class="mini" style="margin-bottom:14px">ImpoHogar · Bodega</div>
    ${inst ? `<div class="aviso info">Primera vez: cree el usuario administrador. Necesita el código de instalación.</div>
      <div class="campo"><label>Código de instalación</label><input id="lCod"></div><div class="campo"><label>Su nombre</label><input id="lNom"></div>` : ''}
    <div class="campo"><label>Usuario</label><input id="lUsu" autocapitalize="off" autocomplete="username"></div>
    <div class="campo"><label>Contraseña</label><input id="lCla" type="password" autocomplete="current-password"></div>
    <div class="err" id="lErr"></div>
    <button class="btn pri" id="lOk" style="width:100%">${inst ? 'Crear administrador' : 'Entrar'}</button></div>`;
  const entrar = async () => {
    try {
      if (inst) await api('/instalar', { method: 'POST', body: { codigo: $('#lCod').value, nombre: $('#lNom').value, usuario: $('#lUsu').value, clave: $('#lCla').value } });
      await cargar();
    } catch (e) { $('#lErr').textContent = e.message; }
  };
  $('#lOk').onclick = entrar;
  $('#lCla').onkeydown = e => { if (e.key === 'Enter') entrar(); };
}

async function cargar(rerender = true) {
  try {
    D = await api('/datos');
    // ¿Quién lo trae?: personas de Despacho con permiso de Inventario + las que ya lo han usado
    const pd = CTX.personas ? CTX.personas() : [], vistos = new Set();
    D.personas = [...pd, ...(D.personas || [])].filter(p => p && p.usuario && !vistos.has(p.usuario.toLowerCase()) && vistos.add(p.usuario.toLowerCase()))
      .sort((x, y) => String(x.nombre).localeCompare(String(y.nombre)));
    $('#barra').classList.remove('oculto');
    $('#quien').textContent = D.yo.nombre;
    $('#tabAdmin').classList.toggle('oculto', !D.yo.admin);
    R.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.v !== 'relleno' && b.dataset.v !== 'admin') b.classList.toggle('oculto', !!D.yo.soloRelleno); });
    if (D.yo.soloRelleno) vista = 'relleno';
    if (rerender) render(); else frescura();
  } catch (e) { if (!/Sesión/.test(e.message)) $('#app').innerHTML = `<div class="aviso bad">${esc(e.message)}</div>`; }
}
// se refresca solo cada 3 minutos (sin molestar si hay una ventana abierta), solo mientras la pestaña está abierta
REFRESCAR = () => { if (D && !R.querySelector('.modal-velo') && !$('#velo') && vista !== 'admin') cargar(); };
CARGAR = cargar;

const ESTILOS = "\n:host{display:block;\n  --card:var(--panel); --soft:var(--muted); --line2:var(--line);\n  --brand:var(--ink); --brand2:var(--accent); --acc:var(--accent); --info:var(--r1);\n  --okbg:color-mix(in srgb,var(--ok) 14%,var(--panel)); --warnbg:color-mix(in srgb,var(--warn) 14%,var(--panel));\n  --badbg:color-mix(in srgb,var(--bad) 14%,var(--panel)); --infobg:color-mix(in srgb,var(--r1) 12%,var(--panel));\n  --r:10px; --sh:none;\n  font-family:var(--body);\n}\n*{box-sizing:border-box}\n:host{background:var(--bg);color:var(--ink);font-size:15px;line-height:1.45;border-radius:12px;overflow:hidden}\nbutton,input,select,textarea{font:inherit;color:inherit}\n.oculto{display:none!important}\nheader.top{background:var(--brand);color:#fff}\n.top-in{display:flex;align-items:center;gap:12px;padding:10px 16px;max-width:1200px;margin:0 auto;flex-wrap:wrap}\n.marca{font-weight:700;white-space:nowrap}\n.marca small{display:block;font-weight:400;opacity:.75;font-size:11px;letter-spacing:.4px;text-transform:uppercase}\n.top-der{margin-left:auto;display:flex;align-items:center;gap:8px;white-space:nowrap}\n.frescura{font-size:12px;padding:4px 10px;border-radius:20px;background:rgba(255,255,255,.12)}\n.frescura::before{content:\"\";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px;background:#9ca3af}\n.frescura.ok::before{background:#4ade80}.frescura.warn::before{background:#fbbf24}.frescura.bad::before{background:#f87171}\n.btn-sal{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:8px;padding:5px 10px;cursor:pointer}\nnav.tabs{display:flex;gap:2px;overflow-x:auto;width:100%;max-width:1200px;margin:0 auto;padding:0 10px}\nnav.tabs button{background:transparent;border:0;border-bottom:3px solid transparent;color:#cfdbe8;padding:8px 12px 7px;cursor:pointer;white-space:nowrap}\nnav.tabs button.act{color:#fff;border-bottom-color:var(--acc)}\nnav.tabs .badge{background:var(--acc);color:#fff;border-radius:10px;padding:0 6px;font-size:11px;margin-left:4px}\nmain{max-width:1200px;margin:0 auto;padding:14px 14px 40px}\n.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh)}\n.aviso{border-radius:var(--r);padding:10px 14px;margin-bottom:12px;font-size:14px}\n.aviso.info{background:var(--infobg);color:var(--ink)}.aviso.warn{background:var(--warnbg);color:var(--ink)}.aviso.bad{background:var(--badbg);color:var(--ink)}.aviso.ok{background:var(--okbg);color:var(--ink)}\n.dia{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;margin-bottom:12px}\n.dia .grande{font-size:20px;font-weight:700}\n.dia .sub{color:var(--muted);font-size:13px}\n.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}\n.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;box-shadow:var(--sh);cursor:pointer;text-align:left}\n.kpi .l{font-size:12px;color:var(--muted)}\n.kpi .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}\n.kpi.act{outline:2px solid var(--brand2)}\n.kpi.bad .v{color:var(--bad)}.kpi.warn .v{color:var(--warn)}.kpi.info .v{color:var(--info)}\n.buscar{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}\n.buscar input,.buscar select{flex:1 1 220px;padding:10px 12px;border:1px solid var(--line2);border-radius:8px;background:var(--panel)}\n.btn{border:1px solid var(--line2);background:var(--panel);border-radius:8px;padding:8px 13px;cursor:pointer}\n.btn:hover{border-color:var(--soft)}\n.btn.pri{background:var(--brand);border-color:var(--brand);color:#fff}\n.btn.ok{background:var(--ok);border-color:var(--ok);color:#fff}\n.btn.peq{padding:5px 10px;font-size:13px}\n.btn:disabled{opacity:.5;cursor:default}\n.tarjeta{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line2);border-radius:var(--r);box-shadow:var(--sh);padding:12px 14px;margin-bottom:10px}\n.tarjeta.urgente{border-left-color:var(--bad)}.tarjeta.rellenar{border-left-color:var(--acc)}.tarjeta.sin{border-left-color:var(--r3)}.tarjeta.descuadre{border-left-color:var(--muted)}\n.t1{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}\n.t1 .nom{font-weight:700;flex:1 1 220px}\n.t1 .nom small{display:block;font-weight:400;color:var(--soft);font-size:12px}\n.traer{text-align:right;background:var(--infobg);border-radius:8px;padding:6px 12px;min-width:120px}\n.traer b{display:block;font-size:20px;color:var(--brand);font-variant-numeric:tabular-nums;line-height:1.2}\n.traer span{display:block;font-size:12px;color:var(--muted)}\n.traer span:first-child{text-transform:uppercase;font-weight:700;letter-spacing:.4px;font-size:11px}\n.tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;vertical-align:1px}\n.tag.urgente{background:var(--badbg);color:var(--bad)}.tag.rellenar{background:var(--warnbg);color:var(--warn)}.tag.sin{background:color-mix(in srgb,var(--r3) 15%,var(--panel));color:var(--r3)}.tag.descuadre{background:var(--sunk);color:var(--muted)}.tag.ok{background:var(--okbg);color:var(--ok)}.tag.pend{background:var(--sunk);color:var(--muted)}\n.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}\n.nums div{background:var(--sunk);border-radius:7px;padding:6px 8px}\n.nums b{display:block;font-size:16px;font-variant-numeric:tabular-nums}\n.nums span{font-size:11px;color:var(--muted)}\n@media (max-width:560px){.nums{grid-template-columns:repeat(2,1fr)}}\n.fuentes{border-top:1px dashed var(--line2);margin-top:6px;padding-top:6px}\n.fuente{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}\n.fuente:last-child{border-bottom:0}\n.fuente .q{font-weight:700;font-variant-numeric:tabular-nums;min-width:70px;text-align:right}\n.fuente .d{flex:1 1 200px;font-size:14px}\n.fuente .d small{display:block;color:var(--soft);font-size:12px}\n.lbl{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin:6px 0 2px}\ntable{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}\nth,td{padding:8px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}\nth{font-size:12px;font-weight:600;color:var(--muted);background:var(--sunk);position:sticky;top:0;white-space:nowrap}\n.num{text-align:right}\ntbody tr.clic{cursor:pointer}\ntbody tr.clic:hover td{background:color-mix(in srgb,var(--accent) 7%,var(--panel))}\n.neg{color:var(--bad);font-weight:700}\n.gris{color:var(--soft)}\n.tabla-wrap{overflow-x:auto}\n.lista-movil{display:none}\n@media (max-width:820px){.tabla-wrap.resp{display:none}.lista-movil{display:block}}\n.fila-m{padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer}\n.fila-m .a{font-weight:600}\n.fila-m .b{font-size:13px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;margin-top:2px}\n/* hoja / modal */\n.velo{position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:40;display:flex;justify-content:flex-end}\n.hoja{background:var(--panel);width:min(620px,100%);height:100%;overflow-y:auto;box-shadow:-8px 0 24px rgba(0,0,0,.12);padding:18px 18px 50px}\n.hoja h2{margin:0 0 2px;font-size:18px}\n.hoja .sub{color:var(--muted);font-size:13px;margin-bottom:12px}\n.hoja h3{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:18px 0 8px}\n.cerrar{float:right;border:0;background:var(--sunk);border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:18px}\n.modal-velo{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:60;display:flex;align-items:center;justify-content:center;padding:14px}\n.modal{background:var(--panel);border-radius:14px;width:min(440px,100%);padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.25);max-height:92vh;overflow-y:auto}\n.modal h3{margin:0 0 4px;font-size:17px}\n.modal .sub{color:var(--muted);font-size:13px;margin-bottom:12px}\n.campo{margin-bottom:10px}\n.campo label{display:block;font-size:13px;color:var(--muted);margin-bottom:3px}\n.campo input,.campo select,.campo textarea{width:100%;padding:10px 12px;border:1px solid var(--line2);border-radius:8px;background:var(--panel)}\n.dos{display:grid;grid-template-columns:1fr 1fr;gap:8px}\n.acciones{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}\n.err{color:var(--bad);font-size:13px;min-height:18px}\n.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}\n.dato{background:var(--sunk);border-radius:8px;padding:8px 10px}\n.dato span{display:block;font-size:12px;color:var(--muted)}\n.dato b{font-size:17px;font-variant-numeric:tabular-nums}\n.dato.dest{background:var(--infobg)}\n.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:10px;z-index:90;font-size:14px;box-shadow:0 8px 20px rgba(0,0,0,.25)}\n.login{max-width:380px;margin:60px auto;padding:22px}\n.login h1{font-size:20px;margin:0 0 4px}\n.vacio{padding:30px 16px;text-align:center;color:var(--muted)}\n.chk{display:flex;gap:10px;flex-wrap:wrap}\n.chk label{display:flex;gap:5px;align-items:center;border:1px solid var(--line2);border-radius:8px;padding:6px 10px;cursor:pointer}\n/* rack de la ubicación principal */\n.rack{margin:10px 0 6px}\n.rack-txt{display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-bottom:4px}\n.rack-txt span:last-child{font-weight:700;color:var(--muted)}\n.rack-bar{height:12px;background:var(--sunk);border-radius:6px;overflow:hidden}\n.rack-bar i{display:block;height:100%;border-radius:6px}\n.nota{margin-top:4px;color:var(--warn)}\n.kpi.fijo{cursor:default}\n.tag.pendiente,.tag.sindatos{background:var(--sunk);color:var(--muted)}\n.cuenta{background:var(--sunk);border-radius:8px;padding:6px 12px}\n.cuenta div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:14px;border-bottom:1px solid var(--line)}\n.cuenta div:last-child{border-bottom:0}\n.cuenta .tot{font-weight:700}\n.cuenta b{font-variant-numeric:tabular-nums;white-space:nowrap}\n.hecho h2{color:var(--ok)}\ndetails.mas summary{cursor:pointer;color:var(--brand2);font-size:13px;padding:8px 0;font-weight:600}\n.fila-h{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}\n.fila-h:last-child{border-bottom:0}\n.fila-h>span{color:var(--ok);font-weight:700}\ncode{background:var(--sunk);border-radius:5px;padding:2px 6px;font-size:13px;word-break:break-all}\n.seccion{padding:14px 16px;margin-bottom:12px}\n.seccion h2{font-size:16px;margin:0 0 8px}\n.mini{font-size:12px;color:var(--muted)}\n\n/* ---- apariencia de Despacho y Rutas ---- */\n:host{background:transparent!important;border-radius:0!important;overflow:visible!important;font-size:16px!important}\nh1,h2,h3,.grande,.hoja h2,.modal h3,.seccion h2{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em}\nheader.top{background:transparent;color:var(--ink);border-bottom:1px solid var(--line);margin-bottom:16px}\n.top-in{padding:0 0 10px;max-width:none;gap:10px 16px}\n.marca{font-family:var(--display);font-size:26px;text-transform:uppercase;letter-spacing:.03em;line-height:1.1}\n.marca small{font-family:var(--body);font-size:12px;font-weight:600;letter-spacing:.12em;color:var(--muted);opacity:1;margin-top:2px}\n.frescura{background:transparent;padding:0;font-size:14px;font-weight:600;border-radius:0;color:var(--ink)}\n.frescura::before{width:10px;height:10px;background:var(--muted)}\n.frescura.ok::before{background:var(--ok)}.frescura.warn::before{background:var(--warn)}.frescura.bad::before{background:var(--bad)}\n#quien{display:none}\nnav.tabs{padding:0 0 10px;max-width:none;gap:4px;flex-wrap:wrap;overflow:visible}\nnav.tabs button{border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--muted);font-family:var(--display);font-size:17px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:6px 14px;min-height:40px}\nnav.tabs button.act{background:var(--ink);border-color:var(--ink);color:var(--bg)}\nnav.tabs .badge{background:var(--accent);color:var(--accent-ink);font-family:var(--mono);font-size:12px;border-radius:99px;padding:0 7px;vertical-align:1px}\nmain{max-width:none;padding:0 0 20px}\n.panel,.kpi,.tarjeta{border-radius:12px}\n.kpi{padding:10px 14px}\n.kpi .l{font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}\n.kpi .v{font-family:var(--display);font-size:34px;line-height:1.1}\n.kpi.act{outline:0;border-color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink)}\n.traer b{font-family:var(--display);font-size:26px;color:var(--ink)}\n.btn{min-height:44px;padding:8px 16px;font-weight:600;background:var(--panel);border-color:var(--line)}\n.btn:hover{border-color:var(--muted)}\n.btn.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}\n.btn.ok{color:#fff}\n.btn.peq{min-height:36px;padding:4px 10px;font-size:14px}\n.buscar input,.buscar select,.campo input,.campo select,.campo textarea{background:var(--sunk);border-color:var(--line);padding:11px 13px}\n.campo label{font-weight:600;color:var(--ink);font-size:14px}\nth{background:var(--sunk);text-transform:uppercase;letter-spacing:.06em;font-size:11px}\n.hoja{background:var(--panel);color:var(--ink)}\n.modal{background:var(--panel);color:var(--ink);border:1px solid var(--line)}\n.cerrar{background:var(--sunk);color:var(--ink)}\n.chk label{background:var(--panel)}\n";
const PANTALLA = "<header class=\"top\" id=\"barra\">\n  <div class=\"top-in\">\n    <div class=\"marca\">Relleno de racks<small>ImpoHogar · Bodega</small></div>\n    <div class=\"top-der\">\n      <span class=\"frescura\" id=\"frescura\">Sin datos</span>\n      <span id=\"quien\" class=\"mini\" style=\"color:#cfdbe8\"></span>\n    </div>\n  </div>\n  <nav class=\"tabs\" id=\"tabs\">\n    <button data-v=\"relleno\" class=\"act\">Relleno</button>\n    <button data-v=\"inventario\">Inventario</button>\n    <button data-v=\"ingresos\">Ingresos <span class=\"badge oculto\" id=\"bIngresos\"></span></button>\n    <button data-v=\"movimientos\">Movimientos</button>\n    <button data-v=\"admin\" class=\"oculto\" id=\"tabAdmin\">Administración</button>\n  </nav>\n</header>\n<main id=\"app\"><div class=\"vacio\">Cargando…</div></main>\n<div id=\"capa\"></div>";
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
