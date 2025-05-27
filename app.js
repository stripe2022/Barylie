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
  $('productForm').addEventListener('submit', guardarProducto);

  // Listeners para cálculo automático de precioCosto, precioVenta y stock
  $('precioOriginal').addEventListener('input', calcularPrecioCosto);
  $('tasa').addEventListener('input', calcularPrecioCosto);
  $('precioCosto').addEventListener('input', calcularPrecioVenta);
  $('cantidad').addEventListener('input', calcularStock);
  $('cajas').addEventListener('input', calcularStock);
});

// ===========================
// INDEXEDDB
// ===========================
function abrirDB() {
  const request = indexedDB.open('inventarioDB', 2);

  request.onupgradeneeded = function (e) {
    const db = e.target.result;
    const store = db.createObjectStore('productos', { keyPath: 'codigo' });
    store.createIndex('nombre', 'nombre', { unique: false });
    db.createObjectStore('categorias', { keyPath: 'nombre' });
    db.createObjectStore('movimientos', { keyPath: 'id', autoIncrement: true });

  };

  request.onsuccess = function (e) {
    db = e.target.result;
    cargarCategorias();
  };

  request.onerror = function () {
    console.error('Error al abrir la base de datos');
  };
}

function activarPantallaAdd() {
  ocultarTodasLasPantallas();
  resetForm();
  $('addScreen').classList.remove('hidden');
 
}

function activarPantallaSearch() {
  ocultarTodasLasPantallas();
  $('searchScreen').classList.remove('hidden');
  $('buscarInput').value = '';
  $('resultados').innerHTML = '';
}

function activarPantallaStock() {
  ocultarTodasLasPantallas();
  $('stockScreen').classList.remove('hidden');
  $('buscarStock').value = '';
  $('stockResultado').innerHTML = '';
}

function ocultarTodasLasPantallas() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav').classList.add('hidden'); // Oculta los botones del menú
}


function guardarProducto(e) {
  e.preventDefault();

  Promise.all([
  capturarFoto(1),
  capturarFoto(2)
]).then(([fotoProducto, fotoEmbalaje]) => {
    const producto = {
      codigo: $('codigo').value.trim(),
      referencia: $('referencia').value.trim(),
      nombre: $('nombre').value.trim(),
      proveedor: $('proveedor').value.trim(),
      categoria: $('categoria').value,
      zona: $('zona').value.trim(), // ✅ Campo agregado aquí
      descripcion: $('descripcion').value.trim(),
      cantidad: parseInt($('cantidad').value) || 0,
      cajas: parseInt($('cajas').value) || 0,
      precioOriginal: parseFloat($('precioOriginal').value) || 0,
      tasa: parseFloat($('tasa').value) || 1,
      precioCosto: parseFloat($('precioCosto').value) || 0,
      precioVenta: parseFloat($('precioVenta').value) || 0,
      stock: parseInt($('stock').value) || 0,
      fotoProducto,
      fotoEmbalaje
    };
    

  const esEdicion = $('productIndex').value;

    const tx = db.transaction('productos', 'readwrite');
    tx.objectStore('productos').put(producto);
    tx.oncomplete = () => {
      console.log('✅ Producto guardado, ocultando formulario...');
      alert(esEdicion ? 'Producto actualizado con éxito' : 'Producto guardado con éxito');
      
      $('productIndex').value = '';
      $('addScreen').classList.add('hidden');  // Oculta el formulario
      $('nav').classList.remove('hidden');     // Muestra los botones principales
     
      resetForm();
    };

    tx.onerror = () => alert('Error al guardar el producto');
  });
}

function resetForm() {
  
  // Limpiar formulario
  $('productForm')?.reset();

  // Restaurar el título
  $('tituloFormulario').textContent = 'Añadir Producto';

  // Limpiar miniaturas de imagen
  document.querySelectorAll('img[id^="preview"]').forEach(img => {
    img.removeAttribute('src');
  });

  // Limpiar archivos de tipo file
  document.querySelectorAll('input[type="file"]').forEach(input => {
    input.value = '';
  });

  // Limpiar el campo oculto de edición
  $('productIndex').value = '';

  

  
}

function cancelarOperacion() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav').classList.remove('hidden');
  $('productForm')?.reset(); // Opcional: limpia los campos si estás en el formulario
  $('tituloFormulario').textContent = 'Añadir Producto';
}

function cancelarBusqueda() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav').classList.remove('hidden');
  $('buscarInput').value = '';
  $('resultados').innerHTML = '';
}
function cancelarStock() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav').classList.remove('hidden');
  $('buscarStock').value = '';
  $('stockResultado').innerHTML = '';
}


function cargarCategorias() {
  const tx = db.transaction('categorias', 'readonly');
  const store = tx.objectStore('categorias');
  const request = store.getAll();

  request.onsuccess = () => {
    categorias = request.result.map(cat => cat.nombre);
    const select = $('categoria');
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

function showScreen(pantallaId) {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $(pantallaId + 'Screen').classList.remove('hidden');
}

// ===========================
// CÁLCULOS AUTOMÁTICOS
// ===========================
function calcularStock() {
  const cantidad = parseInt($('cantidad').value);
  const cajas = parseInt($('cajas').value);
  if (!isNaN(cantidad) && !isNaN(cajas)) {
    const stock = cantidad * cajas;
    $('stock').value = stock;
  }
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

function mostrarPantallaAddSinReset() {
  showScreen('add'); // Usa tu función genérica
  $('nav').classList.add('hidden');
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
        prod.codigo.toLowerCase().includes(consulta) ||
        prod.nombre.toLowerCase().includes(consulta)
      );
    });

    if (resultados.length === 0) {
      contenedor.innerHTML = '<p>No se encontraron productos.</p>';
      return;
    }

    // ✅ Usa la nueva función de renderizado
    renderizarResultados(resultados);
  };

  request.onerror = () => {
    contenedor.innerHTML = '<p>Error al buscar productos.</p>';
  };
}

