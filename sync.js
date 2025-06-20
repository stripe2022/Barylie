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

  for (const prod of productosLocales) {
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
      console.log(`✅ Producto ${prod.nombre} sincronizado.`);
    } catch (err) {
      console.error(`❌ Error al subir producto ${prod.nombre}:`, err);
    }
  }

  alert('✅ Sincronización de productos finalizada. Revisa consola.');
}

// Ejecutar sincronización al cargar
subirProductosIndexedDBaSupabase();
