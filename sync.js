// === CONEXIÓN SUPABASE ===
const SUPABASE_URL = 'https://fzopqkxxueprkppfgypw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b3Bxa3h4dWVwcmtwcGZneXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTg4MTQsImV4cCI6MjA2NTgzNDgxNH0.AMXqVIOmo8rqlxrqNWjmXiEp72kqLbIWQjke9bZ12Qg';

// === HELPERS ===
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('inventarioDB');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject('No se pudo abrir IndexedDB');
  });
}

async function getProductosRemotos() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?select=id,nombre,codigo,updated_at`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error('❌ Error obteniendo productos remotos');
  return res.json();
}

// === SUBIR / ACTUALIZAR PRODUCTOS ===
async function subirProductosIndexedDBaSupabase() {
  const db = await openDB();
  const productosLocales = await new Promise(r => {
    const tx = db.transaction('productos', 'readonly');
    tx.objectStore('productos').getAll().onsuccess = e => r(e.target.result ?? []);
  });
  const productosRemotos = await getProductosRemotos();

  for (const prod of productosLocales) {
    if (!/^[0-9a-f-]{36}$/.test(prod.id)) continue;
    const remoto = productosRemotos.find(p => p.id === prod.id);
    if (remoto && remoto.nombre !== prod.nombre) continue;
    if (remoto && remoto.updated_at && prod.updated_at && new Date(remoto.updated_at) >= new Date(prod.updated_at)) continue;
    if (!remoto) {
      const dup = productosRemotos.some(p => p.codigo === prod.codigo || p.nombre === prod.nombre);
      if (dup) continue;
    }
    if (!prod.updated_at) prod.updated_at = new Date().toISOString();

    const payload = [{
      id: prod.id,
      codigo: prod.codigo ?? '',
      nombre: prod.nombre,
      precio_costo: prod.precioCosto,
      precio_venta: prod.precioVenta,
      stock: prod.stock,
      updated_at: prod.updated_at
    }];

    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error(`❌ Error subiendo ${prod.nombre}:`, await res.text());
      continue;
    }

    prod.subido = true;
    db.transaction('productos', 'readwrite').objectStore('productos').put(prod);
  }

  console.log('✅ Productos sincronizados');
}

// === SUBIR MOVIMIENTOS ===
async function subirMovimientosIndexedDBaSupabase() {
  const db = await openDB();
  const movimientosLocales = await new Promise(r => {
    const tx = db.transaction('movimientos', 'readonly');
    tx.objectStore('movimientos').getAll().onsuccess = e => r(e.target.result ?? []);
  });

  const pendientes = movimientosLocales.filter(m => !m.subido);
  if (pendientes.length === 0) {
    console.log('ℹ️ No hay movimientos nuevos que subir');
    return;
  }

  let subidos = 0;

  // helper para subir stock actualizado de un producto
  async function patchStockSupabase(productoId) {
    return new Promise(resolve => {
      const tx = db.transaction('productos', 'readonly');
      const req = tx.objectStore('productos').get(productoId);
      req.onsuccess = async () => {
        const prod = req.result;
        if (!prod) return resolve(false);
        try {
          const patch = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?id=eq.${productoId}`, {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ stock: prod.stock, updated_at: new Date().toISOString() })
          });
          resolve(patch.ok);
        } catch {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    });
  }

  for (const mov of pendientes) {
    if (!/^[0-9a-f-]{36}$/.test(mov.id) || !/^[0-9a-f-]{36}$/.test(mov.producto_id)) {
      console.warn('⏩ Movimiento ignorado por datos inválidos:', mov);
      continue;
    }

    const movObj = {
      id: mov.id,
      producto_id: mov.producto_id,
      tipo: mov.tipo,
      cantidad: mov.cantidad,
      created_at: mov.created_at ?? new Date().toISOString(),
      nota: mov.nota ?? ''
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/stock_movements?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([movObj])
      });

      if (!res.ok) {
        console.error('❌ Error subiendo movimiento', movObj, await res.text());
        continue;
      }

      const tx = db.transaction('movimientos', 'readwrite');
      tx.objectStore('movimientos').put({ ...mov, subido: true });
      subidos++;
      // 5️⃣ Patch stock del producto correspondiente
      await patchStockSupabase(mov.producto_id);
    } catch (err) {
      console.error('❌ Fetch failed para movimiento', movObj, err);
    }
  }

  console.log(`✅ Movimientos sincronizados: ${subidos}/${pendientes.length}`);
}

// === FUNCIÓN MAESTRA ===
async function sincronizarTodo() {
  try {
    console.log('🔄 Iniciando sincronización...');
    await subirProductosIndexedDBaSupabase();
    await subirMovimientosIndexedDBaSupabase();
    console.log('✅ Sincronización completada.');
  } catch (err) {
    console.error('❌ Error general durante la sincronización:', err);
    alert('❌ Error durante la sincronización. Revisa consola.');
  }
}
