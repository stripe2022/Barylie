// movimientos.js - Módulo para registrar y visualizar movimientos de stock

function mostrarPantallaMovimientos() {
  ocultarTodasLasPantallas();
  const pantalla = document.getElementById('movimientoScreen');
  pantalla.classList.remove('hidden');
  cargarSelectorDeProductos();
  document.getElementById('formMovimiento').reset();
}

function cargarSelectorDeProductos() {
  const select = document.getElementById('productoMovimiento');
  const buscador = document.getElementById('buscarProductoMovimiento');
  select.innerHTML = '';

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

    mostrarDatosProducto();
  };

  select.onchange = mostrarDatosProducto;
}

function renderizarOpcionesSelector(productos) {
  const select = document.getElementById('productoMovimiento');
  select.innerHTML = '';
  productos.forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod.codigo;
    opt.textContent = `${prod.codigo} - ${prod.nombre}`;
    select.appendChild(opt);
  });
}

function mostrarDatosProducto() {
  const codigo = document.getElementById('productoMovimiento').value;
  if (!codigo) return;
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
  };
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

    // Actualizar stock
    producto.stock += tipo === 'entrada' ? cantidad : -cantidad;
    store.put(producto);

    // Registrar movimiento
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
      mostrarDatosProducto();
      document.getElementById('formMovimiento').reset();
    };
  };
}

function verHistorial() {
  ocultarTodasLasPantallas();
  document.getElementById('historialScreen').classList.remove('hidden');
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
