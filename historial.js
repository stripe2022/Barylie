// movimientos.js - Módulo para registrar y visualizar movimientos de stock

function mostrarPantallaMovimientos() {
  mostrarPantalla('movimiento');
  cargarSelectorDeProductos();
  document.getElementById('formMovimiento').reset();
  document.getElementById('stockActual').textContent = '--';
  document.getElementById('previewMovimiento')?.removeAttribute('src');
  document.getElementById('buscarProductoMovimiento').value = '';
}

function mostrarPantallaHistorialConFiltro() {
  mostrarPantalla('historialFiltrado');
  document.getElementById('filtroTipo').value = '';
  document.getElementById('filtroFecha').value = '';
  document.getElementById('resultadosFiltrados').innerHTML = '';
  cargarHistorialFiltrado();
}

function cargarHistorialFiltrado() {
  const contenedor = document.getElementById('resultadosFiltrados');
  contenedor.innerHTML = '';

  const tx = db.transaction('movimientos', 'readonly');
  const store = tx.objectStore('movimientos');
  const req = store.getAll();

  req.onsuccess = () => {
    let resultados = req.result;

    resultados.reverse().forEach(mov => {
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

function aplicarFiltroHistorial() {
  const tipo = document.getElementById('filtroTipo').value;
  const fecha = document.getElementById('filtroFecha').value;
  const contenedor = document.getElementById('resultadosFiltrados');
  contenedor.innerHTML = '';

  const tx = db.transaction('movimientos', 'readonly');
  const store = tx.objectStore('movimientos');
  const req = store.getAll();

  req.onsuccess = () => {
    let resultados = req.result;

    if (tipo) resultados = resultados.filter(mov => mov.tipo === tipo);
    if (fecha) resultados = resultados.filter(mov => mov.fecha.startsWith(fecha));

    if (resultados.length === 0) {
      contenedor.innerHTML = '<p>No se encontraron movimientos con los criterios seleccionados.</p>';
      return;
    }

    resultados.reverse().forEach(mov => {
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
    const productos = req.result;

    // ✅ Esto ya incluye filtrado si buscador existe
    renderizarOpcionesSelector(productos, select, buscador);

    // ✅ Asignar cambio de selección
    select.onchange = mostrarDatosProducto;
  };
}

