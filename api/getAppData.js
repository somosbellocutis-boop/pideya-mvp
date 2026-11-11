import { google } from 'googleapis';
import crypto from 'crypto';

const CFG = {
  ss: '1XoqkBuBwAgcmubj82cNIOECHa36AxjKMF5kdei5YBpo',
  tz: 'America/Bogota',
  sessionSeconds: 3600
};

// Memoria volátil para sesiones y bloqueos en Vercel (durante la ejecución serverless)
const memoryCache = new Map();

// Configuración de Autenticación con Google Sheets usando Service Account
function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const sheets = google.sheets({ version: 'v4', auth: getAuthClient() });

// Endpoint principal que maneja las peticiones POST desde el frontend
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const { action, args = [] } = req.body;

  try {
    let result;
    switch (action) {
      case 'getAppData':
        result = await getAppData();
        break;
      case 'loginRestaurante':
        result = await loginRestaurante(...args);
        break;
      case 'cerrarSesion':
        result = await cerrarSesion(...args);
        break;
      case 'getDatosTienda':
        result = await getDatosTienda(...args);
        break;
      case 'guardarConfiguracionTienda':
        result = await guardarConfiguracionTienda(...args);
        break;
      case 'guardarCoberturaTienda':
        result = await guardarCoberturaTienda(...args);
        break;
      case 'guardarPerfilTienda':
        result = await guardarPerfilTienda(...args);
        break;
      case 'guardarProductoTienda':
        result = await guardarProductoTienda(...args);
        break;
      case 'setDisponibilidadProducto':
        result = await setDisponibilidadProducto(...args);
        break;
      case 'eliminarProducto':
        result = await eliminarProducto(...args);
        break;
      case 'resolverUbicacionCliente':
        result = await resolverUbicacionCliente(...args);
        break;
      case 'validarProductoParaCarrito':
        result = await validarProductoParaCarrito(...args);
        break;
      case 'prepararPedido':
        result = await prepararPedido(...args);
        break;
      case 'calificarRestaurante':
        result = await calificarRestaurante(...args);
        break;
      case 'registrarClickWhatsApp':
        result = await registrarClickWhatsApp(...args);
        break;
      default:
        throw new Error(`Acción desconocida: ${action}`);
    }

    return res.status(200).json({ ok: true, data: result });
  } catch (error) {
    console.error(`Error en ${action}:`, error.message);
    const cleanMsg = error.message.startsWith('APP: ') ? error.message.slice(5) : error.message;
    return res.status(200).json({ ok: false, error: cleanMsg });
  }
}

// ==========================================
// FUNCIONES AUXILIARES DE GOOGLE SHEETS
// ==========================================

async function fetchTable(sheetName, requiredHeaders = []) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CFG.ss,
      range: `${sheetName}!A:Z`,
    });

    const rows = response.data.values || [];
    if (!rows.length) return { headers: [], rows: [], rawValues: [] };

    const headers = rows[0].map(v => String(v || '').trim());
    requiredHeaders.forEach(h => {
      if (!headers.includes(h)) throw new Error(`Falta la columna ${h} en la pestaña ${sheetName}`);
    });

    const dataRows = rows.slice(1).map((row, index) => {
      const obj = { _row: index + 2 };
      headers.forEach((h, j) => { if (h) obj[h] = row[j] !== undefined ? row[j] : ''; });
      return obj;
    }).filter(r => String(r[requiredHeaders[0]] || '').trim() !== '');

    return { headers, rows: dataRows, rawValues: rows };
  } catch (error) {
    throw new Error(`Error en hoja "${sheetName}": ${error.message}. Revisa permisos de la Cuenta de Servicio o nombre de la pestaña.`);
  }
}

