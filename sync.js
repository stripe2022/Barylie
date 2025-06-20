// === CONEXIÓN SUPABASE ===
const SUPABASE_URL = 'https://fzopqkxxueprkppfgypw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b3Bxa3h4dWVwcmtwcGZneXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTg4MTQsImV4cCI6MjA2NTgzNDgxNH0.AMXqVIOmo8rqlxrqNWjmXiEp72kqLbIWQjke9bZ12Qg';

// === SUBIR PRODUCTOS ===
async function subirProductosIndexedDBaSupabase() {
  const db = await abrirIndexedDB();

  const productosLocales = await obtenerTodosDeIndexedDB(db, 'productos');

  const resExistentes = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?select=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  
  const productosEnSupabase = await resExistentes.json();
  

try {
  const resExistentes = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?select=id,codigo,nombre`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  const data = await resExistentes.json();

  if (!Array.isArray(data)) {
    console.error('❌ Supabase respondió con algo inesperado:', data);
    throw new Error('Respuesta no válida de Supabase al obtener productos');
  }

  productosEnSupabase = data;
} catch (error) {
  console.error('❌ Error al obtener productos de Supabase:', error);
  return; // Detener la función para evitar errores mayores
}


  for (const prod of productosLocales) {
    if (!prod.id) {
      prod.id = crypto.randomUUID();
      const tx = db.transaction('productos', 'readwrite');
      tx.objectStore('productos').put(prod);
    }

    const yaExiste = productosEnSupabase.some(p =>
      p.id === prod.id || p.codigo === prod.codigo || p.nombre === prod.nombre
    );
    if (yaExiste) continue;

    if (!prod.updated_at) prod.updated_at = new Date().toISOString();

    const prodSupabase = {
      id: prod.id,
      codigo: prod.codigo || '',
      nombre: prod.nombre,
      precio_costo: prod.precioCosto,
      precio_venta: prod.precioVenta,
      stock: prod.stock,
      updated_at: prod.updated_at
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([prodSupabase])
      });

      if (!res.ok) throw new Error(await res.text());

      prod.subido = true;
      const tx = db.transaction('productos', 'readwrite');
      tx.objectStore('productos').put(prod);

      console.log(`✅ Producto ${prod.nombre} sincronizado.`);
    } catch (err) {
      console.error(`❌ Error al subir producto ${prod.nombre}:`, err);
    }
  }

  alert('✅ Sincronización de productos completada.');
}

// === SUBIR MOVIMIENTOS ===
async function subirMovimientosIndexedDBaSupabase() {
  const db = await abrirIndexedDB();

  const movimientosLocales = await obtenerTodosDeIndexedDB(db, 'movimientos');

  const resMovsExistentes = await fetch(`${SUPABASE_URL}/rest/v1/stock_movements?select=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  const idsMovsEnSupabase = (await resMovsExistentes.json()).map(m => m.id);

  for (const mov of movimientosLocales) {
    if (!mov.id) continue;
    if (mov.subido || idsMovsEnSupabase.includes(mov.id)) continue;

    // ✅ Verificar si el producto fue importado (si usas esa lógica)
    const producto = await obtenerProductoPorId(db, mov.producto_id);
    if (producto?.source === 'import') {
      console.log(`⏩ Movimiento ignorado (producto importado): ${mov.id}`);
      continue;
    }

    const movToSend = {
      id: mov.id,
      producto_id: mov.producto_id,
      tipo: mov.tipo,
      cantidad: parseFloat(mov.cantidad || 1),
      nota: mov.nota,
      created_at: mov.created_at || new Date().toISOString()
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/stock_movements`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([movToSend])
      });

      if (!res.ok) throw new Error(await res.text());

      mov.subido = true;
      const tx = db.transaction('movimientos', 'readwrite');
      tx.objectStore('movimientos').put(mov);

      console.log(`📤 Movimiento ${mov.nombre || mov.codigo} sincronizado.`);
    } catch (err) {
      console.error(`❌ Error al subir movimiento ${mov.nombre || mov.codigo}:`, err);
    }
  }

  alert('✅ Sincronización de movimientos finalizada.');
}

// === FUNCIONES AUXILIARES ===
async function abrirIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('inventarioDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('❌ No se pudo abrir IndexedDB');
  });
}

async function obtenerTodosDeIndexedDB(db, storeName) {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function obtenerProductoPorId(db, id) {
  return new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

// === SINCRONIZACIÓN GLOBAL ===
async function sincronizarTodo() {
  await subirProductosIndexedDBaSupabase();
  await subirMovimientosIndexedDBaSupabase();
}

window.sincronizarTodo = sincronizarTodo;
