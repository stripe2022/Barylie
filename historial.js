// historial.js — Historial de movimientos (compatible con app.js v3)

// ===========================
// ADAPTERS / UTILIDADES
// ===========================

// Adapter para compatibilidad con app.js (showScreen/mostrarPantalla)
window.mostrarPantalla = window.mostrarPantalla || function(id) {
  if (typeof showScreen === 'function') return showScreen(id);
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(id + 'Screen')?.classList.remove('hidden');
};

//function fmtFechaLocal(iso) {
//  try { return new Date(iso).toLocaleString(); } catch { return iso || ''; }
//}

// ===========================
// PANTALLA HISTORIAL
// ===========================
function mostrarPantallaHistorialConFiltro() {
  // Muestra pantalla
  mostrarPantalla('historialFiltrado');

  // Resetea filtros
  const tipoEl = document.getElementById('filtroTipo');
  const fechaEl = document.getElementById('filtroFecha');
  const nombreEl = document.getElementById('filtroNombre');
  const contenedor = document.getElementById('resultadosFiltrados');

  if (tipoEl) tipoEl.value = '';
  if (fechaEl) fechaEl.value = '';
  if (nombreEl) nombreEl.value = '';
  if (contenedor) contenedor.innerHTML = '';

  // Carga inicial
  cargarHistorialFiltrado();
}

// Carga todo el historial, ordenado más reciente → más antiguo
async function cargarHistorialFiltrado() {
  const contenedor = document.getElementById('resultadosFiltrados');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const tx = db.transaction(['movimientos', 'productos'], 'readonly');
  const movStore = tx.objectStore('movimientos');
  const prodStore = tx.objectStore('productos');

  const [movs, prods] = await Promise.all([
    new Promise(res => {
      const r = movStore.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    }),
    new Promise(res => {
      const r = prodStore.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    })
  ]);

  const nombreMap = new Map(prods.map(p => [p.codigo, p.nombre || '']));

  // Ordenar descendente por fecha ISO (ISO ordena bien alfanuméricamente)
  movs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  if (movs.length === 0) {
    contenedor.innerHTML = '<p>No hay movimientos registrados todavía.</p>';
    return;
  }

  const frag = document.createDocumentFragment();

  for (const mov of movs) {
    const tipo = (mov.tipo || '').toUpperCase();
    const fecha = fmtFechaLocal(mov.fecha);
    const usuario = mov.usuario || 'desconocido';
    const nota = mov.nota || mov.motivo || '';
    const nombre = nombreMap.get(mov.codigo) || mov.codigo;
    const mostrarCantidad = ['entrada', 'salida', 'registro'].includes(mov.tipo);

    const div = document.createElement('div');
    div.className = 'movimiento';
    div.innerHTML = `
      <p><strong>${tipo}</strong> - ${fecha}</p>
      <p>Producto: ${nombre} <small>(${mov.codigo})</small></p>
      ${mostrarCantidad ? `<p>Cantidad: ${mov.cantidad}</p>` : ''}
      <p>Usuario: ${usuario}</p>
      <p>Nota: ${nota}</p>
      <hr>
    `;
    frag.appendChild(div);
  }

  contenedor.appendChild(frag);
}

// Aplica filtros: tipo, día (YYYY-MM-DD) y nombre de producto (contiene)
async function aplicarFiltroHistorial() {
  const tipoSel = (document.getElementById('filtroTipo')?.value || '').toLowerCase(); // '', 'entrada', ...
  const fechaHTML = document.getElementById('filtroFecha')?.value || '';              // 'YYYY-MM-DD'
  const filtroNombre = (document.getElementById('filtroNombre')?.value || '').trim().toLowerCase();
  const contenedor = document.getElementById('resultadosFiltrados');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const tx = db.transaction(['movimientos', 'productos'], 'readonly');
  const movStore = tx.objectStore('movimientos');
  const prodStore = tx.objectStore('productos');

  const [movs, prods] = await Promise.all([
    new Promise(res => { const r = movStore.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }),
    new Promise(res => { const r = prodStore.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); })
  ]);

  const nombreMap = new Map(prods.map(p => [p.codigo, p.nombre || '']));

  // Normaliza fecha a string y tipo a minúsculas
  const norm = m => ({
    ...m,
    fecha: (m.fecha instanceof Date) ? m.fecha.toISOString() : (m.fecha ? String(m.fecha) : ''),
    _tipo: (m.tipo || '').toLowerCase()
  });

  let resultados = movs.map(norm);

  // 1) Tipo (case-insensitive)
  if (tipoSel) resultados = resultados.filter(m => m._tipo === tipoSel);

  // 2) Fecha exacta por string (evita problemas de zona horaria)
  if (fechaHTML) resultados = resultados.filter(m => (m.fecha || '').slice(0, 10) === fechaHTML);

  // 3) Nombre contiene (si no hay nombre, usa código)
  if (filtroNombre) {
    resultados = resultados.filter(m => {
      const nom = (nombreMap.get(m.codigo) || m.codigo || '').toLowerCase();
      return nom.includes(filtroNombre);
    });
  }

  // Orden: más recientes primero
  resultados.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  if (resultados.length === 0) {
    contenedor.innerHTML = '<p>No se encontraron movimientos con los criterios seleccionados.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const mov of resultados) {
    const tipoUp = (mov._tipo || '').toUpperCase();
    const fechaBonita = fmtFechaLocal(mov.fecha); // usa la global definida en movimientos.js
    const usuario = mov.usuario || 'desconocido';
    const nota = mov.nota || mov.motivo || '';
    const nombre = nombreMap.get(mov.codigo) || mov.codigo;
    const mostrarCantidad = ['entrada','salida','registro'].includes(mov._tipo);

    const div = document.createElement('div');
    div.className = 'movimiento';
    div.innerHTML = `
      <p><strong>${tipoUp}</strong> - ${fechaBonita}</p>
      <p>Producto: ${nombre} <small>(${mov.codigo})</small></p>
      ${mostrarCantidad ? `<p>Cantidad: ${mov.cantidad}</p>` : ''}
      <p>Usuario: ${usuario}</p>
      <p>Nota: ${nota}</p>
      <hr>
    `;
    frag.appendChild(div);
  }

  contenedor.appendChild(frag);
}