async function writeSheetCell(sheetName, row, columnName, value, headers) {
  const colIndex = headers.indexOf(columnName);
  if (colIndex === -1) throw new Error(`Falta la columna ${columnName}`);
  const colLetter = columnToLetter(colIndex + 1);
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: CFG.ss,
    range: `${sheetName}!${colLetter}${row}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[value]] }
  });
}

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(column + 65) + letter;
    column = (column - 1) / 26;
  }
  return letter;
}

// ==========================================
// LÓGICA DE NEGOCIO Y ACCIONES
// ==========================================

function fail_(message) { throw new Error('APP: ' + message); }
function id_(v) {
  let s = String(v == null ? '' : v).trim();
  if (s === '1') s = 'REST-001';
  return s.toUpperCase();
}
function text_(v, max, required) {
  const s = String(v == null ? '' : v).trim();
  if ((required && !s) || s.length > max) fail_('Revisa los campos obligatorios.');
  return s;
}
function bool_(v) {
  if (typeof v === 'boolean') return v;
  return ['true', 'verdadero', 'si', 'sí', '1', 'x', 'activo', 'yes'].includes(String(v).trim().toLowerCase());
}
function money_(v, optional) {
  if (optional && (v === '' || v == null)) return 0;
  if (v === '' || v == null || typeof v === 'boolean') fail_('Precio o domicilio vacío o inválido.');
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) fail_('El valor debe estar entre 0 y 100000000 pesos enteros.');
  return n;
}
function url_(v) {
  const s = text_(v, 4000, false);
  if (s && !s.startsWith('data:image/') && !/^https:\/\/[^\s<>"']+$/i.test(s)) {
    fail_('Usa una URL HTTPS válida o una imagen cargada.');
  }
  return s;
}
function phone_(v) {
  let s = String(v || '').replace(/\D/g, '');
  if (s.length === 10 && s.startsWith('3')) s = '57' + s;
  if (!/^[1-9]\d{9,14}$/.test(s)) fail_('WhatsApp inválido. Incluye el código de país.');
  return s;
}
function time_(v) {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, '0') + ':' + m[2] : '';
}
function hash_(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function open_(r) {
  const state = String(r.Estado_Manual || '').trim().toLowerCase();
  if (state === 'cerrado') return false;
  if (state === 'abierto') return true;
  const a = time_(r.Horario_Apertura);
  const b = time_(r.Horario_Cierre);
  if (!['automatico', 'automático', ''].includes(state) || !a || !b || a === b) return false;
  
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: CFG.tz, hour: '2-digit', minute: '2-digit' });
  return a < b ? now >= a && now < b : now >= a || now < b;
}

function rating_(r) {
  const n = Number(r.Total_Votos), s = Number(r.Suma_Calif);
  const valid = Number.isInteger(n) && n >= 0 && Number.isFinite(s);
  return { votos: valid ? n : 0, promedio: valid && n ? Math.round(s / n * 10) / 10 : null };
}

function cobertura_(r) {
  const lat = Number(r.Latitud), lng = Number(r.Longitud), radioKm = Number(r.Radio_Entrega_Km);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || !Number.isFinite(radioKm)) return null;
  return { lat, lng, radioKm };
}

function zonaRestaurante_(r) {
  const legado = String(r.Municipio || '');
  return {
    pais: String(r.Pais || 'Colombia'),
    departamento: String(r.Departamento || (legado.split(',')[1] || '').trim()),
    ciudad: String(r.Ciudad || legado.split(',')[0].trim()),
    direccionExacta: String(r.Direccion_Exacta || '')
  };
}

// --- ACCIONES PRINCIPALES ---

async function getAppData() {
  const restData = await fetchTable('Restaurantes', ['ID_Restaurante', 'Nombre']).catch(() => ({ rows: [] }));
  const prodData = await fetchTable('Productos', ['ID_Producto', 'ID_Restaurante']).catch(() => ({ rows: [] }));
  
  let bannerRows = [];
  try {
    const bannerData = await fetchTable('Banners', ['ID', 'Imagen_URL', 'Activo']);
    bannerRows = bannerData.rows || [];
  } catch(e) {}

  const restaurantes = (restData.rows || []).map(r => {
    const z = zonaRestaurante_(r);
    return {
      id: id_(r.ID_Restaurante),
      nombre: String(r.Nombre || 'Sin Nombre'),
      categoria: String(r.Categoria || 'General'),
      logo: String(r.Logo_URL || ''),
      portada: String(r.Portada_URL || ''),
      apertura: time_(r.Horario_Apertura),
      cierre: time_(r.Horario_Cierre),
      estado: String(r.Estado_Manual || 'Automatico'),
      abierto: open_(r),
      costoEnvio: money_(r.Costo_Envio, true),
      envioGratis: bool_(r.Envio_Gratis),
      tiempo: String(r.Tiempo_Entrega || '30-45'),
      clicks: Number(r.Clicks_WhatsApp) || 0,
      calificacion: rating_(r),
      cobertura: cobertura_(r),
      municipio: z.ciudad,
      ciudad: z.ciudad,
      departamento: z.departamento,
      pais: z.pais
    };
  });

  const ids = new Set(restaurantes.map(r => r.id));
  const productos = (prodData.rows || []).map(p => ({
    id: id_(p.ID_Producto),
    idRest: id_(p.ID_Restaurante),
    nombre: String(p.Nombre || p.Nombre_Plato || ''),
    desc: String(p.Descripcion || ''),
    precio: money_(p.Precio),
    precioAnterior: money_(p.Precio_Anterior, true),
    esTop: bool_(p.Es_Top),
    categoria: String(p.Categoria_Plato || 'General'),
    foto: String(p.Foto_URL || ''),
    disponible: bool_(p.Disponible !== false && String(p.Disponible).toLowerCase() !== 'false')
  })).filter(p => ids.has(p.idRest));

  const banners = bannerRows.filter(b => bool_(b.Activo)).map(b => ({
    img: String(b.Imagen_URL || ''),
    titulo: String(b.Titulo || ''),
    idRest: id_(b.ID_Restaurante)
  }));

  return { restaurantes, productos, banners };
}

async function loginRestaurante(id, pin) {
  const cleanId = id_(text_(id, 80, true));
  const cleanPin = text_(pin, 80, true);
  const restData = await fetchTable('Restaurantes', ['ID_Restaurante', 'PIN']);
  const r = restData.rows.find(x => id_(x.ID_Restaurante) === cleanId);
  
  if (!r || String(r.PIN || '').trim() !== cleanPin) {
    fail_('ID o PIN incorrectos.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  memoryCache.set('session:' + hash_(token), { id: cleanId, pinHash: hash_(cleanPin), exp: Date.now() + CFG.sessionSeconds * 1000 });
  return { token };
}

async function cerrarSesion(token) {
  if (token) memoryCache.delete('session:' + hash_(token));
  return true;
}

async function getSession(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) fail_('Sesión vencida. Ingresa de nuevo.');
  const session = memoryCache.get('session:' + hash_(token));
  if (!session || session.exp < Date.now()) fail_('Sesión vencida. Ingresa de nuevo.');
  
  const restData = await fetchTable('Restaurantes', ['ID_Restaurante']);
  const r = restData.rows.find(x => id_(x.ID_Restaurante) === session.id);
  if (!r) fail_('Sesión invalidada.');
  return { id: session.id, t: restData, r };
}

async function getDatosTienda(token) {
  const s = await getSession(token);
  const prodData = await fetchTable('Productos', ['ID_Producto', 'ID_Restaurante']);
  
  const rObj = {
    id: id_(s.r.ID_Restaurante),
    nombre: String(s.r.Nombre || ''),
    categoria: String(s.r.Categoria || ''),
    logo: String(s.r.Logo_URL || ''),
    portada: String(s.r.Portada_URL || ''),
    whatsapp: String(s.r.WhatsApp || ''),
    apertura: time_(s.r.Horario_Apertura),
    cierre: time_(s.r.Horario_Cierre),
    estado: String(s.r.Estado_Manual || 'Abierto'),
    abierto: open_(s.r),
    costoEnvio: money_(s.r.Costo_Envio, true),
    envioGratis: bool_(s.r.Envio_Gratis),
    tiempo: String(s.r.Tiempo_Entrega || '30-45'),
    clicks: Number(s.r.Clicks_WhatsApp) || 0,
    calificacion: rating_(s.r),
    municipio: String(s.r.Municipio || ''),
    cobertura: cobertura_(s.r)
  };

  const productos = (prodData.rows || [])
    .filter(p => id_(p.ID_Restaurante) === s.id)
    .map(p => ({
      id: id_(p.ID_Producto),
      idRest: id_(p.ID_Restaurante),
      nombre: String(p.Nombre || ''),
      desc: String(p.Descripcion || ''),
      precio: money_(p.Precio),
      precioAnterior: money_(p.Precio_Anterior, true),
      esTop: bool_(p.Es_Top),
      categoria: String(p.Categoria_Plato || ''),
      foto: String(p.Foto_URL || ''),
      disponible: bool_(p.Disponible !== false && String(p.Disponible).toLowerCase() !== 'false')
    }));

  return { rest: rObj, productos };
}

async function guardarConfiguracionTienda(token, d) {
  const s = await getSession(token);
  const a = time_(d.apertura), b = time_(d.cierre);
  if (!a || !b) fail_('Indica horas válidas.');

  const fields = {
    'Nombre': text_(d.nombre, 120, true),
    'Categoria': text_(d.categoria, 80, true),
    'WhatsApp': phone_(d.whatsapp),
    'Logo_URL': url_(d.logo),
    'Portada_URL': url_(d.portada),
    'Horario_Apertura': a,
    'Horario_Cierre': b,
    'Costo_Envio': money_(d.costoEnvio),
    'Envio_Gratis': d.envioGratis === true,
    'Estado_Manual': d.estado || 'Abierto',
    'Tiempo_Entrega': text_(d.tiempo, 40, true)
  };

  for (const [col, val] of Object.entries(fields)) {
    await writeSheetCell('Restaurantes', s.r._row, col, val, s.t.headers);
  }
  return true;
}

async function guardarCoberturaTienda(token, d) {
  const s = await getSession(token);
  const fields = {
    'Latitud': Number(d.lat),
    'Longitud': Number(d.lng),
    'Radio_Entrega_Km': Number(d.radioKm),
    'Municipio': text_(d.municipio, 100, false)
  };
  for (const [col, val] of Object.entries(fields)) {
    if (!s.t.headers.includes(col)) continue;
    await writeSheetCell('Restaurantes', s.r._row, col, val, s.t.headers);
  }
  return true;
}

async function guardarPerfilTienda(token, datos) {
  const s = await getSession(token);
  const fields = {};
  if (datos.Logo_URL !== undefined) fields.Logo_URL = url_(datos.Logo_URL);
  if (datos.Portada_URL !== undefined) fields.Portada_URL = url_(datos.Portada_URL);

  for (const [col, val] of Object.entries(fields)) {
    await writeSheetCell('Restaurantes', s.r._row, col, val, s.t.headers);
  }
  return true;
}

async function guardarProductoTienda(token, d) {
  const s = await getSession(token);
  const prodData = await fetchTable('Productos', ['ID_Producto', 'ID_Restaurante']);
  const price = money_(d.precio);
  const previous = money_(d.precioAnterior, true);

  const fields = {
    'Nombre': text_(d.nombre, 120, true),
    'Descripcion': text_(d.desc, 1000, false),
    'Precio': price,
    'Precio_Anterior': previous,
    'Categoria_Plato': text_(d.categoria, 80, true),
    'Foto_URL': url_(d.foto)
  };

  if (d.id) {
    const p = prodData.rows.find(x => id_(x.ID_Producto) === id_(d.id) && id_(x.ID_Restaurante) === s.id);
    if (!p) fail_('Producto no encontrado.');
    for (const [col, val] of Object.entries(fields)) {
      await writeSheetCell('Productos', p._row, col, val, prodData.headers);
    }
  } else {
    const newId = 'PROD-' + crypto.randomUUID().toUpperCase();
    const newRowValues = prodData.headers.map(h => {
      if (h === 'ID_Producto') return newId;
      if (h === 'ID_Restaurante') return s.id;
      if (h === 'Disponible') return true;
      return fields[h] !== undefined ? fields[h] : '';
    });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: CFG.ss,
      range: 'Productos!A:Z',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRowValues] }
    });
  }
  return true;
}

async function setDisponibilidadProducto(token, id, disponible) {
  const s = await getSession(token);
  const prodData = await fetchTable('Productos', ['ID_Producto', 'ID_Restaurante']);
  const p = prodData.rows.find(x => id_(x.ID_Producto) === id_(id) && id_(x.ID_Restaurante) === s.id);
  if (!p) fail_('Producto no encontrado.');
  await writeSheetCell('Productos', p._row, 'Disponible', Boolean(disponible), prodData.headers);
  return true;
}

async function eliminarProducto(token, id) {
  const s = await getSession(token);
  const prodData = await fetchTable('Productos', ['ID_Producto', 'ID_Restaurante']);
  const p = prodData.rows.find(x => id_(x.ID_Producto) === id_(id) && id_(x.ID_Restaurante) === s.id);
  if (!p) fail_('Producto no encontrado.');

  for (let i = 0; i < prodData.headers.length; i++) {
    await writeSheetCell('Productos', p._row, prodData.headers[i], '', prodData.headers);
  }
  return true;
}

async function resolverUbicacionCliente(lat, lng) {
  return { pais: 'Colombia', departamento: 'Antioquia', ciudad: 'Medellín' };
}

async function validarProductoParaCarrito(idProducto, zonaCliente, gps) {
  const appData = await getAppData();
  const p = appData.productos.find(x => x.id === id_(idProducto));
  if (!p || !p.disponible) fail_('Este producto está agotado.');
  const r = appData.restaurantes.find(x => x.id === p.idRest);
  if (!r || !r.abierto) fail_('El restaurante está cerrado.');
  return true;
}

async function prepararPedido(id, items, direccion, gps, zonaCliente) {
  const appData = await getAppData();
  const cleanId = id_(id);
  const r = appData.restaurantes.find(x => x.id === cleanId);
  if (!r || !r.abierto) fail_('El restaurante está cerrado.');

  let subtotal = 0;
  const lines = items.map(it => {
    const p = appData.productos.find(x => x.id === id_(it.id) && x.idRest === cleanId);
    if (!p || !p.disponible) fail_('Un producto ya no está disponible.');
    subtotal += p.precio * it.qty;
    return `• ${it.qty}x ${p.nombre} ($${(p.precio * it.qty).toLocaleString()})`;
  });

  const envio = r.envioGratis ? 0 : r.costoEnvio;
  const total = subtotal + envio;

  const msgLines = [
    '🛒 *¡NUEVO PEDIDO DESDE LA APP!*',
    '🏪 *Local:* ' + r.nombre,
    '📍 *Entrega:* ' + (direccion || 'Punto GPS seleccionado'),
    '', '*Detalle de Platos:*',
    ...lines, '',
    'Subtotal: $' + subtotal.toLocaleString(),
    'Domicilio: $' + envio.toLocaleString(),
    '*TOTAL A PAGAR: $' + total.toLocaleString() + '*'
  ];

  const phone = phone_(r.whatsapp || '573000000000');
  const event = crypto.randomBytes(32).toString('hex');

  return {
    nombreRestaurante: r.nombre,
    subtotal, envio, total, ahorro: 0, event,
    url: `https://api.whatsapp.com/send?phone=${phone}&text=` + encodeURIComponent(msgLines.join('\n'))
  };
}

async function calificarRestaurante(id, estrellas, clientId) {
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) fail_('Elige de 1 a 5 estrellas.');
  const restData = await fetchTable('Restaurantes', ['ID_Restaurante', 'Suma_Calif', 'Total_Votos']);
  const r = restData.rows.find(x => id_(x.ID_Restaurante) === id_(id));
  if (!r) fail_('Restaurante no encontrado.');

  const suma = Number(r.Suma_Calif || 0) + estrellas;
  const votos = Number(r.Total_Votos || 0) + 1;

  await writeSheetCell('Restaurantes', r._row, 'Suma_Calif', suma, restData.headers);
  await writeSheetCell('Restaurantes', r._row, 'Total_Votos', votos, restData.headers);
  await writeSheetCell('Restaurantes', r._row, 'Promedio', Math.round(suma / votos * 10) / 10, restData.headers);
  return true;
}

async function registrarClickWhatsApp(event) {
  return true;
}
