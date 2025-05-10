// ==========================
// VARIABLES GLOBALES
// ==========================
let productos = JSON.parse(localStorage.getItem('productos') || '[]');
let categorias = JSON.parse(localStorage.getItem('categorias') || '[]');
let currentStream = null;

const $ = id => document.getElementById(id);

// ==========================
// INICIALIZACIÓN
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  cargarCategorias();
  buscarProductos();

  $('precioOriginal')?.addEventListener('input', calcularPreciosAutomáticamente);
  $('tasa')?.addEventListener('input', calcularPreciosAutomáticamente);
  $('cantidad')?.addEventListener('input', () => {
    calcularPreciosAutomáticamente();
    calcularStock();
  });
  $('cajas')?.addEventListener('input', calcularStock);
});

// ==========================
// FUNCIONES DE CÁLCULO
// ==========================
function calcularPreciosAutomáticamente() {
  const precioOriginal = parseFloat($('precioOriginal').value);
  const tasa = parseFloat($('tasa').value);
  const cantidad = parseFloat($('cantidad').value);

  if (!isNaN(precioOriginal) && !isNaN(tasa) && !isNaN(cantidad) && cantidad !== 0) {
    const pcs = precioOriginal / cantidad;
    const precioCosto = pcs * tasa * 2;
    const precioVenta = precioCosto * 1.3;

    $('precioCosto').value = precioCosto.toFixed(2);
    $('precioVenta').value = precioVenta.toFixed(2);
  } else {
    $('precioCosto').value = '';
    $('precioVenta').value = '';
  }
}

function calcularStock() {
  const cajas = parseFloat($('cajas').value);
  const cantidad = parseFloat($('cantidad').value);

  if (!isNaN(cajas) && !isNaN(cantidad)) {
    $('stock').value = cajas * cantidad;
  } else {
    $('stock').value = '';
  }
}

// ==========================
// CRUD DE CATEGORÍAS
// ==========================
function addCategoria() {
  const nueva = $('nuevaCategoria').value.trim();
  if (nueva && !categorias.includes(nueva)) {
    categorias.push(nueva);
    localStorage.setItem('categorias', JSON.stringify(categorias));
    cargarCategorias();
    $('nuevaCategoria').value = '';
  }
}

function cargarCategorias() {
  const sel = $('categoria');
  sel.innerHTML = categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

// ==========================
// MANEJO DE PRODUCTOS
// ==========================
function resetForm() {
  $('productForm').reset();
  $('preview').src = '';
  $('productIndex').value = '';
}

$('productForm').onsubmit = e => {
  e.preventDefault();
  const index = $('productIndex').value;
  const producto = {
    id: index ? productos[index].id : Date.now(),
    codigo: $('codigo').value,
    nombre: $('nombre').value,
    categoria: $('categoria').value,
    descripcion: $('descripcion').value,
    cantidad: parseInt($('cantidad').value),
    precioCosto: parseFloat($('precioCosto').value),
    precioVenta: parseFloat($('precioVenta').value),
    foto: $('preview').src
  };
  if (index) productos[index] = producto;
  else productos.push(producto);
  localStorage.setItem('productos', JSON.stringify(productos));
  alert('Producto guardado');
  resetForm();
};

function buscarProductos() {
  const q = $('buscarInput').value.toLowerCase();
  const res = productos.filter(p =>
    p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)
  );
  $('resultados').innerHTML = res.map((p, i) => `
    <div class="product-card">
      <img src="${p.foto}" />
      <strong>${p.nombre}</strong> (${p.codigo})<br>
      ${p.categoria} - ${p.descripcion}<br>
      Cant: ${p.cantidad} | $${p.precioCosto} → $${p.precioVenta}<br>
      <button onclick="editarProducto(${i})">Editar</button>
      <button onclick="borrarProducto(${i})">Borrar</button>
    </div>
  `).join('');
}

function editarProducto(i) {
  const p = productos[i];
  $('codigo').value = p.codigo;
  $('nombre').value = p.nombre;
  $('categoria').value = p.categoria;
  $('descripcion').value = p.descripcion;
  $('cantidad').value = p.cantidad;
  $('precioCosto').value = p.precioCosto;
  $('precioVenta').value = p.precioVenta;
  $('preview').src = p.foto;
  $('productIndex').value = i;
  showScreen('add');
}

function borrarProducto(i) {
  if (confirm("¿Seguro de borrar?")) {
    productos.splice(i, 1);
    localStorage.setItem('productos', JSON.stringify(productos));
    buscarProductos();
  }
}

// ==========================
// MANEJO DE VISTAS
// ==========================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $(id + 'Screen').classList.remove('hidden');
}

// ==========================
// CÁMARA Y ESCÁNER QR
// ==========================
function scanCode() {
  const html5QrCode = new Html5Qrcode("reader");
  const config = {
    fps: 10,
    qrbox: 250,
    facingMode: "user"
  };

  $('reader').style.display = "block";

  html5QrCode.start(
    { facingMode: "user" },
    config,
    (decodedText) => {
      $('result').innerText = `Código escaneado: ${decodedText}`;
      html5QrCode.stop();
      $('reader').style.display = "none";
    },
    (errorMessage) => {
      console.warn(`Error escaneando: ${errorMessage}`);
    }
  ).catch(err => {
    console.error("Fallo al iniciar el escaneo", err);
  });
}

function capturePhoto() {
  const modal = $('cameraModal');
  const video = $('video');
  modal.classList.remove('hidden');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
    .then(stream => {
      currentStream = stream;
      video.srcObject = stream;
    });
}

function takePhoto() {
  const video = $('video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  $('preview').src = canvas.toDataURL('image/jpeg');
  closeCamera();
}

function closeCamera() {
  $('cameraModal').classList.add('hidden');
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
            }
