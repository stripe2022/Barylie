// === CONEXIÓN BÁSICA TESTEO SUPABASE ===

const SUPABASE_URL = 'https://fzopqkxxueprkppfgypw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b3Bxa3h4dWVwcmtwcGZneXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTg4MTQsImV4cCI6MjA2NTgzNDgxNH0.AMXqVIOmo8rqlxrqNWjmXiEp72kqLbIWQjke9bZ12Qg';

// === SUBIR PRODUCTOS DESDE INDEXEDDB A SUPABASE ===
async function subirProductosIndexedDBaSupabase() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('inventarioDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('No se pudo abrir IndexedDB');
  });

  const productosLocales = await new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  const resExistentes = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?select=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  const idsEnSupabase = (await resExistentes.json()).map(p => p.id);

  for (const prod of productosLocales) {
    if (prod.subido || idsEnSupabase.includes(prod.id)) continue;

    if (!prod.id) prod.id = crypto.randomUUID();
    if (!prod.updated_at) prod.updated_at = new Date().toISOString();

    const prodSupabase = {
      id: prod.id,
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

      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) throw new Error(JSON.stringify(data));

      prod.subido = true;
      const tx = db.transaction('productos', 'readwrite');
      tx.objectStore('productos').put(prod);

      console.log(`✅ Producto ${prod.nombre} sincronizado.`);
    } catch (err) {
      console.error(`❌ Error al subir producto ${prod.nombre}:`, err);
    }
  }

  alert('✅ Sincronización de productos finalizada. Revisa consola.');
}

// === SUBIR MOVIMIENTOS DESDE INDEXEDDB A SUPABASE ===
async function subirMovimientosIndexedDBaSupabase() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('inventarioDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('No se pudo abrir IndexedDB');
  });

  const movimientosLocales = await new Promise(resolve => {
    const tx = db.transaction('movimientos', 'readonly');
    const store = tx.objectStore('movimientos');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

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

    const movToSend = {
      ...mov,
      cantidad: parseFloat(mov.cantidad || 1),
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

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

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

window.subirProductosIndexedDBaSupabase = subirProductosIndexedDBaSupabase;
window.subirMovimientosIndexedDBaSupabase = subirMovimientosIndexedDBaSupabase;

async function sincronizarTodo() {
  await subirProductosIndexedDBaSupabase();
  await subirMovimientosIndexedDBaSupabase();
}

window.sincronizarTodo = sincronizarTodo;
