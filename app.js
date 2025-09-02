// app.js - Lógica principal para Inventario Almacén PWA con IndexedDB y compresión de imágenes

// ===========================
// VARIABLES GLOBALES
// ===========================
let db;
let categorias = [];

const $ = id => document.getElementById(id);

// ===========================
// INICIALIZACIÓN
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  abrirDB();
  $('productForm')?.addEventListener('submit', guardarProducto);

  // Listeners para cálculo automático de precioCosto, precioVenta y stock
  $('precioOriginal')?.addEventListener('input', calcularPrecioCosto);
  $('tasa')?.addEventListener('input', calcularPrecioCosto);
  $('precioCosto')?.addEventListener('input', calcularPrecioVenta);
  $('cantidad')?.addEventListener('input', calcularStock);
  $('cajas')?.addEventListener('input', calcularStock);
  
  // ✅ Registrar Service Worker y mostrar alerta cuando esté listo offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('✅ Service Worker registrado'))
      .catch(err => console.error('❌ Error al registrar SW:', err));

    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.tipo === 'offline-listo') {
        mostrarBanner('✅ App lista para funcionar sin conexión', '#4caf50');
      }
      if (event.data?.tipo === 'offline-error') {
        mostrarBanner('❌ Error al cachear archivos: ' + event.data.mensaje, '#f44336');
      }
    });
  }
});

// ✅ Muestra un banner informativo en la parte inferior
function mostrarBanner(texto, bgColor = '#333') {
  const banner = document.createElement('div');
  banner.textContent = texto;
  banner.style.position = 'fixed';
  banner.style.bottom = '20px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.backgroundColor = bgColor;
  banner.style.color = '#fff';
  banner.style.padding = '12px 24px';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  banner.style.zIndex = '9999';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
}

// ===========================
// INDEXEDDB
// ===========================
function abrirDB() {
  const request = indexedDB.open('inventarioDB', 3);

  request.onupgradeneeded = function (e) {
    const db = e.target.result;

    // productos
    let productos;
    if (!db.objectStoreNames.contains('productos')) {
      productos = db.createObjectStore('productos', { keyPath: 'codigo' });
      productos.createIndex('nombre', 'nombre', { unique: false });
    } else {
      productos = request.transaction.objectStore('productos');
      if (!productos.indexNames.contains('nombre')) {
        productos.createIndex('nombre', 'nombre', { unique: false });
      }
    }

    // categorias
    if (!db.objectStoreNames.contains('categorias')) {
      db.createObjectStore('categorias', { keyPath: 'nombre' });
    }

    // movimientos
    let movimientos;
    if (!db.objectStoreNames.contains('movimientos')) {
      movimientos = db.createObjectStore('movimientos', { keyPath: 'id', autoIncrement: true });
    } else {
      movimientos = request.transaction.objectStore('movimientos');
    }

    // Índices nuevos
    if (!movimientos.indexNames.contains('movUid')) movimientos.createIndex('movUid', 'movUid', { unique: true });
    if (!movimientos.indexNames.contains('porCodigo')) movimientos.createIndex('porCodigo', 'codigo', { unique: false });
    if (!movimientos.indexNames.contains('porFecha')) movimientos.createIndex('porFecha', 'fecha', { unique: false });

    // 🔧 BACKFILL v3: añade movUid a movimientos antiguos (los que no tengan)
    // OJO: esto corre solo durante la actualización de versión.
    movimientos.openCursor().onsuccess = ev => {
      const cur = ev.target.result;
      if (!cur) return;
      const mov = cur.value;
      if (!mov.movUid) {
        const base = `${mov.id ?? ''}|${mov.codigo ?? ''}|${mov.tipo ?? ''}|${mov.cantidad ?? ''}|${mov.fecha ?? ''}`;
        const movUid = 'm_' + base64Of(base); // pseudo-hash corto sin unescape
        mov.movUid = movUid;
        cur.update(mov);
      }
      cur.continue();
    };
  };

  request.onsuccess = function (e) {
    db = e.target.result;
    db.onversionchange = () => { try { db.close(); } catch {} alert('BD actualizada en otra pestaña. Recarga.'); };
    cargarCategorias();
    mostrarTotalProductos();
  };

  request.onerror = function () {
    console.error('Error al abrir la base de datos');
  };
}
// --- NAV / PANTALLAS UNIFICADO ---
window.mostrarPantalla = function(id, ocultarNav = true) {
  // Oculta todas las pantallas
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  // Muestra la solicitada
  document.getElementById(id + 'Screen')?.classList.remove('hidden');
  // Oculta/Muestra nav coherentemente
  const nav = document.getElementById('nav');
  if (nav) ocultarNav ? nav.classList.add('hidden') : nav.classList.remove('hidden');
};

// Regresa al menú principal (siempre)
window.volverAlMenu = function() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  document.getElementById('nav')?.classList.remove('hidden');
};

