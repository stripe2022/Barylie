// movimientos.js - Módulo para registrar y visualizar movimientos de stock (atómico + idempotente)

// ===========================
// UTILIDADES
// ===========================
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uuid = () => (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const fmtFechaLocal = iso => { try { return new Date(iso).toLocaleString(); } catch { return iso || ''; } };

// Mutex multi-pestaña simple para evitar carreras
const STOCK_LOCK_KEY = 'barylie_stock_lock';
async function acquireLock(timeoutMs = 3000, waitStep = 30) {
  const me = uuid();
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!localStorage.getItem(STOCK_LOCK_KEY)) {
      localStorage.setItem(STOCK_LOCK_KEY, me);
      await sleep(8);
      if (localStorage.getItem(STOCK_LOCK_KEY) === me) {
        return () => { if (localStorage.getItem(STOCK_LOCK_KEY) === me) localStorage.removeItem(STOCK_LOCK_KEY); };
      }
    }
    await sleep(waitStep);
  }
  // Si prefieres no lanzar, devuelve un liberador no-op:
  // return () => {};
  throw new Error('No se pudo adquirir lock de stock');
}

// Precarga mapa codigo->nombre (para render rápidos)
function precargarMapaProductos() {
  return new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const req = store.getAll();
    req.onsuccess = () => {
      const map = new Map();
      for (const p of req.result || []) map.set(p.codigo, p.nombre || '');
      resolve(map);
    };
    req.onerror = () => resolve(new Map());
  });
}

// ===========================
// MOTOR ATÓMICO DE MOVIMIENTOS
// ===========================
/**
 * Aplica un movimiento de stock de forma atómica e idempotente.
 * - Escribe producto+movimiento en **la misma transacción**.
 * - Usa `movUid` único para no duplicar el movimiento si se reintenta.
 * - Respeta stock >= 0 por defecto (cambia `permitirNegativo` si lo necesitas).
 */
