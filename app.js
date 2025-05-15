// app.js conectado a db.js para IndexedDB modular
import {
  abrirDB,
  guardarProducto,
  obtenerTodos,
  obtenerPorId,
  borrarPorId
} from './db.js';

let db;
const $ = id => document.getElementById(id);

// INICIALIZACIÓN

document.addEventListener('DOMContentLoaded', () => {
  abrirDB(instance => {
    db = instance;
    cargarCategorias();
    buscarProductos();
  });
});

// FORMULARIO
$('productForm').onsubmit = e => {
  e.preventDefault();
  const id = $('productIndex').value ? parseInt($('productIndex').value) : Date.now();

  const producto = {
    id,
    codigo: $('codigo').value,
    referencia: $('referencia').value,
    nombre: $('nombre').value,
    categoria: $('categoria').value,
    descripcion: $('descripcion').value,
    proveedor: $('proveedor').value,
    cantidad: parseInt($('cantidad').value),
    cajas: parseInt($('cajas').value),
    precioOriginal: parseFloat($('precioOriginal').value),
    tasa: parseFloat($('tasa').value),
    precioCosto: parseFloat($('precioCosto').value),
    precioVenta: parseFloat($('precioVenta').value),
    stock: parseFloat($('stock').value),
    foto: $('preview').src
  };

  guardarProducto(db, producto, () => {
    alert('Producto guardado');
    resetForm();
    buscarProductos();
  });
};

function buscarProductos() {
  const q = $('buscarInput')?.value.toLowerCase() || '';
  obtenerTodos(db, productos => {
    const resultados = productos.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)
    );
    $('resultados').innerHTML = resultados.map(p => `
      <div class="product-card">
        <img src="${p.foto}" />
        <strong>${p.nombre}</strong> (${p.codigo}) - Ref: ${p.referencia || '—'}<br>
        ${p.categoria} - ${p.descripcion}<br>
        Cant: ${p.cantidad} | $${p.precioCosto} → $${p.precioVenta}<br>
        <button onclick="editarProducto(${p.id})">Editar</button>
        <button onclick="borrarProducto(${p.id})">Borrar</button>
      </div>
    `).join('');
  });
}

function editarProducto(id) {
  obtenerPorId(db, id, p => {
    $('codigo').value = p.codigo;
    $('referencia').value = p.referencia || '';
    $('nombre').value = p.nombre;
    $('categoria').value = p.categoria;
    $('descripcion').value = p.descripcion;
    $('proveedor').value = p.proveedor;
    $('cantidad').value = p.cantidad;
    $('cajas').value = p.cajas;
    $('precioOriginal').value = p.precioOriginal;
    $('tasa').value = p.tasa;
    $('precioCosto').value = p.precioCosto;
    $('precioVenta').value = p.precioVenta;
    $('stock').value = p.stock;
    $('preview').src = p.foto;
    $('productIndex').value = p.id;

    calcularPreciosAutomáticamente();
    calcularStock();

    showScreen('add');
  });
}

function borrarProducto(id) {
  if (!confirm("¿Seguro de borrar?")) return;
  borrarPorId(db, id, buscarProductos);
}

function calcularPreciosAutomáticamente() {
  const precioOriginal = parseFloat($('precioOriginal').value);
  const tasa = parseFloat($('tasa').value);

  if (!isNaN(precioOriginal) && !isNaN(tasa)) {
    const precioCosto = precioOriginal * 2 * tasa;
    const precioVenta = precioCosto * 1.3;
    $('precioCosto').value = precioCosto.toFixed(2);
    $('precioVenta').value = precioVenta.toFixed(2);
  } else {
    $('precioCosto').value = '';
    $('precioVenta').value = '';
  }
}

function calcularStock() {
  const piezas = parseFloat($('cantidad').value);
  const bultos = parseFloat($('cajas').value);
  if (!isNaN(piezas) && !isNaN(bultos)) {
    $('stock').value = piezas * bultos;
  } else {
    $('stock').value = '';
  }
}

function resetForm() {
  $('productForm').reset();
  $('preview').src = '';
  $('productIndex').value = '';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $(`${id}Screen`).classList.remove('hidden');

  if (id === 'add') {
    $('precioOriginal')?.addEventListener('input', calcularPreciosAutomáticamente);
    $('tasa')?.addEventListener('input', calcularPreciosAutomáticamente);
    $('cantidad')?.addEventListener('input', () => {
      calcularPreciosAutomáticamente();
      calcularStock();
    });
    $('cajas')?.addEventListener('input', calcularStock);
  }
}

function cargarCategorias() {
  const categorias = JSON.parse(localStorage.getItem('categorias') || '[]');
  const select = $('categoria');
  if (!select) return;
  select.innerHTML = `
    <option value="" disabled selected>Selecciona una categoría</option>
    ${categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
  `;
}
