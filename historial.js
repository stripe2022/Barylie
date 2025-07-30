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

    (async () => {
      for (const mov of resultados.reverse()) {
        const nombre = await obtenerNombreProductoPorCodigo(mov.codigo);

        // Plantilla dinámica según tipo de movimiento
        const tipo = mov.tipo.toUpperCase();
        const fecha = mov.fecha;
        const usuario = mov.usuario || 'desconocido';
        const nota = mov.nota || mov.motivo || '';

        const cantidadVisible = (mov.tipo === 'entrada' || mov.tipo === 'salida' || mov.tipo === 'registro');

        const div = document.createElement('div');
        div.className = 'movimiento';
        div.innerHTML = `
          <p><strong>${tipo}</strong> - ${fecha}</p>
          <p>Producto: ${nombre || mov.codigo}</p>
          ${cantidadVisible ? `<p>Cantidad: ${mov.cantidad}</p>` : ''}
          <p>Usuario: ${usuario}</p>
          <p>Nota: ${nota}</p>
          <hr>
        `;
        contenedor.appendChild(div);
      }
    })();
  };
}


function obtenerNombreProductoPorCodigo(codigo) {
  return new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const req = store.get(codigo);

    req.onsuccess = () => {
      resolve(req.result?.nombre || null);
    };
    req.onerror = () => resolve(null);
  });
}

function aplicarFiltroHistorial() {
  const tipo = document.getElementById('filtroTipo').value;
  const fecha = document.getElementById('filtroFecha').value;
  const filtroNombre = document.getElementById('filtroNombre').value.trim().toLowerCase();
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

    (async () => {
      let encontrados = 0;

      for (const mov of resultados.reverse()) {
        const nombreProducto = await obtenerNombreProductoPorCodigo(mov.codigo);
        const nombreMin = (nombreProducto || '').toLowerCase();

        if (filtroNombre && !nombreMin.includes(filtroNombre)) continue;

        const tipo = mov.tipo.toUpperCase();
        const mostrarCantidad = ['entrada', 'salida', 'registro'].includes(mov.tipo);

        const div = document.createElement('div');
        div.className = 'movimiento';
        div.innerHTML = `
  <p><strong>${tipo}</strong> - ${mov.fecha}</p>
  <p>Producto: ${nombreProducto || mov.codigo}</p>
  ${mostrarCantidad ? `<p>Cantidad: ${mov.cantidad}</p>` : ''}
  <p>Usuario: ${mov.usuario || 'desconocido'}</p>
  <p>Nota: ${mov.nota || mov.motivo || ''}</p>
  <hr>
`;

        contenedor.appendChild(div);
        encontrados++;
      }

      if (encontrados === 0) {
        contenedor.innerHTML = '<p>No se encontraron movimientos con ese nombre.</p>';
      }
    })();
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