// ===========================
// NAVEGACIÓN / PANTALLAS
// ===========================
function activarPantallaAdd() {
  ocultarTodasLasPantallas();
  resetForm();
  $('addScreen')?.classList.remove('hidden');
}

function activarPantallaSearch() {
  ocultarTodasLasPantallas();
  $('searchScreen')?.classList.remove('hidden');
  $('buscarInput').value = '';
  $('resultados').innerHTML = '';
  cargarSelectorBusqueda?.(); 
  mostrarTotalProductos(); 
}

function activarPantallaStock() {
  ocultarTodasLasPantallas();
  $('stockScreen')?.classList.remove('hidden');
  $('buscarStock').value = '';
  $('stockResultado').innerHTML = '';
  mostrarTotalProductos(); 
}

function ocultarTodasLasPantallas() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav')?.classList.add('hidden'); // Oculta los botones del menú
}

function showScreen(pantallaId) {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $(pantallaId + 'Screen')?.classList.remove('hidden');
}

// ===========================
// GUARDAR / EDITAR PRODUCTO (maneja cambio de código)
// ===========================
function guardarProducto(e) {
  e.preventDefault();

  const ahoraISO = new Date().toISOString();

  Promise.all([capturarFoto(1), capturarFoto(2)]).then(async ([fotoProducto, fotoEmbalaje]) => {
    const nInt = v => { const x = parseInt(v); return Number.isFinite(x) ? x : 0; };
    const nF   = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

    const nuevo = {
      codigo: $('codigo').value.trim(),
      referencia: $('referencia').value.trim(),
      nombre: $('nombre').value.trim(),
      proveedor: $('proveedor').value.trim(),
      categoria: $('categoria').value,
      zona: $('zona').value.trim(),
      descripcion: $('descripcion').value.trim(),
      cantidad: nInt($('cantidad').value),
      cajas: nInt($('cajas').value),
      precioOriginal: nF($('precioOriginal').value),
      tasa: nF($('tasa').value),
      precioCosto: nF($('precioCosto').value),
      precioVenta: nF($('precioVenta').value),
      stock: nInt($('stock').value),
      fotoProducto,
      fotoEmbalaje
    };

    const codigoOriginal = $('productIndex').value || ''; // si hay valor, estamos editando
    const esEdicion = !!codigoOriginal;

    // Alta nueva (sin código original)
    if (!esEdicion) {
      const tx = db.transaction(['productos','movimientos'],'readwrite');
      const prodStore = tx.objectStore('productos');
      const movStore  = tx.objectStore('movimientos');

      prodStore.put(nuevo);

      // movimiento de registro (idempotente)
      const movUidReg = `reg_${nuevo.codigo}_${nuevo.stock}_${ahoraISO}`;
      movStore.add({
        movUid: movUidReg,
        tipo: 'registro',
        codigo: nuevo.codigo,
        cantidad: nuevo.stock || 0,
        fecha: ahoraISO,
        motivo: 'Registro de nuevo producto',
        usuario: 'admin'
      });

      tx.oncomplete = () => {
        alert('Producto guardado con éxito');
        resetForm();
        mostrarTotalProductos();
        $('addScreen')?.classList.add('hidden');
        $('nav')?.classList.remove('hidden');
        $('productIndex').value = '';
      };
      tx.onerror = () => alert('Error al guardar el producto');
      return;
    }

    // EDICIÓN (posible cambio de código)
    const tx = db.transaction(['productos','movimientos'],'readwrite');
    const prodStore = tx.objectStore('productos');
    const movStore  = tx.objectStore('movimientos');

    // Cargamos producto original y (si existe) producto con el código nuevo
    const getOrig = prodStore.get(codigoOriginal);
    const getNuevoClave = (codigoOriginal !== nuevo.codigo) ? prodStore.get(nuevo.codigo) : null;

    getOrig.onsuccess = async () => {
      const original = getOrig.result || null;

      if (!original) {
        // Si no existe el original, tratamos como alta bajo el nuevo código
        prodStore.put(nuevo);
        const movUidReg2 = `reg_${nuevo.codigo}_${nuevo.stock}_${ahoraISO}`;
        movStore.add({ movUid: movUidReg2, tipo:'registro', codigo:nuevo.codigo, cantidad:nuevo.stock||0, fecha:ahoraISO, motivo:'Registro (original no encontrado en edición)', usuario:'admin' });
        return;
      }

      // Si el código NO cambia → actualizar + movimientos de ajuste/edición
      if (codigoOriginal === nuevo.codigo) {
        const cambios = [];
        if (original.precioCosto !== nuevo.precioCosto) cambios.push(`Costo: ${original.precioCosto} → ${nuevo.precioCosto}`);
        if (original.precioVenta !== nuevo.precioVenta) cambios.push(`Venta: ${original.precioVenta} → ${nuevo.precioVenta}`);
        if (original.stock !== nuevo.stock)           cambios.push(`Stock: ${original.stock} → ${nuevo.stock}`);

        // Actualiza producto
        prodStore.put(nuevo);

        // Si cambió el stock, crea movimiento de ajuste (entrada/salida)
        const delta = (nuevo.stock|0) - (original.stock|0);
        if (delta !== 0) {
          const tipo = delta > 0 ? 'entrada' : 'salida';
          const cantidad = Math.abs(delta);
          const movUidAjuste = `aj_${nuevo.codigo}_${cantidad}_${tipo}_${ahoraISO}`;
          movStore.add({
            movUid: movUidAjuste,
            tipo,
            codigo: nuevo.codigo,
            cantidad,
            fecha: ahoraISO,
            motivo: 'Ajuste de stock por edición',
            usuario: 'admin'
          });
        }

        // Log de edición
        const nota = (cambios.length > 0) ? 'Cambios: ' + cambios.join(', ') : 'Edición sin cambios relevantes';
        const movUidEdit = `ed_${nuevo.codigo}_${ahoraISO}`;
        movStore.add({
          movUid: movUidEdit,
          tipo: 'edicion',
          codigo: nuevo.codigo,
          cantidad: 0,
          fecha: ahoraISO,
          motivo: nota,
          usuario: 'admin'
        });

        return;
      }

      // Aquí: el código CAMBIA (renombrado de clave primaria)
      // 1) Verifica que el nuevo código no exista (para no pisar)
      if (getNuevoClave) {
        await new Promise(res => { getNuevoClave.onsuccess = () => res(); getNuevoClave.onerror = () => res(); });
        if (getNuevoClave.result) {
          tx.abort();
          alert(`❌ Ya existe un producto con código "${nuevo.codigo}". Cambia el código o elimina ese producto.`);
          return;
        }
      }

      // 2) Mueve el registro: put bajo nuevo código y delete viejo
      prodStore.put(nuevo);
      prodStore.delete(codigoOriginal);

      // 3) Migra los movimientos del código viejo → nuevo
      let usarIndex = false;
      try { movStore.index('porCodigo'); usarIndex = true; } catch {}
      if (usarIndex) {
        const idx = movStore.index('porCodigo');
        const range = IDBKeyRange.only(codigoOriginal);
        const req = idx.openCursor(range);
        req.onsuccess = function(ev) {
          const cur = ev.target.result;
          if (!cur) return;
          const mov = cur.value;
          mov.codigo = nuevo.codigo; // reetiquetar al nuevo código
          cur.update(mov);
          cur.continue();
        };
      } else {
        // fallback: recorrer todos y actualizar los que coincidan
        movStore.openCursor().onsuccess = function(ev) {
          const cur = ev.target.result;
          if (!cur) return;
          const mov = cur.value;
          if (mov.codigo === codigoOriginal) {
            mov.codigo = nuevo.codigo;
            cur.update(mov);
          }
          cur.continue();
        };
      }

      // 4) Movimiento informativo de renombrado (cantidad 0)
      const movUidRen = `ren_${codigoOriginal}_to_${nuevo.codigo}_${ahoraISO}`;
      movStore.add({
        movUid: movUidRen,
        tipo: 'edicion',
        codigo: nuevo.codigo,
        cantidad: 0,
        fecha: ahoraISO,
        motivo: `Renombrado de código (${codigoOriginal} → ${nuevo.codigo})`,
        usuario: 'admin'
      });

      // 5) Si además cambió el stock durante la edición, registra ajuste
      const deltaRen = (nuevo.stock|0) - (original.stock|0);
      if (deltaRen !== 0) {
        const tipo = deltaRen > 0 ? 'entrada' : 'salida';
        const cantidad = Math.abs(deltaRen);
        const movUidAdj = `aj_${nuevo.codigo}_${cantidad}_${tipo}_${ahoraISO}`;
        movStore.add({
          movUid: movUidAdj,
          tipo,
          codigo: nuevo.codigo,
          cantidad,
          fecha: ahoraISO,
          motivo: 'Ajuste de stock en renombrado',
          usuario: 'admin'
        });
      }
    };

    tx.oncomplete = () => {
      alert('Producto actualizado con éxito');
      resetForm();
      mostrarTotalProductos();
      $('addScreen')?.classList.add('hidden');
      $('searchScreen')?.classList.remove('hidden');
      if (typeof buscarProductos === 'function') buscarProductos();
      $('buscarInput')?.focus();
      $('productIndex').value = ''; // limpia el flag de edición
    };

    tx.onerror = () => {
      alert('Error al guardar el producto');
    };
  });
}

