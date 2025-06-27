// movimientos.js - Módulo para registrar y visualizar movimientos de stock



function mostrarPantallaMovimientos() {
  mostrarPantalla('movimiento');
  cargarSelectorDeProductos();
  document.getElementById('formMovimiento').reset();
  document.getElementById('stockActual').textContent = '--';
  document.getElementById('previewMovimiento')?.removeAttribute('src');
  document.getElementById('buscarProductoMovimiento').value = '';

  // ✅ Mostrar total de productos al entrar
  mostrarTotalProductos();
}


function cargarSelectorDeProductos() {
  const select = document.getElementById('productoMovimiento');
  const buscador = document.getElementById('buscarProductoMovimiento');
  select.innerHTML = '';

  // Agrega opción en blanco al inicio
  const blanco = document.createElement('option');
  blanco.value = '';
  blanco.textContent = '-- Selecciona un producto --';
  select.appendChild(blanco);

  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();

  req.onsuccess = () => {
    const productos = req.result;

    // ✅ Usa la nueva función general pasando select y buscador
    renderizarOpcionesSelector(productos, select, buscador);

    // ✅ También puedes aplicar filtro directo si lo prefieres
    buscador.oninput = () => {
      const query = buscador.value.toLowerCase();
      const filtrados = productos.filter(p =>
        p.codigo.toLowerCase().includes(query) ||
        p.nombre.toLowerCase().includes(query) ||
        (p.referencia?.toLowerCase() || '').includes(query)
      );
      renderizarOpcionesSelector(filtrados, select);
    };

    // ✅ Al cambiar de producto, mostrar datos
    select.onchange = mostrarDatosProducto;
  };
}



function mostrarDatosProducto() {
  const codigo = document.getElementById('productoMovimiento').value;
  if (!codigo) {
    document.getElementById('stockActual').textContent = '--';
    document.getElementById('previewMovimiento')?.removeAttribute('src');
    return;
  }
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.get(codigo); // Aquí el value es el id (UUID)

  req.onsuccess = () => {
    const prod = req.result;
    if (!prod) return;
    document.getElementById('stockActual').textContent = prod.stock;
    const preview = document.getElementById('previewMovimiento');
    if (prod.fotoProducto) {
      const blob = new Blob([new Uint8Array(prod.fotoProducto)], { type: 'image/jpeg' });
      preview.src = URL.createObjectURL(blob);
    } else {
      preview.removeAttribute('src');
    }

    // Guardar el producto actual en memoria para el botón "ver info"
    window.productoSeleccionado = prod;
  };
}

