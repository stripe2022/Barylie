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

function guardarProducto(e) {
  e.preventDefault();

  capturarFoto().then(fotoInt64 => {
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
      foto: fotoInt64
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
  $('productForm').reset();
  $('preview').src = '';
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

// ===========================
// FOTO A BASE64 INT64 (COMPRESIÓN)
// ===========================
function capturarFoto() {
  return new Promise(resolve => {
    const img = $('preview');
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