// ===========================
// RESET FORM
// ===========================
function resetForm() {
  $('productForm')?.reset();
  $('tituloFormulario') && ( $('tituloFormulario').textContent = 'Añadir Producto' );

  // Limpiar miniaturas de imagen
  document.querySelectorAll('img[id^="preview"]').forEach(img => {
    if (img.dataset.objurl) { URL.revokeObjectURL(img.dataset.objurl); delete img.dataset.objurl; }
    img.removeAttribute('src');
  });

  // Limpiar archivos file
  document.querySelectorAll('input[type="file"]').forEach(input => { input.value = ''; });

  // Limpiar el campo oculto de edición
  $('productIndex').value = '';
}

// ===========================
// MOVIMIENTOS RÁPIDOS (salida) - atómico + movUid
// ===========================
function registrarSalida(codigo, cantidad, motivo = 'venta') {
  const ahoraISO = new Date().toISOString();
  const movUid = `sal_${codigo}_${cantidad}_${ahoraISO}`;

  const tx = db.transaction(['productos', 'movimientos'], 'readwrite');
  const productosStore = tx.objectStore('productos');
  const movimientosStore = tx.objectStore('movimientos');

  const productoReq = productosStore.get(codigo);
  productoReq.onsuccess = () => {
    const producto = productoReq.result;
    if (!producto) { alert('❌ Producto no encontrado'); return; }
    if (producto.stock < cantidad) { alert('❌ Stock insuficiente'); return; }

    producto.stock -= cantidad;
    productosStore.put(producto);

    const movimiento = {
      movUid,
      tipo: 'salida',
      codigo,
      cantidad,
      fecha: ahoraISO,
      motivo,
      usuario: 'admin'
    };
    movimientosStore.add(movimiento);

    tx.oncomplete = () => {
      mostrarPopupMovimiento('✅ Salida registrada', 'exito');
      mostrarTotalProductos(); // Actualiza contador
      if (typeof buscarProductos === 'function') buscarProductos(); // Refresca vista
    };

    tx.onerror = () => {
      alert('❌ Error al registrar salida');
    };
  };
}