function renderizarResultados(resultados) {
  const contenedor = document.getElementById('resultados');
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
    btnEditar.classList.add('editar-btn'); // Estilo
    btnEditar.onclick = () => editarProducto(prod.codigo);
    acciones.appendChild(btnEditar);

    const btnEliminar = document.createElement('button');
    btnEliminar.textContent = '🗑️';
     btnEliminar.classList.add('eliminar-btn'); // Estilo
    btnEliminar.onclick = () => confirmarEliminar(prod.codigo);
    acciones.appendChild(btnEliminar);

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

    // Mostrar pantalla de edición
    
    mostrarPantallaAddSinReset();
    $('tituloFormulario').textContent = 'Editar Producto';


    // Llenar campos del formulario
    $('codigo').value = producto.codigo;
    $('referencia').value = producto.referencia;
    $('nombre').value = producto.nombre;
    $('proveedor').value = producto.proveedor;
    $('categoria').value = producto.categoria;
    $('zona').value = producto.zona;
    $('descripcion').value = producto.descripcion;
    $('cantidad').value = producto.cantidad;
    $('cajas').value = producto.cajas;
    $('precioOriginal').value = producto.precioOriginal;
    $('tasa').value = producto.tasa;
    $('precioCosto').value = producto.precioCosto;
    $('precioVenta').value = producto.precioVenta;
    $('stock').value = producto.stock;

    // Mostrar imágenes si existen
    if (producto.fotoProducto) {
      const blob1 = new Blob([new Uint8Array(producto.fotoProducto)], { type: 'image/jpeg' });
      $('preview1').src = URL.createObjectURL(blob1);
    }
    if (producto.fotoEmbalaje) {
      const blob2 = new Blob([new Uint8Array(producto.fotoEmbalaje)], { type: 'image/jpeg' });
      $('preview2').src = URL.createObjectURL(blob2);
    }

    // Guardar código en un input hidden para saber si se está editando
    $('productIndex').value = producto.codigo;
  };
}

// ===========================
// ACTUALIZAR EN LUGAR DE CREAR
// ===========================


// Mostrar/ocultar menú
document.addEventListener('click', e => {
  const toggle = e.target.closest('.dropdown-toggle');
  const menu = document.querySelector('.dropdown-menu');
  if (toggle) {
    menu.classList.toggle('hidden');
  } else if (!e.target.closest('.dropdown-backup')) {
    menu.classList.add('hidden');
  }
});

function exportarBackup() {
  const tx = db.transaction(['productos', 'categorias', 'movimientos'], 'readonly');
  const productosStore = tx.objectStore('productos');
  const categoriasStore = tx.objectStore('categorias');
  const movimientosStore = tx.objectStore('movimientos');

  const productosReq = productosStore.getAll();
  const categoriasReq = categoriasStore.getAll();
  const movimientosReq = movimientosStore.getAll();

  tx.oncomplete = () => {
    const backup = {
      fecha: new Date().toISOString(),
      productos: productosReq.result,
      categorias: categoriasReq.result,
      movimientos: movimientosReq.result // ✅ se agrega el historial
    };

    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fecha = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `backup-inventario-${fecha}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
}

function importarBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);

      const tx = db.transaction(['productos', 'categorias', 'movimientos'], 'readwrite');
      const productosStore = tx.objectStore('productos');
      const categoriasStore = tx.objectStore('categorias');
      const movimientosStore = tx.objectStore('movimientos');

      productosStore.clear();
      categoriasStore.clear();
      movimientosStore.clear();

      backup.categorias?.forEach(cat => {
        categoriasStore.put(cat);
      });

      backup.productos?.forEach(prod => {
        productosStore.put(prod);
      });

      backup.movimientos?.forEach(mov => {
        movimientosStore.put(mov);
      });

      tx.oncomplete = () => {
        alert('✅ Copia importada con éxito');
        cargarCategorias();
        if (typeof buscarProductos === 'function') buscarProductos();
      };

      tx.onerror = () => alert('❌ Error al importar');
    } catch (err) {
      alert('❌ Archivo inválido');
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

function confirmarEliminar(codigo) {
  if (confirm("¿Estás seguro de eliminar el producto con código: " + codigo + "?")) {
    const tx = db.transaction('productos', 'readwrite');
    const store = tx.objectStore('productos');
    store.delete(codigo);

    tx.oncomplete = () => {
      alert("Producto eliminado: " + codigo);
      buscarProductos(); // Actualiza la lista después de eliminar
    };

    tx.onerror = () => {
      alert("Ocurrió un error al intentar eliminar el producto.");
    };
  }
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
  document.getElementById('imagenAmpliada').src = "";
}

function mostrarPopupMovimiento(texto, tipo = 'exito') {
  const popup = document.getElementById('popupMovimiento');
  popup.textContent = texto;
  popup.className = `popup show ${tipo}`;

  setTimeout(() => {
    popup.classList.remove('show');
  }, 3500);
}


