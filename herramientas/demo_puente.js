/* ==== MODO DEMOSTRACIÓN ====
   Esta página es una copia de Despacho y Rutas que NO toca la herramienta real:
   el «servidor» corre aquí mismo, dentro del navegador, con el mismo código de reglas que el real,
   y todo se guarda aparte (llaves «DEMO::» del navegador). Los clientes y proformas de ejemplo se copian
   (solo lectura) de la herramienta real la primera vez, si este navegador ya tiene una sesión abierta. */
(function(){
  var URL_REAL = "__URL_GAS__";
  var LS = window.localStorage, PFX = "DEMO::";
  var tokReal = LS.getItem("despacho.gas.token");
  var fetchReal = window.fetch.bind(window);
  // 1) Almacenamiento aparte para la demostración
  function caja(base){
    return {
      getItem: function(k){ return base.getItem(PFX + k); },
      setItem: function(k, v){ base.setItem(PFX + k, String(v)); },
      removeItem: function(k){ base.removeItem(PFX + k); },
      clear: function(){ var q = []; for (var i = 0; i < base.length; i++) { var k = base.key(i); if (k && k.indexOf(PFX) === 0) q.push(k); } q.forEach(function(k){ base.removeItem(k); }); },
      key: function(i){ var q = []; for (var j = 0; j < base.length; j++) { var k = base.key(j); if (k && k.indexOf(PFX) === 0) q.push(k.slice(PFX.length)); } return q[i] === undefined ? null : q[i]; },
      get length(){ var n = 0; for (var j = 0; j < base.length; j++) { var k = base.key(j); if (k && k.indexOf(PFX) === 0) n++; } return n; }
    };
  }
  try { Object.defineProperty(window, "localStorage", { value: caja(LS), configurable: true }); } catch (e) {}
  try { Object.defineProperty(window, "sessionStorage", { value: caja(window.sessionStorage), configurable: true }); } catch (e) {}
  // 2) Nada sale a los servidores reales desde la demostración
  window.INVENTARIO_API = "https://demo.invalid";
  window.fetch = function(u, o){
    var s = String(u && u.url || u);
    if (/script\.google\.com|workers\.dev|demo\.invalid/.test(s)) return Promise.reject(new Error("Modo demostración: sin conexión con la herramienta real"));
    return fetchReal(u, o);
  };

  // 3) SHA-256 / HMAC síncronos (para las claves del servidor de demostración)
  function utf8(s){ return Array.from(unescape(encodeURIComponent(s)), function(c){ return c.charCodeAt(0); }); }
  function sha256(b){
    var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var m=b.slice(),l=b.length*8;m.push(0x80);while(m.length%64!==56)m.push(0);
    for(var i=7;i>=0;i--)m.push(i>3?0:(l>>>(i*8))&255);
    var w=new Array(64);
    for(var o=0;o<m.length;o+=64){
      for(i=0;i<16;i++)w[i]=(m[o+i*4]<<24)|(m[o+i*4+1]<<16)|(m[o+i*4+2]<<8)|m[o+i*4+3];
      for(i=16;i<64;i++){var s0=((w[i-15]>>>7)|(w[i-15]<<25))^((w[i-15]>>>18)|(w[i-15]<<14))^(w[i-15]>>>3),s1=((w[i-2]>>>17)|(w[i-2]<<15))^((w[i-2]>>>19)|(w[i-2]<<13))^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
      var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for(i=0;i<64;i++){var S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])|0,S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)),mj=(a&bb)^(a&c)^(bb&c),t2=(S0+mj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=bb;bb=a;a=(t1+t2)|0}
      H[0]=(H[0]+a)|0;H[1]=(H[1]+bb)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
    }
    var out=[];H.forEach(function(x){out.push((x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255)});return out;
  }
  function hmac(v,k){ k=k.length>64?sha256(k):k.slice(); while(k.length<64)k.push(0);
    var ip=k.map(function(x){return x^0x36}),op=k.map(function(x){return x^0x5c});
    return sha256(op.concat(sha256(ip.concat(v)))); }
  function bytes(x){ return typeof x === "string" ? utf8(x) : x.map(function(b){ return b & 255; }); }
  function firmado(a){ return a.map(function(b){ return b > 127 ? b - 256 : b; }); }

  // 4) El «servidor» de la demostración: el mismo código del Apps Script, con hojas guardadas aparte
  var GUARDA = PFX + "servidor";
  var D = null; try { D = JSON.parse(LS.getItem(GUARDA) || "null"); } catch (e) { D = null; }
  if (!D) D = { hojas: {}, props: {}, cache: {} };
  var tGuarda = null;
  function guardar(){ clearTimeout(tGuarda); tGuarda = setTimeout(function(){ try { LS.setItem(GUARDA, JSON.stringify(D)); } catch (e) { console.warn("demo: no se pudo guardar", e); } }, 300); }
  function hoja(name){ var rows = D.hojas[name] || (D.hojas[name] = []); return {
    getName: function(){ return name; }, getLastRow: function(){ return rows.length; },
    getLastColumn: function(){ return rows.reduce(function(m, r){ return Math.max(m, r.length); }, 0); },
    getRange: function(r, c, nr, nc){ nr = nr || 1; nc = nc || 1; return {
      getValues: function(){ var o = []; for (var i = 0; i < nr; i++) { var row = rows[r-1+i] || [], x = []; for (var j = 0; j < nc; j++) x.push(row[c-1+j] === undefined || row[c-1+j] === null ? "" : row[c-1+j]); o.push(x); } return o; },
      setValues: function(v){ v.forEach(function(row, i){ var t = rows[r-1+i] || (rows[r-1+i] = []); row.forEach(function(x, j){ t[c-1+j] = x; }); }); return this; },
      setNumberFormat: function(){ return this; }, sort: function(){ return this; },
      getValue: function(){ return this.getValues()[0][0]; }, setValue: function(x){ return this.setValues([[x]]); } }; },
    appendRow: function(r){ rows.push(r.slice()); }, deleteRow: function(i){ rows.splice(i-1, 1); },
    setFrozenRows: function(){}, sort: function(){}, hideSheet: function(){}, setTabColor: function(){} }; }
  var libro = { getSheetByName: function(n){ return D.hojas[n] ? hoja(n) : null; }, insertSheet: function(n){ D.hojas[n] = D.hojas[n] || []; return hoja(n); },
    getId: function(){ return "DEMO"; }, getUrl: function(){ return "#"; }, getName: function(){ return "Despacho y Rutas · DEMOSTRACIÓN"; } };
  function fmtFecha(d, tz, f){ var x = new Date(d.getTime() - 6*3600e3), p = function(n){ return String(n).padStart(2, "0"); };
    return String(f || "yyyy-MM-dd HH:mm:ss").replace("yyyy", x.getUTCFullYear()).replace("MM", p(x.getUTCMonth()+1)).replace("dd", p(x.getUTCDate())).replace("HH", p(x.getUTCHours())).replace("mm", p(x.getUTCMinutes())).replace("ss", p(x.getUTCSeconds())); }
  var ifr = document.createElement("iframe"); ifr.style.display = "none"; ifr.title = "servidor de demostración";
  var W = null;
  function arrancar(){
    if (W) return W;
    (document.body || document.documentElement).appendChild(ifr);
    W = ifr.contentWindow;
    W.Logger = { log: function(){} };
    W.SpreadsheetApp = { getActiveSpreadsheet: function(){ return libro; }, openById: function(){ return libro; } };
    W.CacheService = { getScriptCache: function(){ return {
      get: function(k){ return D.cache[k] === undefined ? null : D.cache[k]; }, put: function(k, v){ D.cache[k] = String(v); },
      remove: function(k){ delete D.cache[k]; }, getAll: function(ks){ var o = {}; ks.forEach(function(k){ if (k in D.cache) o[k] = D.cache[k]; }); return o; },
      putAll: function(o){ for (var k in o) D.cache[k] = String(o[k]); }, removeAll: function(ks){ ks.forEach(function(k){ delete D.cache[k]; }); } }; } };
    W.PropertiesService = { getScriptProperties: function(){ return {
      getProperty: function(k){ return D.props[k] === undefined ? null : D.props[k]; }, setProperty: function(k, v){ D.props[k] = String(v); return this; },
      getProperties: function(){ return Object.assign({}, D.props); }, deleteProperty: function(k){ delete D.props[k]; return this; },
      setProperties: function(o){ for (var k in o) D.props[k] = String(o[k]); return this; } }; } };
    W.LockService = { getScriptLock: function(){ return { waitLock: function(){}, tryLock: function(){ return true; }, releaseLock: function(){}, hasLock: function(){ return true; } }; } };
    W.Utilities = { getUuid: function(){ return crypto.randomUUID(); }, Charset: { UTF_8: "utf8" }, DigestAlgorithm: { SHA_256: "sha256" },
      computeHmacSha256Signature: function(v, k){ return firmado(hmac(bytes(v), bytes(k))); },
      computeDigest: function(a, s){ return firmado(sha256(bytes(s))); },
      base64Encode: function(b){ return btoa(String.fromCharCode.apply(null, bytes(b))); },
      base64EncodeWebSafe: function(b){ return btoa(String.fromCharCode.apply(null, bytes(b))).replace(/\+/g, "-").replace(/\//g, "_"); },
      base64Decode: function(s){ return firmado(Array.from(atob(s), function(c){ return c.charCodeAt(0); })); },
      formatDate: fmtFecha, sleep: function(){}, newBlob: function(){ throw new Error("Las fotos no se guardan en la demostración"); } };
    W.Session = { getScriptTimeZone: function(){ return "America/Costa_Rica"; } };
    W.ContentService = { MimeType: { JSON: "json" }, createTextOutput: function(t){ return { _t: t, setMimeType: function(){ return this; }, getContent: function(){ return this._t; } }; } };
    W.ScriptApp = { getProjectTriggers: function(){ return []; }, newTrigger: function(){ var t = { timeBased: function(){ return t; }, atHour: function(){ return t; }, everyDays: function(){ return t; }, everyHours: function(){ return t; }, everyMinutes: function(){ return t; }, inTimezone: function(){ return t; }, create: function(){} }; return t; }, deleteTrigger: function(){} };
    W.DriveApp = { getFilesByName: function(){ return { hasNext: function(){ return false; } }; }, getFolderById: function(){ throw new Error("demo"); }, createFolder: function(){ throw new Error("Sin respaldos en la demostración"); }, getFileById: function(){ throw new Error("demo"); } };
    W.HtmlService = {}; W.UrlFetchApp = { fetch: function(){ throw new Error("Sin internet en la demostración"); } };
    W.eval(document.getElementById("demo-servidor").textContent);
    return W;
  }
  function llamar(fn, args){
    var w = arrancar();
    var r = JSON.parse(w.doPost({ postData: { contents: JSON.stringify({ fn: fn, args: args || [] }) } }).getContent());
    guardar(); return r;
  }
  // 5) google.script.run apunta al servidor de demostración
  function corredor(ok, mal){
    return new Proxy({}, { get: function(_, k){
      if (k === "withSuccessHandler") return function(f){ return corredor(f, mal); };
      if (k === "withFailureHandler") return function(f){ return corredor(ok, f); };
      if (k === "withUserObject") return function(){ return corredor(ok, mal); };
      if (typeof k !== "string" || k === "then") return undefined;
      return function(){ var args = Array.prototype.slice.call(arguments);
        listo.then(function(){ setTimeout(function(){
          var o; try { o = llamar(k, args); } catch (e) { o = { ok: false, e: String(e && e.message || e) }; }
          if (o && o.ok) { if (ok) ok(o.r); } else if (mal) mal(new Error((o && o.e) || "Error del servidor")); }, 60); }); };
    } });
  }
  window.google = window.google || {};
  window.google.script = { run: corredor(null, null) };

  // 6) Datos de ejemplo (copiados de la herramienta real, solo lectura) y herramientas para guiar la demostración
  var CLAVE_AGENTE = "demo-agente-interakzion-0123456789abcdef";
  function real(fn, args){ return fetchReal(URL_REAL, { method: "POST", body: JSON.stringify({ fn: fn, args: args }), headers: { "Content-Type": "text/plain;charset=utf-8" }, credentials: "omit", redirect: "follow" })
    .then(function(r){ return r.json(); }).then(function(o){ if (!o || !o.ok) throw new Error(o && o.e || "sin datos"); return o.r; }); }
  function hoyC(){ var x = new Date(Date.now() - 6*3600e3); return "" + x.getUTCFullYear() + String(x.getUTCMonth()+1).padStart(2, "0") + String(x.getUTCDate()).padStart(2, "0"); }
  var EST = ["Proformado","Proformado","En Alisto","En Alisto","Chequeo","Listo","Listo","Listo","Listo","Proformado","En Alisto","Listo"];
  async function sembrar(){
    if (D.props.DEMO_LISTA) return;
    var rutas = [{ id: "R1", nombre: "San José" }, { id: "R2", nombre: "Alajuela" }, { id: "R7", nombre: "Cartago" }, { id: "R9", nombre: "Encomiendas, Guanacaste y Limón" }];
    var clientes = [], prof = [];
    try {
      if (!tokReal) throw new Error("sin sesión real");
      var st = await real("apiEstado", [tokReal, null]), ix = await real("apiInteraIndice", [tokReal, null]);
      var rr = st.config && st.config.rutas; rr = rr && (rr.rutas || rr); if (Array.isArray(rr) && rr.length) rutas = rr;
      var porCod = {}; Object.values(st.clientes || {}).forEach(function(c){ if (c.codigo && c.ruta) porCod[String(c.codigo)] = c; });
      var vistos = {}, usadosR = {};
      (ix.p || []).slice().sort(function(a, b){ return String(b.f + b.h).localeCompare(String(a.f + a.h)); }).forEach(function(x){
        var cod = x.d === "P" ? "P" + x.c : String(x.c), c = porCod[cod];
        if (!c || vistos[cod] || prof.length >= 12) return;
        if ((usadosR[c.ruta] || 0) >= 2) return;
        vistos[cod] = 1; usadosR[c.ruta] = (usadosR[c.ruta] || 0) + 1;
        clientes.push({ codigo: cod, nombre: c.nombre, ruta: c.ruta, condicion: c.condicion || "contado", plazo: c.plazo || 0 });
        prof.push({ n: String(x.n), d: x.d, c: String(x.c), nm: c.nombre, f: hoyC(), h: "08:" + String(10 + prof.length * 3).padStart(2, "0") + ":00", cj: 0, fa: "", mo: String(x.mo || Math.round(80000 + Math.random() * 900000)), pl: "", e: EST[prof.length] });
      });
      if (prof.length < 6) throw new Error("pocos datos");
    } catch (e) {
      console.warn("demo: datos inventados (" + e.message + ")");
      clientes = [["P101","Perfumería La Rosa","R1"],["P102","Aromas del Valle","R2"],["2201","Ferretería El Sol","R7"],["2202","Tecno Plus","R1"],["P103","Bella Esencia","R9"],["2203","Distribuidora Pacífico","R9"]]
        .map(function(a){ return { codigo: a[0], nombre: a[1], ruta: a[2], condicion: "contado", plazo: 0 }; });
      prof = clientes.map(function(c, i){ return { n: String(c.codigo[0] === "P" ? 45001 + i : 28501 + i), d: c.codigo[0] === "P" ? "P" : "B", c: c.codigo.replace(/^P/, ""), nm: c.nombre, f: hoyC(), h: "08:" + String(10 + i * 3).padStart(2, "0") + ":00", cj: 0, fa: "", mo: String(150000 + i * 85000), pl: "", e: EST[i + 4] || "Listo" }; });
    }
    var r = llamar("apiPrimerAdmin", [{ nombre: "Luis", usuario: "luis", password: "demo1234", clave: "1000" }]);
    var t = llamar("apiLogin", ["luis", "demo1234"]).r.token;
    var U = function(id, n, u, cl, perm){ return { op: "set", col: "usuarios", id: id, data: { nombre: n, usuario: u, password: "demo1234", clave: cl, permisos: Object.fromEntries(perm.map(function(k){ return [k, true]; })), activo: true } }; };
    var ops = [{ op: "set", col: "config", id: "rutas", data: { rutas: rutas } }];
    clientes.forEach(function(c, i){ ops.push({ op: "set", col: "clientes", id: "dc" + i, data: c }); });
    ops.push(U("d_mar", "Maricela (Ventas Perfumería)", "maricela", "1001", ["aprobarV"]));
    ops.push(U("d_jen", "Jenny (Ventas Bodega)", "jenny", "1002", ["ventasB"]));
    ops.push(U("d_gra", "Graciela (Contabilidad)", "graciela", "1003", ["rutas", "aprobarC", "liquidar", "montos", "reportes"]));
    ops.push(U("d_luc", "Lucía (Alistadora)", "lucia", "1004", ["registrar", "devoluciones"]));
    ops.push(U("d_car", "Carlos (Rutas)", "carlos", "1005", ["registrar", "devoluciones", "rutas", "mover", "cerrar", "entregar", "reportes"]));
    ops.push(U("d_cri", "Cristina (Facturación)", "cristina", "1006", ["facturar"]));
    ops.push(U("d_vic", "Víctor (Chofer)", "victor", "1007", ["cargar"]));
    ops.push(U("d_dix", "Dixon (Jefe de Alisto)", "dixon", "1008", ["alisto"]));
    var w = llamar("apiEscribir", [t, ops, null]);
    if (!w.ok) console.warn("demo: siembra", w);
    llamar("apiInteraSync", [CLAVE_AGENTE, { pc: "DEMO", p: prof }]);
    D.props.DEMO_LISTA = "1"; D.props.DEMO_PROF = JSON.stringify(prof); guardar();
  }
  var listo = sembrar().catch(function(e){ console.error("demo", e); });
  window.DEMO = {
    proformas: function(){ return JSON.parse(D.props.DEMO_PROF || "[]"); },
    /* Cambia en «Interakzion» el estado de una proforma: DEMO.estado("44801","Listo") o DEMO.estado("44801","Facturado","33300") */
    estado: function(n, e, fa){ var p = this.proformas(); p.forEach(function(x){ if (String(x.n) === String(n)) { x.e = e; if (fa) { x.fa = String(fa); x.pl = x.pl || "0"; } } });
      D.props.DEMO_PROF = JSON.stringify(p); return llamar("apiInteraSync", [CLAVE_AGENTE, { pc: "DEMO", p: p }]); },
    nueva: function(x){ var p = this.proformas(); p.push(Object.assign({ f: hoyC(), h: "10:00:00", cj: 0, fa: "", pl: "" }, x)); D.props.DEMO_PROF = JSON.stringify(p); return llamar("apiInteraSync", [CLAVE_AGENTE, { pc: "DEMO", p: p }]); },
    latido: function(){ return llamar("apiInteraSync", [CLAVE_AGENTE, { pc: "DEMO", p: this.proformas() }]); },
    reiniciar: function(){ LS.removeItem(GUARDA); window.localStorage.clear(); location.reload(); }
  };
  setInterval(function(){ if (D.props.DEMO_LISTA) try { window.DEMO.latido(); } catch (e) {} }, 60000);
})();