// ===========================
// CANCELACIONES / NAVEGACIÓN
// ===========================
function cancelarOperacion() {
  const esEdicion = $('productIndex').value;
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  if (esEdicion) {
    $('searchScreen')?.classList.remove('hidden');
    $('tituloFormulario') && ( $('tituloFormulario').textContent = 'Añadir Producto' );
    $('productForm')?.reset();
    $('productIndex').value = '';
  } else {
    $('nav')?.classList.remove('hidden');
    $('productForm')?.reset();
  }
}

function cancelarBusqueda() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav')?.classList.remove('hidden');
  $('buscarInput').value = '';
  $('resultados').innerHTML = '';
}
function cancelarStock() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav')?.classList.remove('hidden');
  $('buscarStock').value = '';
  $('stockResultado').innerHTML = '';
}

// ===========================
// CATEGORÍAS
// ===========================
function cargarCategorias() {
  const tx = db.transaction('categorias', 'readonly');
  const store = tx.objectStore('categorias');
  const request = store.getAll();

  request.onsuccess = () => {
    categorias = (request.result || []).map(cat => cat.nombre);
    const select = $('categoria');
    if (!select) return;
    select.innerHTML = '';

    if (categorias.length === 0) {
      const option = document.createElement('option');
      option.disabled = true;
      option.textContent = 'No hay categorías';
      select.appendChild(option);
    } else {
      categorias.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
      });
    }
  };
}

function addCategoria() {
  const nuevaCat = $('nuevaCategoria').value.trim();
  const existe = categorias.map(c => c.toLowerCase()).includes(nuevaCat.toLowerCase());
  if (nuevaCat && !existe) {
    const tx = db.transaction('categorias', 'readwrite');
    tx.objectStore('categorias').put({ nombre: nuevaCat });
    tx.oncomplete = () => {
      cargarCategorias();
      $('nuevaCategoria').value = '';
      $('nuevaCategoria').focus();
    };
  } else if (existe) {
    alert('Esa categoría ya existe.');
    $('nuevaCategoria').value = '';
    $('nuevaCategoria').focus();
  }
}

function eliminarCategoriaSeleccionada() {
  const seleccionada = $('categoria').value;
  if (!seleccionada) return;
  if (confirm(`¿Eliminar la categoría "${seleccionada}"?`)) {
    const tx = db.transaction('categorias', 'readwrite');
    tx.objectStore('categorias').delete(seleccionada);
    tx.oncomplete = cargarCategorias;
  }
}

// ===========================
// BÚSQUEDA / LISTADO
// ===========================
function mostrarPantallaAddSinReset() {
  showScreen('add'); // Usa tu función genérica
  $('nav')?.classList.add('hidden');
}

function buscarProductos() {
  const consulta = $('buscarInput').value.trim().toLowerCase();
  const contenedor = $('resultados');
  contenedor.innerHTML = '';

  if (!consulta) {
    contenedor.innerHTML = '';
    return;
  }

  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const request = store.getAll();

  request.onsuccess = () => {
    const resultados = request.result.filter(prod => {
      return (
        (prod.codigo || '').toLowerCase().includes(consulta) ||
        (prod.nombre || '').toLowerCase().includes(consulta)
      );
    });

    if (resultados.length === 0) {
      contenedor.innerHTML = '<p>No se encontraron productos.</p>';
      return;
    }

    renderizarResultados(resultados);
  };

  request.onerror = () => {
    contenedor.innerHTML = '<p>Error al buscar productos.</p>';
  };
}

