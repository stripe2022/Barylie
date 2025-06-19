// sync.js - Sincronización entre IndexedDB y Supabase (productos_stock y stock_movements) con resolución de conflictos por updated_at y usando siempre created_at

const SUPABASE_URL = 'https://fzopqkxxueprkppfgypw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b3Bxa3h4dWVwcmtwcGZneXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTg4MTQsImV4cCI6MjA2NTgzNDgxNH0.AMXqVIOmo8rqlxrqNWjmXiEp72kqLbIWQjke9bZ12Qg';

// Helper básico para fetch a Supabase REST
async function supabaseFetch(endpoint, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  }).then(r => r.json());
}

// ===== 1. SUBIR PRODUCTOS NUEVOS/MODIFICADOS =====
async function subirProductosNuevosOEditados() {
  const productosLocales = await new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  for (const prod of productosLocales) {
    if (!prod.updated_at) prod.updated_at = new Date().toISOString();
    const prodSupabase = {
      id: prod.id,
      nombre: prod.nombre,
      precio_costo: prod.precioCosto,
      precio_venta: prod.precioVenta,
      stock: prod.stock,
      updated_at: prod.updated_at
    };
    await supabaseFetch('productos_stock', {
      method: 'POST',
      body: JSON.stringify([prodSupabase]),
      headers: {
        'Prefer': 'resolution=merge-duplicates'
      }
    });
  }
}

// ===== 2. SUBIR MOVIMIENTOS NO SUBIDOS (usa created_at) =====
async function subirMovimientosPendientes() {
  const movimientosLocales = await new Promise(resolve => {
    const tx = db.transaction('movimientos', 'readonly');
    const store = tx.objectStore('movimientos');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  for (const mov of movimientosLocales) {
    if (!mov.subido) { // solo sube si no ha sido marcado como subido
      // Ya no mapeamos nada, solo usamos created_at
      await supabaseFetch('stock_movements', {
        method: 'POST',
        body: JSON.stringify([mov]),
        headers: { 'Prefer': 'resolution=merge-duplicates' }
      });
      // Marca como subido localmente
      mov.subido = true;
      const tx = db.transaction('movimientos', 'readwrite');
      tx.objectStore('movimientos').put(mov);
    }
  }
}

// ===== 3. BAJAR PRODUCTOS DE LA NUBE Y ACTUALIZAR LOCAL =====
async function bajarProductosNuevosOEditados() {
  const cloudProductos = await supabaseFetch('productos_stock?select=*');
  if (!Array.isArray(cloudProductos)) return;

  for (const prod of cloudProductos) {
    // Busca local por ID
    const local = await new Promise(res => {
      const tx = db.transaction('productos', 'readonly');
      tx.objectStore('productos').get(prod.id).onsuccess = e => res(e.target.result);
    });
    if (!local) {
      const tx = db.transaction('productos', 'readwrite');
      tx.objectStore('productos').put({
        id: prod.id,
        nombre: prod.nombre,
        precioCosto: parseFloat(prod.precio_costo),
        precioVenta: parseFloat(prod.precio_venta),
        stock: parseInt(prod.stock),
        updated_at: prod.updated_at
      });
      await new Promise(res => tx.oncomplete = res);
    } else {
      const fechaCloud = new Date(prod.updated_at || 0);
      const fechaLocal = new Date(local.updated_at || 0);
      if (fechaCloud > fechaLocal) {
        const tx = db.transaction('productos', 'readwrite');
        tx.objectStore('productos').put({
          ...local,
          nombre: prod.nombre,
          precioCosto: parseFloat(prod.precio_costo),
          precioVenta: parseFloat(prod.precio_venta),
          stock: parseInt(prod.stock),
          updated_at: prod.updated_at
        });
        await new Promise(res => tx.oncomplete = res);
      }
    }
  }
}

// ===== 4. BAJAR MOVIMIENTOS DE LA NUBE Y ACTUALIZAR LOCAL =====
async function bajarMovimientosCloud() {
  const movimientosCloud = await supabaseFetch('stock_movements?select=*');
  if (!Array.isArray(movimientosCloud)) return;
  const tx = db.transaction('movimientos', 'readwrite');
  const store = tx.objectStore('movimientos');
  for (const mov of movimientosCloud) {
    // Solo guarda/actualiza por id o created_at. Usa created_at para todo
    store.put(mov);
  }
  await new Promise(res => { tx.oncomplete = res; });
}

// ===== 5. SINCRONIZACIÓN GENERAL Y FEEDBACK =====
async function sincronizarTodo() {
  try {
    await subirProductosNuevosOEditados();
    await subirMovimientosPendientes();
    await bajarProductosNuevosOEditados();
    await bajarMovimientosCloud();
    alert('✅ Sincronización completada.');
  } catch (err) {
    alert('❌ Error durante la sincronización');
    console.error(err);
  }
}

window.sincronizarTodo = sincronizarTodo;
