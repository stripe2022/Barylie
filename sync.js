// === CONEXIÓN SUPABASE ===
// ⚠️ Sustituye estas constantes por variables de entorno en producción
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
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/productos_stock?select=id,nombre,codigo,updated_at`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  if (!res.ok) throw new Error('❌ Error obteniendo productos remotos');
  return res.json();
}

// === SUBIR / ACTUALIZAR PRODUCTOS ===
async function subirProductosIndexedDBaSupabase() {
  const db = await openDB();

  const productosLocales = await new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    tx.objectStore('productos').getAll().onsuccess = e => resolve(e.target.result ?? []);
  });

  const productosRemotos = await getProductosRemotos();

  for (const prod of productosLocales) {
    // 1️⃣ Validar UUID
    if (!/^[0-9a-f-]{36}$/.test(prod.id)) {
      console.warn('🚫 ID inválido, se ignora', prod);
      continue;
    }

    // 2️⃣ Buscar remoto por id
    const remoto = productosRemotos.find(p => p.id === prod.id);

    // 3️⃣ Conflicto de nombre
    if (remoto && remoto.nombre !== prod.nombre) {
      console.warn(`⚠️ Conflicto de nombre para id ${prod.id}: "${remoto.nombre}" ≠ "${prod.nombre}"`);
      continue; // no sobrescribas identidades distintas
    }

    // 4️⃣ Si remoto existe y está más actualizado, omite
    if (
      remoto &&
      remoto.updated_at &&
      prod.updated_at &&
      new Date(remoto.updated_at) >= new Date(prod.updated_at)
    ) {
      continue;
    }

    // 5️⃣ Si remoto no existe, comprueba duplicado por código o nombre
    if (!remoto) {
      const dup = productosRemotos.some(p => p.codigo === prod.codigo || p.nombre === prod.nombre);
      if (dup) {
        console.warn(`⏩ Duplicado por código/nombre: "${prod.codigo}" / "${prod.nombre}"`);
        continue;
      }
    }

    // 6️⃣ Preparar datos
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

    // 7️⃣ Upsert en Supabase
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/productos_stock?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      console.error(`❌ Error subiendo ${prod.nombre}:`, await res.text());
      continue;
    }

    // 8️⃣ Marca como subido
    prod.subido = true;
    db.transaction('productos', 'readwrite').objectStore('productos').put(prod);

    console.log(`✅ Sincronizado ${prod.nombre}`);
  }

  alert('✅ Sincronización de productos finalizada.');
}

// === FUNCIÓN MAESTRA ===
async function sincronizarTodo() {
  try {
    console.log('🔄 Iniciando sincronización...');
    await subirProductosIndexedDBaSupabase();
    console.log('✅ Sincronización completada.');
  } catch (err) {
    console.error('❌ Error general durante la sincronización:', err);
    alert('❌ Error durante la sincronización. Revisa consola.');
  }
}