function verInfoProductoSeleccionado() {
  const prod = window.productoSeleccionado;
  if (!prod) return alert('No hay producto seleccionado');

  const icono = (etiqueta) => {
    const iconos = {
      código: '🔢',
      referencia: '📄',
      proveedor: '🏭',
      categoría: '🏷️',
      zona: '📍',
      descripción: '📝',
      stock: '📦',
      precioOriginal: '💵',
      tasa: '💱',
      precioCosto: '💰',
      precioVenta: '💸'
    };
    return iconos[etiqueta.toLowerCase()] || '';
  };

  let html = `
    <h3 style="margin-bottom: 10px; font-size: 1.4em; color: #333;">${prod.nombre}</h3>
    <p><strong>${icono('código')} Código:</strong> ${prod.codigo}</p>
    <p><strong>${icono('referencia')} Referencia:</strong> ${prod.referencia}</p>
    <p><strong>${icono('proveedor')} Proveedor:</strong> ${prod.proveedor}</p>
    <p><strong>${icono('categoría')} Categoría:</strong> ${prod.categoria}</p>
    <p><strong>${icono('zona')} Zona:</strong> ${prod.zona}</p>
    <p><strong>${icono('descripción')} Descripción:</strong> ${prod.descripcion}</p>
    <p><strong>${icono('stock')} Stock:</strong> ${prod.stock}</p>
    <p><strong>${icono('precioOriginal')} Precio Original:</strong> ${prod.precioOriginal}</p>
    <p><strong>${icono('tasa')} Tasa:</strong> ${prod.tasa}</p>
    <p><strong>${icono('precioCosto')} Precio Costo:</strong> ${prod.precioCosto}</p>
    <p><strong>${icono('precioVenta')} Precio Venta:</strong> ${prod.precioVenta}</p>
  `;

  if (prod.fotoProducto) {
    const blob = new Blob([new Uint8Array(prod.fotoProducto)], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    html += `<img src="${url}" alt="Foto del producto" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">`;
  }

  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '9999';

  const content = document.createElement('div');
  content.style.backgroundColor = '#fff';
  content.style.padding = '20px';
  content.style.maxWidth = '90vw';
  content.style.maxHeight = '90vh';
  content.style.overflowY = 'auto';
  content.style.borderRadius = '12px';
  content.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
  content.style.fontSize = '1em';
  content.innerHTML = html + '<br><button class="cancelar" style="margin-top: 15px;" onclick="this.parentNode.parentNode.remove()">✖️ Cerrar</button>';

  modal.appendChild(content);
  document.body.appendChild(modal);
}


function verInfoProducto(prod) {
  const icono = (etiqueta) => {
    const iconos = {
      código: '🔢',
      referencia: '📄',
      proveedor: '🏭',
      categoría: '🏷️',
      zona: '📍',
      descripción: '📝',
      stock: '📦',
      precioOriginal: '💵',
      tasa: '💱',
      precioCosto: '💰',
      precioVenta: '💸'
    };
    return iconos[etiqueta.toLowerCase()] || '';
  };

  let html = `
    <h3 style="margin-bottom: 10px; font-size: 1.4em; color: #333;">${prod.nombre}</h3>
    <p><strong>${icono('código')} Código:</strong> ${prod.codigo}</p>
    <p><strong>${icono('referencia')} Referencia:</strong> ${prod.referencia}</p>
    <p><strong>${icono('proveedor')} Proveedor:</strong> ${prod.proveedor}</p>
    <p><strong>${icono('categoría')} Categoría:</strong> ${prod.categoria}</p>
    <p><strong>${icono('zona')} Zona:</strong> ${prod.zona}</p>
    <p><strong>${icono('descripción')} Descripción:</strong> ${prod.descripcion}</p>
    <p><strong>${icono('stock')} Stock:</strong> ${prod.stock}</p>
    <p><strong>${icono('precioOriginal')} Precio Original:</strong> ${prod.precioOriginal}</p>
    <p><strong>${icono('tasa')} Tasa:</strong> ${prod.tasa}</p>
    <p><strong>${icono('precioCosto')} Precio Costo:</strong> ${prod.precioCosto}</p>
    <p><strong>${icono('precioVenta')} Precio Venta:</strong> ${prod.precioVenta}</p>
  `;

  if (prod.fotoProducto) {
    const blob = new Blob([new Uint8Array(prod.fotoProducto)], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    html += `<img src="${url}" alt="Foto del producto" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">`;
  }

  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '9999';

  const content = document.createElement('div');
  content.style.backgroundColor = '#fff';
  content.style.padding = '20px';
  content.style.maxWidth = '90vw';
  content.style.maxHeight = '90vh';
  content.style.overflowY = 'auto';
  content.style.borderRadius = '12px';
  content.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
  content.style.fontSize = '1em';
  content.innerHTML = html + '<br><button class="cancelar" style="margin-top: 15px;" onclick="this.parentNode.parentNode.remove()">✖️ Cerrar</button>';

  modal.appendChild(content);
  document.body.appendChild(modal);
}


function registrarMovimientoDesdeFormulario(e) {
  e.preventDefault();

  const productoId = document.getElementById('productoMovimiento').value; // <-- El value es el id
  const tipo = document.getElementById('tipoMovimiento').value;
  const cantidad = parseInt(document.getElementById('cantidadMovimiento').value);
  const nota = document.getElementById('notaMovimiento').value.trim();
  const usuario = JSON.parse(localStorage.getItem('usuarioActivo'))?.nombre || 'Desconocido';

  if (!productoId || isNaN(cantidad) || cantidad <= 0) {
    mostrarPopupMovimiento('❌ Ingresa una cantidad válida.', 'error');
    return;
  }

  const tx = db.transaction('productos', 'readwrite');
  const store = tx.objectStore('productos');
  const req = store.get(productoId); // <-- Busca por id

 req.onsuccess = () => {
  const producto = req.result;
  if (!producto) {
    mostrarPopupMovimiento('❌ Producto no encontrado.', 'error');
    return;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(producto.id)) {
    mostrarPopupMovimiento('❌ El producto no tiene un ID válido.', 'error');
    return;
  }

  // ✅ Aquí dentro ya puedes usar `producto`
  if (tipo === 'salida' && producto.stock < cantidad) {
    if (!confirm(`Stock insuficiente (actual: ${producto.stock}). ¿Deseas continuar?`)) {
      return;
    }
  }

  producto.stock += tipo === 'entrada' ? cantidad : -cantidad;
  producto.updated_at = new Date().toISOString();  // 🔄 marca el momento del cambio
  producto.subido = false;                         // 🔔 pendiente de sincronizar
  store.put(producto);

  const movimiento = {
    id: crypto.randomUUID(),
    producto_id: producto.id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    tipo,
    cantidad,
    nota,
    usuario,
    fecha: new Date().toISOString(),
    created_at: new Date().toISOString(),
    subido: false
  };

  const tx2 = db.transaction('movimientos', 'readwrite');
  tx2.objectStore('movimientos').add(movimiento);

  tx2.oncomplete = () => {
    const mensaje = `✅ Has ${tipo === 'entrada' ? 'añadido' : 'retirado'} ${cantidad} unidades.\n📦 Total actual: ${producto.stock}`;
    mostrarPopupMovimiento(mensaje, 'exito');

    document.getElementById('formMovimiento').reset();
    document.getElementById('stockActual').textContent = '--';
    document.getElementById('previewMovimiento')?.removeAttribute('src');
    document.getElementById('productoMovimiento').selectedIndex = 0;
    window.productoSeleccionado = null;
  };
};
}



function verHistorial() {
  mostrarPantalla('historial');
  const contenedor = document.getElementById('listaMovimientos');
  contenedor.innerHTML = '';

  const tx = db.transaction('movimientos', 'readonly');
  const store = tx.objectStore('movimientos');
  const req = store.getAll();

  req.onsuccess = () => {
    req.result.reverse().forEach(mov => {
      const div = document.createElement('div');
      div.className = 'movimiento';
      div.innerHTML = `
        <p><strong>${mov.tipo.toUpperCase()}</strong> - ${mov.fecha}</p>
        <p>Producto: ${mov.codigo || ''} - ${mov.nombre || ''} | Cantidad: ${mov.cantidad}</p>
        <p>Usuario: ${mov.usuario}</p>
        <p>Nota: ${mov.nota}</p>
        <hr>
      `;
      contenedor.appendChild(div);
    });
  };
}

function mostrarPantalla(id) {
  document.querySelectorAll(".screen").forEach(sec => sec.classList.add("hidden"));
  document.getElementById("nav")?.classList.add("hidden");
  document.getElementById(id + "Screen")?.classList.remove("hidden");
}

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
      // Opcional: mostrar automáticamente el modal
      // verInfoProductoSeleccionado();
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
    const productos = req.result;
    renderizarOpcionesSelector(productos, select);
  };
}

function renderizarOpcionesSelector(productos, selectElement, buscador = null) {
  if (!selectElement) return;

  const primera = selectElement.firstElementChild;
  selectElement.innerHTML = '';
  if (primera) selectElement.appendChild(primera);

  productos.forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod.id; // <-- Usa el UUID, no el código
    opt.textContent = `${prod.codigo} - ${prod.nombre}`;
    selectElement.appendChild(opt);
  });

  if (buscador) {
    buscador.addEventListener('input', () => {
      const texto = buscador.value.toLowerCase();
      Array.from(selectElement.options).forEach(opt => {
        opt.hidden = !opt.textContent.toLowerCase().includes(texto);
      });
    });
  }
}