function renderizarResultados(resultados) {
  const contenedor = document.getElementById('resultados');

  // ♻️ Revoca URLs previas si las hubiera
  Array.from(contenedor.querySelectorAll('img[data-objurl]')).forEach(img => {
    try { URL.revokeObjectURL(img.dataset.objurl); } catch {}
  });

  contenedor.innerHTML = '';

  resultados.forEach(prod => {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta-producto';

    const imgContainer = document.createElement('div');
    if (prod.fotoProducto) {
      const blob = new Blob([new Uint8Array(prod.fotoProducto)], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = url;
      img.dataset.objurl = url; // 👈 para poder revocar luego
      img.alt = 'Foto del producto';
      img.style.cursor = 'pointer';
      img.onclick = () => mostrarImagenAmpliada(url);
      imgContainer.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `
      <h3>${prod.nombre}</h3>
      <p>📝 <strong>Zona:</strong> ${prod.zona}</p>
      <p>📦 <strong>Stock:</strong> ${prod.stock || 0}</p>
      <p>💲 <strong>Precio:</strong> ${prod.precioVenta || 0} MN</p>
    `;

    const acciones = document.createElement('div');
    acciones.className = 'acciones';

    const btnEditar = document.createElement('button');
    btnEditar.textContent = '✏️ Editar';
    btnEditar.classList.add('editar-btn');
    btnEditar.onclick = () => editarProducto(prod.codigo);
    acciones.appendChild(btnEditar);

    const btnEliminar = document.createElement('button');
    btnEliminar.textContent = '🗑️';
    btnEliminar.classList.add('eliminar-btn');
    btnEliminar.onclick = () => confirmarEliminar(prod.codigo);
    acciones.appendChild(btnEliminar);

    const btnInfo = document.createElement('button');
    btnInfo.textContent = 'ℹ️ Info';
    btnInfo.classList.add('info-btn');
    btnInfo.onclick = () => verInfoProducto?.(prod);
    acciones.appendChild(btnInfo);

    tarjeta.appendChild(imgContainer);
    tarjeta.appendChild(info);
    tarjeta.appendChild(acciones);

    contenedor.appendChild(tarjeta);
  });
}

// ===========================
// FUNCIÓN PARA EDITAR PRODUCTO
// ===========================
function editarProducto(codigo) {
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const request = store.get(codigo);

  request.onsuccess = function () {
    const producto = request.result;
    if (!producto) {
      alert('Producto no encontrado');
      return;
    }

    mostrarPantallaAddSinReset();
    $('tituloFormulario') && ( $('tituloFormulario').textContent = 'Editar Producto' );

    // Llenar campos del formulario
    $('codigo').value = producto.codigo;
    $('referencia').value = producto.referencia || '';
    $('nombre').value = producto.nombre || '';
    $('proveedor').value = producto.proveedor || '';
    $('categoria').value = producto.categoria || '';
    $('zona').value = producto.zona || '';
    $('descripcion').value = producto.descripcion || '';
    $('cantidad').value = producto.cantidad || 0;
    $('cajas').value = producto.cajas || 0;
    $('precioOriginal').value = producto.precioOriginal || 0;
    $('tasa').value = producto.tasa || 1;
    $('precioCosto').value = producto.precioCosto || 0;
    $('precioVenta').value = producto.precioVenta || 0;
    $('stock').value = producto.stock || 0;

    // Mostrar imágenes si existen
    if (producto.fotoProducto) {
      const blob1 = new Blob([new Uint8Array(producto.fotoProducto)], { type: 'image/jpeg' });
      const url1 = URL.createObjectURL(blob1);
      $('preview1').src = url1;
      $('preview1').dataset.objurl = url1;
    }
    if (producto.fotoEmbalaje) {
      const blob2 = new Blob([new Uint8Array(producto.fotoEmbalaje)], { type: 'image/jpeg' });
      const url2 = URL.createObjectURL(blob2);
      $('preview2').src = url2;
      $('preview2').dataset.objurl = url2;
    }

    // Guardar código en un input hidden para saber si se está editando
    $('productIndex').value = producto.codigo;
  };
}

// ===========================
// MOSTRAR/OCULTAR MENÚ
// ===========================
document.addEventListener('click', e => {
  const toggle = e.target.closest('.dropdown-toggle');
  const menu = document.querySelector('.dropdown-menu');
  if (toggle) {
    menu?.classList.toggle('hidden');
  } else if (!e.target.closest('.dropdown-backup')) {
    menu?.classList.add('hidden');
  }
});

function generarCodigoAutomatico() {
  return 'P' + Date.now() + Math.floor(Math.random() * 1000);
}

// ===========================
// BACKUP: EXPORTAR / IMPORTAR
// ===========================
function confirmarImportacion(event) {
  const fileInput = event.target;
  const borrarTodo = confirm("¿Deseas borrar todos los datos actuales antes de importar?\n\nAceptar = Reemplazar todo\nCancelar = Fusionar con lo existente");
  importarBackup(event, borrarTodo);
  fileInput.value = ''; // permite reseleccionar el mismo archivo
}

async function exportarBackup() {
  try {
    const productos = await new Promise(resolve => {
      const lista = [];
      const tx = db.transaction('productos', 'readonly');
      const store = tx.objectStore('productos');
      const cursor = store.openCursor();

      cursor.onsuccess = e => {
        const cur = e.target.result;
        if (cur) {
          const prod = cur.value;
          if (!prod.codigo || prod.codigo.trim() === '') {
            prod.codigo = 'P' + Date.now() + '-' + lista.length;
          }
          lista.push(prod);
          cur.continue();
        } else {
          resolve(lista);
        }
      };

      cursor.onerror = () => {
        console.error('Error leyendo productos');
        resolve([]);
      };
    });

    const categorias = await new Promise(res => {
      const tx = db.transaction('categorias', 'readonly');
      tx.objectStore('categorias').getAll().onsuccess = e => res(e.target.result);
    });

    // ✅ Obtener y agrupar movimientos por tipo (conserva movUid)
    const movimientos = await new Promise(resolve => {
      const agrupados = {
        entrada: [],
        salida: [],
        registro: [],
        edicion: [],
        otros: []
      };

      const tx = db.transaction('movimientos', 'readonly');
      const store = tx.objectStore('movimientos');
      const cursor = store.openCursor();

      cursor.onsuccess = e => {
        const cur = e.target.result;
        if (cur) {
          const mov = cur.value;
          if (mov.tipo && agrupados[mov.tipo]) {
            agrupados[mov.tipo].push(mov);
          } else {
            agrupados.otros.push(mov);
          }
          cur.continue();
        } else {
          resolve(agrupados);
        }
      };

      cursor.onerror = () => {
        console.error('Error leyendo movimientos');
        resolve(agrupados);
      };
    });

    const backup = {
      fecha: new Date().toISOString(),
      productos,
      categorias,
      movimientos // agrupados por tipo, respetando movUid
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fecha = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `backup-inventario-${fecha}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    alert('❌ Error al exportar los datos');
    console.error(error);
  }
}

async function importarBackup(event, borrar = false) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const backup = JSON.parse(reader.result);
      console.log(`📥 Archivo importado: ${file.name}`);

      if (!backup || typeof backup !== 'object') {
        throw new Error("❌ El archivo no contiene un respaldo válido.");
      }

      const timestamp = Date.now();
      const batchSize = 100;

      if (borrar) {
        const txClear = db.transaction(['productos', 'categorias', 'movimientos'], 'readwrite');
        txClear.objectStore('productos').clear();
        txClear.objectStore('categorias').clear();
        txClear.objectStore('movimientos').clear();
        await esperar(50);
      }

      // Mapa para códigos cambiados durante importación
      const codeMap = new Map(); // oldCode -> newCode

      // ==========================
      // ✅ Importar Categorías
      // ==========================
      if (Array.isArray(backup.categorias)) {
        for (let i = 0; i < backup.categorias.length; i += batchSize) {
          const tx = db.transaction('categorias', 'readwrite');
          const store = tx.objectStore('categorias');
          backup.categorias.slice(i, i + batchSize).forEach(cat => {
            if (cat && cat.nombre) store.put({ nombre: String(cat.nombre) });
          });
          await esperar(10);
        }
      }

      // ==========================
      // ✅ Importar Productos
      // ==========================
      if (Array.isArray(backup.productos)) {
        for (let i = 0; i < backup.productos.length; i++) {
          const prod = backup.productos[i];
          if (!prod || typeof prod !== 'object') continue;

          const oldCode = (prod.codigo && String(prod.codigo).trim()) ? String(prod.codigo).trim() : `P${timestamp}-${i}`;

          // Normaliza numéricos (por si vinieron como string)
          if (prod.precioCosto != null) prod.precioCosto = parseFloat(prod.precioCosto) || 0;
          if (prod.precioVenta != null) prod.precioVenta = parseFloat(prod.precioVenta) || 0;
          if (prod.stock != null) prod.stock = parseInt(prod.stock) || 0;

          await new Promise((resolve) => {
            const tx = db.transaction('productos', 'readwrite');
            const store = tx.objectStore('productos');
            const check = store.get(oldCode);
            check.onsuccess = () => {
              let finalCode = oldCode;
              if (check.result) {
                finalCode = `P${timestamp}-${i}-${Math.floor(Math.random() * 1000)}`;
              }
              prod.codigo = finalCode;
              // Si el código cambió, mapea para corregir movimientos entrantes
              if (finalCode !== oldCode) codeMap.set(oldCode, finalCode);
              if (prod.nombre && prod.precioCosto >= 0) store.put(prod);
              resolve();
            };
            check.onerror = () => {
              const finalCode = `P${timestamp}-${i}-${Math.floor(Math.random() * 1000)}`;
              prod.codigo = finalCode;
              codeMap.set(oldCode, finalCode);
              store.put(prod);
              resolve();
            };
          });

          await esperar(5);
        }
      }

      // ==========================
      // ✅ Importar Movimientos (idempotente con movUid)
      //    Soporta formato agrupado o lista plana
      // ==========================
      const movimientosBlk = backup.movimientos;
      const todosLosMovs = [];

      if (Array.isArray(movimientosBlk)) {
        // Formato antiguo (lista plana)
        todosLosMovs.push(...movimientosBlk);
      } else if (movimientosBlk && typeof movimientosBlk === 'object') {
        // Formato nuevo agrupado por tipo
        for (const tipo in movimientosBlk) {
          if (Array.isArray(movimientosBlk[tipo])) {
            for (const m of movimientosBlk[tipo]) {
              todosLosMovs.push({ ...m, tipo: m.tipo || tipo });
            }
          }
        }
      }

      // Normaliza cada movimiento, re-mapea códigos y genera movUid si falta
      const normalizados = todosLosMovs
        .filter(m => m && (m.codigo != null)) // requiere al menos codigo
        .map((m, i) => {
          let codigo = String(m.codigo ?? '').trim();
          // 🔁 Reasignar si el producto cambió de código durante importación
          if (codeMap.has(codigo)) codigo = codeMap.get(codigo);

          const tipo = (m.tipo === 'entrada' || m.tipo === 'salida' || m.tipo === 'registro' || m.tipo === 'edicion')
            ? m.tipo : (m.tipo ? String(m.tipo) : 'otros');
          const cantidad = parseInt(m.cantidad) || 0;

          // Asegura fecha ISO
          let fechaISO = new Date().toISOString();
          if (m.fecha && !isNaN(Date.parse(m.fecha))) {
            fechaISO = new Date(m.fecha).toISOString();
          }

          // movUid determinista si no viene (evita duplicar al reimportar el mismo backup)
          const base = `${m.id ?? ''}|${codigo}|${tipo}|${cantidad}|${fechaISO}`;
          const movUid = m.movUid || ('m_' + base64Of(base));

          return {
            movUid,
            codigo,
            tipo,
            cantidad,
            fecha: fechaISO,
            motivo: m.motivo || m.nota || '',
            usuario: m.usuario || 'admin'
          };
        });

      // Inserta evitando duplicados usando índice movUid (si existe)
      const batchMov = 200;
      for (let i = 0; i < normalizados.length; i += batchMov) {
        await new Promise((resolve) => {
          const tx = db.transaction('movimientos', 'readwrite');
          const store = tx.objectStore('movimientos');
          let idx = null;
          try { idx = store.index('movUid'); } catch {}

          const slice = normalizados.slice(i, i + batchMov);
          let pending = slice.length;
          if (pending === 0) { resolve(); return; }

          for (const mov of slice) {
            if (idx) {
              const check = idx.get(mov.movUid);
              check.onsuccess = () => {
                if (!check.result) store.add(mov);
                if (--pending === 0) resolve();
              };
              check.onerror = () => {
                // si falla el índice, intenta add de todas formas
                store.add(mov).onsuccess = () => { if (--pending === 0) resolve(); };
              };
            } else {
              // Si el índice no existe (ej. importas en v2), añade igual.
              // Cuando abras con v3, el backfill creará movUid.
              store.add(mov).onsuccess = () => { if (--pending === 0) resolve(); };
            }
          }

          tx.oncomplete = () => {}; // noop
          tx.onerror = () => resolve(); // no bloquees por errores puntuales
        });
        await esperar(10);
      }

      alert('✅ Copia importada con éxito');
      cargarCategorias();
      mostrarTotalProductos();
      if (typeof buscarProductos === 'function') buscarProductos();

    } catch (err) {
      console.error(err);
      alert('❌ Archivo inválido o error durante la importación');
    }
  };

  reader.readAsText(file);
}

// ===========================
// FOTO A BASE64 INT64 (COMPRESIÓN)
// ===========================
function capturarFoto(index) {
  return new Promise(resolve => {
    const img = document.getElementById(`preview${index}`);
    if (!img || !img.src) return resolve(null);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 300;
    canvas.height = 300;
    ctx.drawImage(img, 0, 0, 300, 300);
    canvas.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result;
        const int64Array = Array.from(new Uint8Array(arrayBuffer));
        resolve(int64Array);
      };
      reader.readAsArrayBuffer(blob);
    }, 'image/jpeg', 0.7);
  });
}

// ===========================
// ELIMINAR PRODUCTO (opción para borrar movimientos)
// ===========================
function confirmarEliminar(codigo) {
  if (!confirm("¿Estás seguro de eliminar el producto con código: " + codigo + "?")) return;

  const borrarMovs = confirm('¿Eliminar también todos sus movimientos?');
  const stores = borrarMovs ? ['productos','movimientos'] : ['productos'];

  const tx = db.transaction(stores, 'readwrite');
  tx.objectStore('productos').delete(codigo);

  if (borrarMovs) {
    const movs = tx.objectStore('movimientos');
    let usingIdx = false;
    try { movs.index('porCodigo'); usingIdx = true; } catch {}
    if (usingIdx) {
      const idx = movs.index('porCodigo');
      const req = idx.openCursor(IDBKeyRange.only(codigo));
      req.onsuccess = e => { const cur = e.target.result; if (!cur) return; cur.delete(); cur.continue(); };
    } else {
      movs.openCursor().onsuccess = e => { const cur = e.target.result; if (!cur) return;
        if (cur.value.codigo === codigo) cur.delete(); cur.continue();
      };
    }
  }

  tx.oncomplete = () => {
    alert("Producto eliminado: " + codigo);
    buscarProductos?.(); // Actualiza la lista después de eliminar
    mostrarTotalProductos();
  };
  tx.onerror = () => {
    alert("Ocurrió un error al intentar eliminar el producto.");
  };
}

// ===========================
// TOTALES / POPUPS / MODALES
// ===========================
function mostrarTotalProductos() {
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();

  req.onsuccess = () => {
    const productos = req.result || [];
    const el = document.getElementById('totalProductos');
    if (el) el.textContent = productos.length;
  };
}

function mostrarImagenAmpliada(src) {
  const modal = document.getElementById('modalImagen');
  const imagen = document.getElementById('imagenAmpliada');
  imagen.src = src;
  modal.classList.remove('hidden');
}

function cerrarModal() {
  const modal = document.getElementById('modalImagen');
  modal.classList.add('hidden');
  const img = document.getElementById('imagenAmpliada');
  if (img?.dataset.objurl) { URL.revokeObjectURL(img.dataset.objurl); delete img.dataset.objurl; }
  if (img) img.src = "";
}

function mostrarPopupMovimiento(texto, tipo = 'exito') {
  const popup = document.getElementById('popupMovimiento');
  if (!popup) return;
  popup.textContent = texto;
  popup.className = `popup show ${tipo}`;
  setTimeout(() => {
    popup.classList.remove('show');
  }, 3500);
}

// ===========================
// UTILIDADES
// ===========================
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// base64 sin unescape (deprecado); util para movUid determinista
function base64Of(str) {
  const enc = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i]);
  return btoa(bin).replace(/=+$/,'');
}

// ===========================
// (OPCIONAL) Reparar stock desde movimientos
// ===========================
async function recalcularStockDesdeMovimientos() {
  const tx = db.transaction(['productos','movimientos'],'readwrite');
  const productos = tx.objectStore('productos');
  const movimientos = tx.objectStore('movimientos');

  const [prods, movs] = await Promise.all([
    new Promise(r => { const req = productos.getAll(); req.onsuccess = () => r(req.result||[]); }),
    new Promise(r => { const req = movimientos.getAll(); req.onsuccess = () => r(req.result||[]); }),
  ]);

  movs.sort((a,b)=> (a.fecha||'').localeCompare(b.fecha||''));

  const acc = new Map(prods.map(p => [p.codigo, 0]));
  for (const m of movs) {
    if (!m || !m.codigo) continue;
    if (!acc.has(m.codigo)) acc.set(m.codigo, 0);
    if (m.tipo === 'registro' || m.tipo === 'entrada') acc.set(m.codigo, acc.get(m.codigo) + (m.cantidad|0));
    else if (m.tipo === 'salida') acc.set(m.codigo, acc.get(m.codigo) - (m.cantidad|0));
  }

  for (const p of prods) { p.stock = acc.get(p.codigo) ?? 0; productos.put(p); }

  await new Promise((res, rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error); });
  mostrarPopupMovimiento('✅ Stock recalculado desde movimientos', 'exito');
  mostrarTotalProductos();
  if (typeof buscarProductos === 'function') buscarProductos();
}

// ===========================
// CÁLCULOS AUTOMÁTICOS
// ===========================
function calcularStock() {
  const cantidad = parseInt($('cantidad').value) || 0;
  const cajas = parseInt($('cajas').value) || 0;
  $('stock').value = cantidad * cajas;
}
function calcularPrecioCosto() {
  const precioOriginal = parseFloat($('precioOriginal').value);
  const tasa = parseFloat($('tasa').value);
  if (!isNaN(precioOriginal) && !isNaN(tasa)) {
    const costo = precioOriginal * tasa * 2;
    $('precioCosto').value = costo.toFixed(2);
    calcularPrecioVenta();
  }
}
function calcularPrecioVenta() {
  const precioCosto = parseFloat($('precioCosto').value);
  if (!isNaN(precioCosto)) {
    const venta = precioCosto * 1.3;
    $('precioVenta').value = venta.toFixed(2);
  }
}
