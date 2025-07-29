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
  
  // ✅ Registrar Service Worker y mostrar alerta cuando esté listo offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('✅ Service Worker registrado'))
      .catch(err => console.error('❌ Error al registrar SW:', err));

    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.tipo === 'offline-listo') {
        mostrarBanner('✅ App lista para funcionar sin conexión', '#4caf50');
      }
      if (event.data?.tipo === 'offline-error') {
        mostrarBanner('❌ Error al cachear archivos: ' + event.data.mensaje, '#f44336');
      }
    });
  }
});

// ✅ Muestra un banner informativo en la parte inferior
function mostrarBanner(texto, bgColor = '#333') {
  const banner = document.createElement('div');
  banner.textContent = texto;
  banner.style.position = 'fixed';
  banner.style.bottom = '20px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.backgroundColor = bgColor;
  banner.style.color = '#fff';
  banner.style.padding = '12px 24px';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  banner.style.zIndex = '9999';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
}

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
    mostrarTotalProductos();
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
  cargarSelectorBusqueda(); 
  mostrarTotalProductos(); 
}

function activarPantallaStock() {
  ocultarTodasLasPantallas();
  $('stockScreen').classList.remove('hidden');
  $('buscarStock').value = '';
  $('stockResultado').innerHTML = '';

   mostrarTotalProductos(); 
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
      zona: $('zona').value.trim(),
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
    const store = tx.objectStore('productos');

    if (esEdicion) {
      // Obtener el producto original antes de sobrescribirlo
      const txGet = db.transaction('productos', 'readonly');
      const storeGet = txGet.objectStore('productos');
      const getRequest = storeGet.get(producto.codigo);

      getRequest.onsuccess = () => {
        const original = getRequest.result || {};
        const cambios = [];

        if (original.stock !== producto.stock) {
          cambios.push(`Stock: ${original.stock} → ${producto.stock}`);
        }
        if (original.precioCosto !== producto.precioCosto) {
          cambios.push(`Costo: ${original.precioCosto} → ${producto.precioCosto}`);
        }
        if (original.precioVenta !== producto.precioVenta) {
          cambios.push(`Venta: ${original.precioVenta} → ${producto.precioVenta}`);
        }

        const nota = cambios.length > 0
          ? 'Cambios: ' + cambios.join(', ')
          : 'Edición sin cambios relevantes';

          // ✅ Crear transacción justo aquí para guardar el producto
    const tx = db.transaction(['productos', 'movimientos'], 'readwrite');
    const store = tx.objectStore('productos');
    store.put(producto);

        // Guardar el producto editado
        store.put(producto);

        // Registrar movimiento de edición
        const txMov = db.transaction('movimientos', 'readwrite');
        txMov.objectStore('movimientos').add({
          tipo: 'edicion',
          codigo: producto.codigo,
          cantidad: 0,
          fecha: new Date().toISOString(),
          motivo: nota,
          usuario: 'admin'
        });

        tx.oncomplete = () => {
          alert('Producto actualizado con éxito');
          resetForm();
          mostrarTotalProductos();

          $('addScreen').classList.add('hidden');
          $('searchScreen').classList.remove('hidden');
          if (typeof buscarProductos === 'function') buscarProductos();
          $('buscarInput')?.focus();
          $('productIndex').value = '';
        };

        tx.onerror = () => alert('Error al guardar el producto');
      };

      getRequest.onerror = () => {
        alert('❌ No se pudo obtener el producto original para comparar.');
      };

    } else {
      // Guardar producto nuevo
      store.put(producto);

      // Registrar movimiento de nuevo producto
      const txMov = db.transaction('movimientos', 'readwrite');
      txMov.objectStore('movimientos').add({
        tipo: 'registro',
        codigo: producto.codigo,
        cantidad: producto.stock || 0,
        fecha: new Date().toISOString(),
        motivo: 'Registro de nuevo producto',
        usuario: 'admin'
      });

      tx.oncomplete = () => {
        alert('Producto guardado con éxito');
        resetForm();
        mostrarTotalProductos();

        $('addScreen').classList.add('hidden');
        $('nav').classList.remove('hidden');
        $('productIndex').value = '';
      };

      tx.onerror = () => alert('Error al guardar el producto');
    }
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

function registrarSalida(codigo, cantidad, motivo = 'venta') {
  const movimiento = {
    tipo: 'salida',
    codigo,
    cantidad,
    fecha: new Date().toISOString(),
    motivo,
    usuario: 'admin' // o el usuario real
  };

  const tx = db.transaction('movimientos', 'readwrite');
  tx.objectStore('movimientos').add(movimiento);

  tx.oncomplete = () => {
    mostrarPopupMovimiento('✅ Salida registrada', 'exito');
  };
  tx.onerror = () => {
    mostrarPopupMovimiento('❌ Error al registrar salida', 'error');
  };
}


function cancelarOperacion() {
  const esEdicion = $('productIndex').value;

  document.querySelectorAll('.screen').forEach(sec => sec.classList.add('hidden'));

  if (esEdicion) {
    // Volver a búsqueda
    $('searchScreen').classList.remove('hidden');
    $('tituloFormulario').textContent = 'Añadir Producto';
    $('productForm')?.reset();
    $('productIndex').value = '';
  } else {
    // Volver al menú principal
    $('nav').classList.remove('hidden');
    $('productForm')?.reset();
  }
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

function registrarSalida(codigo, cantidad, motivo = 'venta') {
  const tx = db.transaction(['productos', 'movimientos'], 'readwrite');
  const productosStore = tx.objectStore('productos');
  const movimientosStore = tx.objectStore('movimientos');

  const productoReq = productosStore.get(codigo);
  productoReq.onsuccess = () => {
    const producto = productoReq.result;
    if (!producto) {
      alert('❌ Producto no encontrado');
      return;
    }

    if (producto.stock < cantidad) {
      alert('❌ Stock insuficiente');
      return;
    }

    // 1. Actualizar stock
    producto.stock -= cantidad;
    productosStore.put(producto);

    // 2. Registrar movimiento
    const movimiento = {
      tipo: 'salida',
      codigo,
      cantidad,
      fecha: new Date().toISOString(),
      motivo,
      usuario: 'admin'
    };
    movimientosStore.add(movimiento);

    tx.oncomplete = () => {
      mostrarPopupMovimiento('✅ Salida registrada', 'exito');
      mostrarTotalProductos(); // Actualiza contador
      if (typeof buscarProductos === 'function') buscarProductos(); // Refresca vista
    };

    tx.onerror = () => {
      alert('❌ Error al registrar salida');
    };
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

    const btnInfo = document.createElement('button');
    btnInfo.textContent = 'ℹ️ Info';
    btnInfo.classList.add('info-btn');
    btnInfo.onclick = () => verInfoProducto(prod);
    acciones.appendChild(btnInfo);


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

function generarCodigoAutomatico() {
  return 'P' + Date.now() + Math.floor(Math.random() * 1000);
}



function confirmarImportacion(event) {
  const fileInput = event.target;
  const borrarTodo = confirm("¿Deseas borrar todos los datos actuales antes de importar?\n\nAceptar = Reemplazar todo\nCancelar = Fusionar con lo existente");
  
  importarBackup(event, borrarTodo);

  // ✅ Esto permite volver a seleccionar el mismo archivo después
  fileInput.value = '';
}



 async function exportarBackup() {
  try {
    const productos = await new Promise(resolve => {
      const lista = [];
      const tx = db.transaction('productos', 'readonly');
      const store = tx.objectStore('productos');
      const cursor = store.openCursor();

      cursor.onsuccess = e => {
        const cur = e.target.result;
        if (cur) {
          const prod = cur.value;
          if (!prod.codigo || prod.codigo.trim() === '') {
            prod.codigo = 'P' + Date.now() + '-' + lista.length;
          }
          lista.push(prod);
          cur.continue();
        } else {
          resolve(lista);
        }
      };

      cursor.onerror = () => {
        console.error('Error leyendo productos');
        resolve([]);
      };
    });

    const categorias = await new Promise(res => {
      const tx = db.transaction('categorias', 'readonly');
      tx.objectStore('categorias').getAll().onsuccess = e => res(e.target.result);
    });

    // ✅ Obtener y agrupar movimientos por tipo
    const movimientos = await new Promise(resolve => {
      const agrupados = {
        entrada: [],
        salida: [],
        registro: [],
        edicion: [],
        otros: []
      };

      const tx = db.transaction('movimientos', 'readonly');
      const store = tx.objectStore('movimientos');
      const cursor = store.openCursor();

      cursor.onsuccess = e => {
        const cur = e.target.result;
        if (cur) {
          const mov = cur.value;
          if (mov.tipo && agrupados[mov.tipo]) {
            agrupados[mov.tipo].push(mov);
          } else {
            agrupados.otros.push(mov);
          }
          cur.continue();
        } else {
          resolve(agrupados);
        }
      };

      cursor.onerror = () => {
        console.error('Error leyendo movimientos');
        resolve(agrupados);
      };
    });

    // ✅ Crear el objeto de respaldo
    const backup = {
      fecha: new Date().toISOString(),
      productos,
      categorias,
      movimientos // agrupados por tipo
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fecha = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `backup-inventario-${fecha}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    alert('❌ Error al exportar los datos');
    console.error(error);
  }
}



async function importarBackup(event, borrar = false) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const backup = JSON.parse(reader.result);
      console.log(`📥 Archivo importado: ${file.name}`);

      if (!backup || typeof backup !== 'object') {
        throw new Error("❌ El archivo no contiene un respaldo válido.");
      }

      const timestamp = Date.now();
      const batchSize = 100;

      if (borrar) {
        const txClear = db.transaction(['productos', 'categorias', 'movimientos'], 'readwrite');
        txClear.objectStore('productos').clear();
        txClear.objectStore('categorias').clear();
        txClear.objectStore('movimientos').clear();
        await esperar(50);
      }

      // ✅ Importar Categorías
      if (Array.isArray(backup.categorias)) {
        for (let i = 0; i < backup.categorias.length; i += batchSize) {
          const tx = db.transaction('categorias', 'readwrite');
          const store = tx.objectStore('categorias');
          backup.categorias.slice(i, i + batchSize).forEach(cat => {
            if (cat && cat.nombre) store.put(cat);
          });
          await esperar(10);
        }
      }

      // ✅ Importar Productos
      if (Array.isArray(backup.productos)) {
        for (let i = 0; i < backup.productos.length; i++) {
          const prod = backup.productos[i];
          if (!prod || typeof prod !== 'object') continue;

          if (!prod.codigo || !prod.codigo.trim()) {
            prod.codigo = 'P' + timestamp + '-' + i;
          }

          await new Promise((resolve) => {
            const tx = db.transaction('productos', 'readwrite');
            const store = tx.objectStore('productos');
            const check = store.get(prod.codigo);
            check.onsuccess = () => {
              if (check.result) {
                prod.codigo = 'P' + timestamp + '-' + i + '-' + Math.floor(Math.random() * 1000);
              }
              if (prod.nombre && prod.precioCosto >= 0) store.put(prod);
              resolve();
            };
            check.onerror = () => {
              prod.codigo = 'P' + timestamp + '-' + i + '-' + Math.floor(Math.random() * 1000);
              store.put(prod);
              resolve();
            };
          });

          await esperar(5);
        }
      }

      // ✅ Importar Movimientos (soporte para formato agrupado por tipo)
      const movimientos = backup.movimientos;
      const todosLosMovs = [];

      if (Array.isArray(movimientos)) {
        // Formato antiguo (lista plana)
        todosLosMovs.push(...movimientos);
      } else if (typeof movimientos === 'object' && movimientos !== null) {
        // Formato nuevo agrupado
        for (const tipo in movimientos) {
          if (Array.isArray(movimientos[tipo])) {
            todosLosMovs.push(...movimientos[tipo]);
          }
        }
      }

      for (let i = 0; i < todosLosMovs.length; i += batchSize) {
        const tx = db.transaction('movimientos', 'readwrite');
        const store = tx.objectStore('movimientos');
        todosLosMovs.slice(i, i + batchSize).forEach(mov => {
          if (mov && mov.tipo && ('codigo' in mov)) store.put(mov);
        });
        await esperar(10);
      }

      alert('✅ Copia importada con éxito');
      cargarCategorias();
      mostrarTotalProductos();
      if (typeof buscarProductos === 'function') buscarProductos();

    } catch (err) {
      console.error(err);
      alert('❌ Archivo inválido o error durante la importación');
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
      mostrarTotalProductos();

    };

    tx.onerror = () => {
      alert("Ocurrió un error al intentar eliminar el producto.");
    };
  }
}

function mostrarTotalProductos() {
  const tx = db.transaction('productos', 'readonly');
  const store = tx.objectStore('productos');
  const req = store.getAll();

  req.onsuccess = () => {
    const productos = req.result || [];
    document.getElementById('totalProductos').textContent = productos.length;
  };
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

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

