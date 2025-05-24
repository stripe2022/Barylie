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
  const request = indexedDB.open('inventarioDB', 1);

  request.onupgradeneeded = function (e) {
    const db = e.target.result;
    const store = db.createObjectStore('productos', { keyPath: 'codigo' });
    store.createIndex('nombre', 'nombre', { unique: false });
    db.createObjectStore('categorias', { keyPath: 'nombre' });
  };

  request.onsuccess = function (e) {
    db = e.target.result;
    cargarCategorias();
  };

  request.onerror = function () {
    console.error('Error al abrir la base de datos');
  };
}

function ocultarTodasLasPantallas() {
  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));
  $('nav').classList.add('hidden'); // Oculta los botones principales (nav)
}

function activarPantallaAdd() {
  ocultarTodasLasPantallas();
  resetForm();
  $('buscarInput').value = '';
  $('addScreen').classList.remove('hidden');
}

function activarPantallaSearch() {
  ocultarTodasLasPantallas();
  $('buscarInput').value = '';
  $('resultados').innerHTML = '';
  $('searchScreen').classList.remove('hidden');
  $('nav').classList.remove('hidden'); // Mostrar botones si lo deseas aquí
}

function activarPantallaStock() {
  ocultarTodasLasPantallas();
  $('buscarStock').value = '';
  $('stockResultado').innerHTML = '';
  $('stockScreen').classList.remove('hidden');
  $('nav').classList.remove('hidden'); // Mostrar botones si lo deseas aquí
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
    

    const tx = db.transaction('productos', 'readwrite');
    tx.objectStore('productos').put(producto);
    tx.oncomplete = () => {
      alert('Producto guardado con éxito');
      resetForm();
    };
    tx.onerror = () => alert('Error al guardar el producto');
  });
}

function resetForm() {
  $('productForm')?.reset();
  
  $('tituloFormulario').textContent = 'Añadir Producto';

  // Limpiar cualquier imagen con id que empiece por "preview"
  document.querySelectorAll('img[id^="preview"]').forEach(img => {
    img.removeAttribute('src');
  });

  // Limpiar también los inputs de tipo file si tienen ids conocidos
  document.querySelectorAll('input[type="file"]').forEach(input => {
    input.value = '';
  });
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
function volver() {
  document.querySelectorAll(".screen").forEach(sec => sec.classList.add("hidden"));
  document.getElementById("addScreen").classList.remove("hidden");
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
      <p>🏷️ <strong>Código:</strong> ${prod.codigo}</p>
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
    btnEliminar.textContent = '🗑️ Eliminar';
     btnEliminar.classList.add('eliminar-btn'); // Estilo
    btnEliminar.onclick = () => confirmarEliminar(prod.codigo);
    acciones.appendChild(btnEliminar);

    tarjeta.appendChild(imgContainer);
    tarjeta.appendChild(info);
    tarjeta.appendChild(acciones);

    contenedor.appendChild(tarjeta);
  });
}

function volver() {
  document.querySelectorAll(".screen").forEach(sec => sec.classList.add("hidden"));
  document.getElementById("addScreen").classList.remove("hidden");
  $('buscarInput').value = '';
  $('resultados').innerHTML = '';  }

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
    
    showScreen('add'); // muestra <section id="addScreen">
    $('tituloFormulario').textContent = 'Editar Producto';


    // Llenar campos del formulario
    $('codigo').value = producto.codigo;
    $('referencia').value = producto.referencia;
    $('nombre').value = producto.nombre;
    $('proveedor').value = producto.proveedor;
    $('categoria').value = producto.categoria;
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

    // Si hay un valor en productIndex, es una edición
    const esEdicion = $('productIndex').value;

    const tx = db.transaction('productos', 'readwrite');
    tx.objectStore('productos').put(producto);
    tx.oncomplete = () => {
      alert(esEdicion ? 'Producto actualizado con éxito' : 'Producto guardado con éxito');
      resetForm();
      $('productIndex').value = '';
    };
    tx.onerror = () => alert('Error al guardar el producto');
  });
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


