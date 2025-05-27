// movimientos.js - Módulo para registrar y visualizar movimientos de stock

function mostrarPantallaMovimientos() {
  mostrarPantalla('movimiento');
  cargarSelectorDeProductos();
  document.getElementById('formMovimiento').reset();
  document.getElementById('stockActual').textContent = '--';
  document.getElementById('previewMovimiento')?.removeAttribute('src');
  document.getElementById('buscarProductoMovimiento').value = '';
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
    renderizarOpcionesSelector(productos);

    buscador.oninput = () => {
      const query = buscador.value.toLowerCase();
      const filtrados = productos.filter(p =>
        p.codigo.toLowerCase().includes(query) ||
        p.nombre.toLowerCase().includes(query) ||
        (p.referencia?.toLowerCase() || '').includes(query)
      );
      renderizarOpcionesSelector(filtrados);
    };

    select.onchange = mostrarDatosProducto;
  };
}

function renderizarOpcionesSelector(productos) {
  const select = document.getElementById('productoMovimiento');
  // Mantener primera opción en blanco
  const primera = select.firstElementChild;
  select.innerHTML = '';
  if (primera) select.appendChild(primera);

  productos.forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod.codigo;
    opt.textContent = `${prod.codigo} - ${prod.nombre}`;
    select.appendChild(opt);
  });
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
  const req = store.get(codigo);

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

  let html = `
    <h3>${prod.nombre}</h3>
    <p><strong>Código:</strong> ${prod.codigo}</p>
    <p><strong>Referencia:</strong> ${prod.referencia}</p>
    <p><strong>Proveedor:</strong> ${prod.proveedor}</p>
    <p><strong>Categoría:</strong> ${prod.categoria}</p>
    <p><strong>Zona:</strong> ${prod.zona}</p>
    <p><strong>Descripción:</strong> ${prod.descripcion}</p>
    <p><strong>Stock:</strong> ${prod.stock}</p>
    <p><strong>Precio Original:</strong> ${prod.precioOriginal}</p>
    <p><strong>Tasa:</strong> ${prod.tasa}</p>
    <p><strong>Precio Costo:</strong> ${prod.precioCosto}</p>
    <p><strong>Precio Venta:</strong> ${prod.precioVenta}</p>
  `;

  if (prod.fotoProducto) {
    const blob = new Blob([new Uint8Array(prod.fotoProducto)], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    html += `<img src="${url}" alt="Foto del producto" style="max-width: 200px; display: block; margin-top: 10px;">`;
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
  content.style.maxWidth = '400px';
  content.style.borderRadius = '10px';
  content.innerHTML = html + '<br><button onclick="this.parentNode.parentNode.remove()">Cerrar</button>';

  modal.appendChild(content);
  document.body.appendChild(modal);
}

function registrarMovimientoDesdeFormulario(e) {
  e.preventDefault();

  const codigo = document.getElementById('productoMovimiento').value;
  const tipo = document.getElementById('tipoMovimiento').value;
  const cantidad = parseInt(document.getElementById('cantidadMovimiento').value);
  const nota = document.getElementById('notaMovimiento').value.trim();
  const usuario = JSON.parse(localStorage.getItem('usuarioActivo'))?.nombre || 'Desconocido';

  if (!codigo || isNaN(cantidad) || cantidad <= 0) {
    alert('Por favor ingresa una cantidad válida.');
    return;
  }

  const tx = db.transaction('productos', 'readwrite');
  const store = tx.objectStore('productos');
  const req = store.get(codigo);

  req.onsuccess = () => {
    const producto = req.result;
    if (!producto) return alert('Producto no encontrado');

    if (tipo === 'salida' && producto.stock < cantidad) {
      if (!confirm(`Stock insuficiente (actual: ${producto.stock}). ¿Deseas continuar?`)) {
        return;
      }
    }

    producto.stock += tipo === 'entrada' ? cantidad : -cantidad;
    store.put(producto);

    const movimiento = {
      codigo: producto.codigo,
      tipo,
      cantidad,
      nota,
      usuario,
      fecha: new Date().toISOString()
    };

    const tx2 = db.transaction('movimientos', 'readwrite');
    tx2.objectStore('movimientos').add(movimiento);

    tx2.oncomplete = () => {
      alert('✅ Movimiento registrado');
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
        <p>Producto: ${mov.codigo} | Cantidad: ${mov.cantidad}</p>
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
