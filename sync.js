// === CONEXIÓN SUPABASE ===
const SUPABASE_URL = 'https://fzopqkxxueprkppfgypw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b3Bxa3h4dWVwcmtwcGZneXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTg4MTQsImV4cCI6MjA2NTgzNDgxNH0.AMXqVIOmo8rqlxrqNWjmXiEp72kqLbIWQjke9bZ12Qg';

// === SUBIR PRODUCTOS ===
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

  const resExistentes = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?select=id,codigo,nombre`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  let productosEnSupabase = [];
  try {
    productosEnSupabase = await resExistentes.json();
  } catch (e) {
    console.error('❌ Supabase respondió con algo inesperado:', e);
    alert('❌ Error al obtener productos desde Supabase');
    return;
  }

  const idsEnSupabase = productosEnSupabase.map(p => p.id);

  for (const prod of productosLocales) {
    // ⚠️ Validar ID
    if (!prod.id || !/^[0-9a-f-]{36}$/.test(prod.id)) {
      console.warn(`🚫 Producto ignorado por ID inválido:`, prod);
      continue;
    }

    const yaExiste = productosEnSupabase.some(p =>
    p.codigo === prod.codigo || p.nombre === prod.nombre
  );
  if (yaExiste) {
    console.log(`⚠️ Producto duplicado por código o nombre: ${prod.nombre}`);
    continue;
  }

    if (prod.subido || idsEnSupabase.includes(prod.id)) continue;
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

      let data = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) throw new Error(JSON.stringify(data));

      prod.subido = true;
      const tx = db.transaction('productos', 'readwrite');
      tx.objectStore('productos').put(prod);

      console.log(`✅ Producto ${prod.nombre} sincronizado.`);
    } catch (err) {
      console.error(`❌ Error al subir producto ${prod.nombre}:`, err);
    }
  }

  alert('✅ Sincronización de productos finalizada.');
}


// === SUBIR MOVIMIENTOS ===
async function subirProductosIndexedDBaSupabase() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('inventarioDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('No se pudo abrir IndexedDB');
  });

  // 1️⃣ Leer productos locales
  const productosLocales = await new Promise(resolve => {
    const tx = db.transaction('productos', 'readonly');
    const store = tx.objectStore('productos');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  // 2️⃣ Leer productos existentes en Supabase (con campos necesarios para comparación)
  const resExistentes = await fetch(`${SUPABASE_URL}/rest/v1/productos_stock?select=id,codigo,nombre`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  let productosEnSupabase = [];
  try {
    productosEnSupabase = await resExistentes.json();
  } catch (e) {
    console.error('❌ Supabase respondió con algo inesperado:', e);
    alert('❌ Error al obtener productos desde Supabase');
    return;
  }

  const idsEnSupabase = productosEnSupabase.map(p => p.id);

  for (const prod of productosLocales) {
    // 3️⃣ Validar ID UUID
    if (!prod.id || !/^[0-9a-f-]{36}$/.test(prod.id)) {
      console.warn(`🚫 Producto ignorado por ID inválido:`, prod);
      continue;
    }

    // 4️⃣ Validar duplicado por ID
    if (prod.subido || idsEnSupabase.includes(prod.id)) continue;

    // 5️⃣ 🔍 Validar duplicado por código o nombre
    const yaExiste = productosEnSupabase.some(p =>
      p.codigo === prod.codigo || p.nombre === prod.nombre
    );
    if (yaExiste) {
      console.warn(`⏩ Producto omitido por duplicado (código o nombre): ${prod.codigo} / ${prod.nombre}`);
      continue;
    }

    // 6️⃣ Preparar datos para Supabase
    if (!prod.updated_at) prod.updated_at = new Date().toISOString();
    const prodSupabase = {
      id: prod.id,
      nombre: prod.nombre,
      precio_costo: prod.precioCosto,
      precio_venta: prod.precioVenta,
      stock: prod.stock,
      updated_at: prod.updated_at,
      codigo: prod.codigo || '' // Asegúrate de incluir el código si tu tabla lo usa
    };

    // 7️⃣ Enviar a Supabase
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

      let data = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) throw new Error(JSON.stringify(data));

      // 8️⃣ Marcar como subido
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