async function aplicarMovimientoStock({ codigo, tipo, cantidad, motivo = '', usuario = 'admin', permitirNegativo = false, movUid = null }) {
  if (!codigo) throw new Error('Código requerido');
  cantidad = parseInt(cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('Cantidad inválida');
  if (tipo !== 'entrada' && tipo !== 'salida') throw new Error('Tipo inválido');

  const release = await acquireLock().catch(() => null); // si no quieres bloquear duro, usa catch y sigue
  try {
    const tx = db.transaction(['productos', 'movimientos'], 'readwrite');
    const productos = tx.objectStore('productos');
    const movimientos = tx.objectStore('movimientos');

    // 1) Idempotencia: si ya existe movUid no repetir
    movUid = movUid || uuid();
    let existe = false;
    try {
      // si existe índice movUid úsalo
      const idx = movimientos.index('movUid');
      const reqCheck = idx.get(movUid);
      existe = await new Promise(res => { reqCheck.onsuccess = () => res(!!reqCheck.result); reqCheck.onerror = () => res(false); });
    } catch {
      // si no existe índice, no podemos verificar rápido → seguimos (sin idempotencia fuerte)
      existe = false;
    }
    if (existe) return { ok: true, idempotente: true, movUid };

    // 2) Leer producto
    const getP = productos.get(codigo);
    const producto = await new Promise((res, rej) => { getP.onsuccess = () => res(getP.result); getP.onerror = () => rej(new Error('No se pudo leer producto')); });
    if (!producto) throw new Error('Producto no encontrado');

    // 3) Calcular nuevo stock
    const delta = (tipo === 'entrada') ? +cantidad : -cantidad;
    const stockActual = parseInt(producto.stock) || 0;
    const nuevoStock = stockActual + delta;

    if (!permitirNegativo && nuevoStock < 0) {
      throw new Error(`Stock insuficiente (actual: ${stockActual}).`);
    }

    // 4) Actualizar producto
    producto.stock = nuevoStock;
    productos.put(producto);

    // 5) Registrar movimiento con movUid
    const movimiento = {
      movUid,
      tipo,
      codigo,
      cantidad,
      fecha: new Date().toISOString(),
      motivo,
      usuario
    };
    movimientos.add(movimiento);

    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

    return { ok: true, movUid, stock: nuevoStock };
  } finally {
    if (release) release();
  }
}

// ===========================
// PANTALLA "MOVIMIENTOS"
// ===========================
function mostrarPantallaMovimientos() {
  mostrarPantalla('movimiento');
  cargarSelectorDeProductos();
  document.getElementById('formMovimiento').reset();
  document.getElementById('stockActual').textContent = '--';
  const prev = document.getElementById('previewMovimiento');
  if (prev) {
    if (prev.dataset.objurl) { URL.revokeObjectURL(prev.dataset.objurl); delete prev.dataset.objurl; }
    prev.removeAttribute('src');
  }
  document.getElementById('buscarProductoMovimiento').value = '';
  // Si tienes este contador global:
  if (typeof mostrarTotalProductos === 'function') mostrarTotalProductos();
}

function cargarSelectorDeProductos() {
  const select = document.getElementById('productoMovimiento');
  const buscador = document.getElementById('buscarProductoMovimiento');
  select.innerHTML = '';

  const blanco = document.createElement('option');
  blanco.value = '';
  blanco.textContent = '-- Selecciona un producto --';
  select.appendChild(blanco);

  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();

  req.onsuccess = () => {
    const productos = req.result || [];

    renderizarOpcionesSelector(productos, select, buscador);

    // Filtro incremental (si no se “enganchó” ya adentro de renderizarOpcionesSelector)
    if (buscador && !buscador._hooked) {
      buscador._hooked = true;
      buscador.addEventListener('input', () => {
        const query = buscador.value.toLowerCase();
        const filtrados = productos.filter(p =>
          (p.codigo || '').toLowerCase().includes(query) ||
          (p.nombre || '').toLowerCase().includes(query) ||
          (p.referencia || '').toLowerCase().includes(query)
        );
        renderizarOpcionesSelector(filtrados, select);
      });
    }

    select.onchange = mostrarDatosProducto;
  };
}

function mostrarDatosProducto() {
  const codigo = document.getElementById('productoMovimiento').value;
  const stockEl = document.getElementById('stockActual');
  const preview = document.getElementById('previewMovimiento');

  if (!codigo) {
    stockEl.textContent = '--';
    if (preview) {
      if (preview.dataset.objurl) { URL.revokeObjectURL(preview.dataset.objurl); delete preview.dataset.objurl; }
      preview.removeAttribute('src');
    }
    window.productoSeleccionado = null;
    return;
  }

  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.get(codigo);

  req.onsuccess = () => {
    const prod = req.result;
    if (!prod) return;
    stockEl.textContent = prod.stock ?? 0;

    if (preview) {
      if (preview.dataset.objurl) { URL.revokeObjectURL(preview.dataset.objurl); delete preview.dataset.objurl; }
      if (prod.fotoProducto instanceof ArrayBuffer || ArrayBuffer.isView(prod.fotoProducto)) {
        const ab = prod.fotoProducto instanceof ArrayBuffer ? prod.fotoProducto : prod.fotoProducto.buffer;
        const blob = new Blob([new Uint8Array(ab)], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        preview.src = url;
        preview.dataset.objurl = url;
      } else if (typeof prod.fotoProducto === 'string') {
        preview.src = prod.fotoProducto; // dataURL o URL
      } else {
        preview.removeAttribute('src');
      }
    }

    window.productoSeleccionado = prod; // para el botón “ver info”
  };
}

// Modal de info del producto seleccionado
function verInfoProductoSeleccionado() {
  const prod = window.productoSeleccionado;
  if (!prod) return alert('No hay producto seleccionado');
  verInfoProducto(prod);
}

function verInfoProducto(prod) {
  const icono = (etq) => ({
    'código': '🔢', 'referencia': '📄', 'proveedor': '🏭', 'categoría': '🏷️', 'zona': '📍',
    'descripción': '📝', 'stock': '📦', 'precioOriginal': '💵', 'tasa': '💱', 'precioCosto': '💰', 'precioVenta': '💸'
  }[etq.toLowerCase()] || '');

  let html = `
    <h3 style="margin-bottom:10px;font-size:1.4em;color:#333;">${prod.nombre}</h3>
    <p><strong>${icono('código')} Código:</strong> ${prod.codigo}</p>
    <p><strong>${icono('referencia')} Referencia:</strong> ${prod.referencia || ''}</p>
    <p><strong>${icono('proveedor')} Proveedor:</strong> ${prod.proveedor || ''}</p>
    <p><strong>${icono('categoría')} Categoría:</strong> ${prod.categoria || ''}</p>
    <p><strong>${icono('zona')} Zona:</strong> ${prod.zona || ''}</p>
    <p><strong>${icono('descripción')} Descripción:</strong> ${prod.descripcion || ''}</p>
    <p><strong>${icono('stock')} Stock:</strong> ${prod.stock ?? 0}</p>
    <p><strong>${icono('precioOriginal')} Precio Original:</strong> ${prod.precioOriginal ?? 0}</p>
    <p><strong>${icono('tasa')} Tasa:</strong> ${prod.tasa ?? 0}</p>
    <p><strong>${icono('precioCosto')} Precio Costo:</strong> ${prod.precioCosto ?? 0}</p>
    <p><strong>${icono('precioVenta')} Precio Venta:</strong> ${prod.precioVenta ?? 0}</p>
  `;

  let urlTemp = null;
  if (prod.fotoProducto) {
    if (prod.fotoProducto instanceof ArrayBuffer || ArrayBuffer.isView(prod.fotoProducto)) {
      const ab = prod.fotoProducto instanceof ArrayBuffer ? prod.fotoProducto : prod.fotoProducto.buffer;
      const blob = new Blob([new Uint8Array(ab)], { type: 'image/jpeg' });
      urlTemp = URL.createObjectURL(blob);
      html += `<img src="${urlTemp}" alt="Foto del producto" style="max-width:100%;border-radius:8px;margin-top:10px;">`;
    } else if (typeof prod.fotoProducto === 'string') {
      html += `<img src="${prod.fotoProducto}" alt="Foto del producto" style="max-width:100%;border-radius:8px;margin-top:10px;">`;
    }
  }

  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(0,0,0,0.7)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '9999';

  const content = document.createElement('div');
  content.style.background = '#fff';
  content.style.padding = '20px';
  content.style.maxWidth = '90vw';
  content.style.maxHeight = '90vh';
  content.style.overflowY = 'auto';
  content.style.borderRadius = '12px';
  content.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
  content.style.fontSize = '1em';
  content.innerHTML = html + '<br><button class="cancelar" style="margin-top:15px;" onclick="this.parentNode.parentNode.remove()">✖️ Cerrar</button>';

  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.addEventListener('remove', () => {
    if (urlTemp) URL.revokeObjectURL(urlTemp);
  }, { once: true });
}

// ===========================
// REGISTRO DESDE FORMULARIO
// ===========================
async function registrarMovimientoDesdeFormulario(e) {
  e.preventDefault();

  const codigo = document.getElementById('productoMovimiento').value;
  const tipo = document.getElementById('tipoMovimiento').value; // 'entrada' | 'salida'
  const cantidad = parseInt(document.getElementById('cantidadMovimiento').value);
  const nota = document.getElementById('notaMovimiento').value.trim();
  const usuario = JSON.parse(localStorage.getItem('usuarioActivo'))?.nombre || 'Desconocido';

  if (!codigo || !Number.isFinite(cantidad) || cantidad <= 0) {
    mostrarPopupMovimiento('❌ Ingresa una cantidad válida.', 'error');
    return;
  }

  try {
    const r = await aplicarMovimientoStock({ codigo, tipo, cantidad, motivo: nota, usuario });
    mostrarPopupMovimiento(`✅ ${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada. 📦 Stock: ${r.stock}`, 'exito');

    // Reset UI
    document.getElementById('formMovimiento').reset();
    document.getElementById('stockActual').textContent = '--';
    const prev = document.getElementById('previewMovimiento');
    if (prev) {
      if (prev.dataset.objurl) { URL.revokeObjectURL(prev.dataset.objurl); delete prev.dataset.objurl; }
      prev.removeAttribute('src');
    }
    document.getElementById('productoMovimiento').selectedIndex = 0;
    window.productoSeleccionado = null;
  } catch (err) {
    mostrarPopupMovimiento(`❌ ${err.message || 'Error al registrar el movimiento'}`, 'error');
  }
}

// ===========================
// HISTORIAL + FILTROS
// ===========================
function mostrarPantallaHistorialConFiltro() {
  mostrarPantalla('historialFiltrado');
  document.getElementById('filtroTipo').value = '';
  document.getElementById('filtroFecha').value = '';
  const fn = document.getElementById('filtroNombre'); if (fn) fn.value = '';
  document.getElementById('resultadosFiltrados').innerHTML = '';
  cargarHistorialFiltrado();
}

async function cargarHistorialFiltrado() {
  const contenedor = document.getElementById('resultadosFiltrados');
  contenedor.innerHTML = '';

  const tx = db.transaction(['movimientos', 'productos'], 'readonly');
  const movStore = tx.objectStore('movimientos');
  const prodStore = tx.objectStore('productos');

  const [movs, prods] = await Promise.all([
    new Promise(res => { const r = movStore.getAll(); r.onsuccess = () => res(r.result || []); }),
    new Promise(res => { const r = prodStore.getAll(); r.onsuccess = () => res(r.result || []); })
  ]);

  const mapa = new Map(prods.map(p => [p.codigo, p.nombre || '']));

  // Orden descendente por fecha ISO
  movs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const frag = document.createDocumentFragment();
  for (const mov of movs) {
    const nombre = mapa.get(mov.codigo) || mov.codigo;
    const tipo = (mov.tipo || '').toUpperCase();
    const mostrarCantidad = ['entrada', 'salida', 'registro'].includes(mov.tipo);

    const div = document.createElement('div');
    div.className = 'movimiento';
    div.innerHTML = `
      <p><strong>${tipo}</strong> - ${fmtFechaLocal(mov.fecha)}</p>
      <p>Producto: ${nombre} <small>(${mov.codigo})</small></p>
      ${mostrarCantidad ? `<p>Cantidad: ${mov.cantidad}</p>` : ''}
      <p>Usuario: ${mov.usuario || 'desconocido'}</p>
      <p>Nota: ${mov.nota || mov.motivo || ''}</p>
      <hr>
    `;
    frag.appendChild(div);
  }
  contenedor.appendChild(frag);
}

async function aplicarFiltroHistorial() {
  const tipo = document.getElementById('filtroTipo').value;        // '' | 'entrada' | 'salida' | ...
  const fechaHTML = document.getElementById('filtroFecha').value;  // 'YYYY-MM-DD'
  const filtroNombre = (document.getElementById('filtroNombre')?.value || '').trim().toLowerCase();
  const contenedor = document.getElementById('resultadosFiltrados');
  contenedor.innerHTML = '';

  const tx = db.transaction(['movimientos', 'productos'], 'readonly');
  const movStore = tx.objectStore('movimientos');
  const prodStore = tx.objectStore('productos');

  const [movs, prods] = await Promise.all([
    new Promise(res => { const r = movStore.getAll(); r.onsuccess = () => res(r.result || []); }),
    new Promise(res => { const r = prodStore.getAll(); r.onsuccess = () => res(r.result || []); })
  ]);

  const mapa = new Map(prods.map(p => [p.codigo, p.nombre || '']));

  let resultados = movs;

  if (tipo) resultados = resultados.filter(m => m.tipo === tipo);

  if (fechaHTML) {
    const ini = new Date(fechaHTML); ini.setHours(0,0,0,0);
    const fin = new Date(fechaHTML); fin.setHours(23,59,59,999);
    resultados = resultados.filter(m => {
      if (!m.fecha) return false;
      const d = new Date(m.fecha);
      return d >= ini && d <= fin;
    });
  }

  // más recientes primero
  resultados.sort((a,b) => (b.fecha || '').localeCompare(a.fecha || ''));

  let hallados = 0;
  const frag = document.createDocumentFragment();

  for (const mov of resultados) {
    const nombre = mapa.get(mov.codigo) || '';
    if (filtroNombre && !nombre.toLowerCase().includes(filtroNombre)) continue;

    const tipoUp = (mov.tipo || '').toUpperCase();
    const mostrarCantidad = ['entrada', 'salida', 'registro'].includes(mov.tipo);

    const div = document.createElement('div');
    div.className = 'movimiento';
    div.innerHTML = `
      <p><strong>${tipoUp}</strong> - ${fmtFechaLocal(mov.fecha)}</p>
      <p>Producto: ${nombre || mov.codigo} <small>(${mov.codigo})</small></p>
      ${mostrarCantidad ? `<p>Cantidad: ${mov.cantidad}</p>` : ''}
      <p>Usuario: ${mov.usuario || 'desconocido'}</p>
      <p>Nota: ${mov.nota || mov.motivo || ''}</p>
      <hr>
    `;
    frag.appendChild(div);
    hallados++;
  }

  if (hallados === 0) {
    contenedor.innerHTML = '<p>No se encontraron movimientos con los criterios seleccionados.</p>';
  } else {
    contenedor.appendChild(frag);
  }
}

// ===========================
// SELECTOR DE BÚSQUEDA AUXILIAR (si lo usas en otra pantalla)
// ===========================
function productoDesdeBusquedaSeleccionado() {
  const select = document.getElementById('selectorBusqueda');
  const id = select.value;
  if (!id) return;

  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.get(id);

  req.onsuccess = () => {
    const producto = req.result;
    if (producto) {
      window.productoSeleccionado = producto;
      // verInfoProductoSeleccionado(); // opcional
    }
  };
}

function cargarSelectorBusqueda() {
  const select = document.getElementById('selectorBusqueda');
  if (!select) return;
  select.innerHTML = '';

  const blanco = document.createElement('option');
  blanco.value = '';
  blanco.textContent = '-- Selecciona un producto --';
  select.appendChild(blanco);

  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();

  req.onsuccess = () => {
    const productos = req.result || [];
    renderizarOpcionesSelector(productos, select);
  };
}

// Reutiliza tu función global si ya existe; si no, esta es segura:
function renderizarOpcionesSelector(productos, selectElement, buscador = null) {
  if (!selectElement) return;
  const primera = selectElement.firstElementChild?.cloneNode(true);
  selectElement.innerHTML = '';
  if (primera) selectElement.appendChild(primera);

  for (const prod of productos) {
    const opt = document.createElement('option');
    opt.value = prod.codigo;
    opt.textContent = `${prod.codigo} - ${prod.nombre}`;
    selectElement.appendChild(opt);
  }

  if (buscador && !buscador._hooked) {
    buscador._hooked = true;
    buscador.addEventListener('input', () => {
      const texto = buscador.value.toLowerCase();
      Array.from(selectElement.options).forEach((opt, idx) => {
        if (idx === 0) return; // deja visible el blanco
        opt.hidden = !opt.textContent.toLowerCase().includes(texto);
      });
    });
  }
}
