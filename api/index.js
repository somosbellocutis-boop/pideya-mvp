import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const CFG = {
  tz: 'America/Bogota',
  sessionSeconds: 3600
};

const memoryCache = new Map();

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Faltan credenciales de Supabase en el entorno');
  return createClient(url, key);
}

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

function fail_(message) { throw new Error('APP: ' + message); }
function id_(v) { let s = String(v == null ? '' : v).trim(); if (s === '1') s = 'REST-001'; return s.toUpperCase(); }
function text_(v, max, required) { const s = String(v == null ? '' : v).trim(); if ((required && !s) || s.length > max) fail_('Revisa los campos.'); return s; }
function bool_(v) { return ['true', 'verdadero', 'si', 'sí', '1', 'x', 'activo', 'yes'].includes(String(v).trim().toLowerCase()); }
function money_(v, optional) { if (optional && (v === '' || v == null)) return 0; const n = Number(v); return Number.isSafeInteger(n) ? n : 0; }
function time_(v) { const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; }
function hash_(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function open_(r) {
  const state = String(r.estado_manual || r.Estado_Manual || '').trim().toLowerCase();
  if (state === 'cerrado') return false;
  if (state === 'abierto') return true;
  const a = time_(r.horario_apertura || r.Horario_Apertura), b = time_(r.horario_cierre || r.Horario_Cierre);
  if (!a || !b) return false;
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: CFG.tz, hour: '2-digit', minute: '2-digit' });
  return a < b ? now >= a && now < b : now >= a || now < b;
}

function rating_(r) {
  const n = Number(r.total_votos || r.Total_Votos), s = Number(r.suma_calif || r.Suma_Calif);
  const valid = Number.isInteger(n) && n > 0;
  return { votos: valid ? n : 0, promedio: valid ? Math.round(s / n * 10) / 10 : null };
}

function cobertura_(r) {
  const lat = Number(r.latitud || r.Latitud), lng = Number(r.longitud || r.Longitud), radioKm = Number(r.radio_entrega_km || r.Radio_Entrega_Km);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, radioKm };
}

function zonaRestaurante_(r) {
  return { ciudad: String(r.ciudad || r.Ciudad || 'Medellín'), departamento: String(r.departamento || r.Departamento || 'Antioquia'), pais: 'Colombia' };
}

async function getAppData() {
  const supabase = getSupabase();
  const { data: restRows, error: restErr } = await supabase.from('Restaurantes').select('*');
  if (restErr) throw new Error('Error al cargar restaurantes: ' + restErr.message);

  const { data: prodRows, error: prodErr } = await supabase.from('Productos').select('*');
  if (prodErr) throw new Error('Error al cargar productos: ' + prodErr.message);

  let banners = [];
  try {
    const { data: bannerRows } = await supabase.from('Banners').select('*');
    if (bannerRows) {
      banners = bannerRows.filter(b => bool_(b.activo || b.Activo)).map(b => ({
        img: String(b.imagen_url || b.Imagen_URL || ''), titulo: String(b.titulo || b.Titulo || ''), idRest: id_(b.id_restaurante || b.ID_Restaurante)
      }));
    }
  } catch(e) {}

  const restaurantes = (restRows || []).map(r => {
    const z = zonaRestaurante_(r);
    return {
      id: id_(r.id_restaurante || r.ID_Restaurante),
      nombre: String(r.nombre || r.Nombre || 'Local'),
      categoria: String(r.categoria || r.Categoria || 'General'),
      logo: String(r.logo_url || r.Logo_URL || ''),
      portada: String(r.portada_url || r.Portada_URL || ''),
      apertura: time_(r.horario_apertura || r.Horario_Apertura),
      cierre: time_(r.horario_cierre || r.Horario_Cierre),
      estado: String(r.estado_manual || r.Estado_Manual || 'Automatico'),
      abierto: open_(r),
      costoEnvio: money_(r.costo_envio || r.Costo_Envio, true),
      envioGratis: bool_(r.envio_gratis || r.Envio_Gratis),
      tiempo: String(r.tiempo_entrega || r.Tiempo_Entrega || '30-45'),
      calificacion: rating_(r),
      cobertura: cobertura_(r),
      municipio: z.ciudad, ciudad: z.ciudad, departamento: z.departamento, pais: z.pais
    };
  });

  const ids = new Set(restaurantes.map(r => r.id));
  const productos = (prodRows || []).map(p => ({
    id: id_(p.id_producto || p.ID_Producto),
    idRest: id_(p.id_restaurante || p.ID_Restaurante),
    nombre: String(p.nombre || p.Nombre || ''),
    desc: String(p.descripcion || p.Descripcion || ''),
    precio: money_(p.precio || p.Precio),
    precioAnterior: money_(p.precio_anterior || p.Precio_Anterior, true),
    esTop: bool_(p.es_top || p.Es_Top),
    categoria: String(p.categoria_plato || p.Categoria_Plato || 'General'),
    foto: String(p.foto_url || p.Foto_URL || ''),
    disponible: bool_((p.disponible !== false) && (p.Disponible !== false))
  })).filter(p => ids.has(p.idRest));

  return { restaurantes, productos, banners };
}

async function loginRestaurante(id, pin) {
  const cleanId = id_(text_(id, 80, true));
  const cleanPin = String(pin || '').trim();
  const supabase = getSupabase();
  
  const { data: rows, error } = await supabase.from('Restaurantes').select('*');
  if (error || !rows) fail_('Error al conectar con la base de datos.');

  const r = rows.find(x => {
    const dbId = id_(x.id_restaurante || x.ID_Restaurante || x.id || x.ID);
    return dbId === cleanId;
  });

  if (!r) fail_('El restaurante no existe.');

  const dbPin = String(r.PIN || r.pin || r.Pin || '').trim();
  if (dbPin !== cleanPin) fail_('ID o PIN incorrectos.');

  const token = crypto.randomBytes(32).toString('hex');
  memoryCache.set('session:' + hash_(token), { id: cleanId, exp: Date.now() + CFG.sessionSeconds * 1000 });
  return { token };
}

async function cerrarSesion(token) { if (token) memoryCache.delete('session:' + hash_(token)); return true; }

async function getSession(token) {
  if (!token) fail_('Sesión vencida.');
  const session = memoryCache.get('session:' + hash_(token));
  if (!session || session.exp < Date.now()) fail_('Sesión vencida.');
  const supabase = getSupabase();
  const { data: rows, error } = await supabase.from('Restaurantes').select('*');
  if (error || !rows) fail_('Sesión inválida.');
  const r = rows.find(x => id_(x.id_restaurante || x.ID_Restaurante || x.id || x.ID) === session.id);
  if (!r) fail_('Sesión inválida.');
  return { id: session.id, r };
}

async function getDatosTienda(token) {
  const s = await getSession(token);
  const supabase = getSupabase();
  const { data: prodRows } = await supabase.from('Productos').select('*');
  const rObj = {
    id: id_(s.r.id_restaurante || s.r.ID_Restaurante || s.r.id || s.r.ID), 
    nombre: String(s.r.nombre || s.r.Nombre || ''), 
    categoria: String(s.r.categoria || s.r.Categoria || ''),
    logo: String(s.r.logo_url || s.r.Logo_URL || ''), 
    portada: String(s.r.portada_url || s.r.Portada_URL || ''), 
    whatsapp: String(s.r.whatsapp || s.r.WhatsApp || ''),
    apertura: time_(s.r.horario_apertura || s.r.Horario_Apertura), 
    cierre: time_(s.r.horario_cierre || s.r.Horario_Cierre), 
    estado: String(s.r.estado_manual || s.r.Estado_Manual || 'Abierto'),
    abierto: open_(s.r), 
    costoEnvio: money_(s.r.costo_envio || s.r.Costo_Envio, true), 
    envioGratis: bool_(s.r.envio_gratis || s.r.Envio_Gratis),
    tiempo: String(s.r.tiempo_entrega || s.r.Tiempo_Entrega || '30-45'), 
    calificacion: rating_(s.r), 
    municipio: String(s.r.municipio || s.r.Municipio || ''), 
    cobertura: cobertura_(s.r)
  };
  const productos = (prodRows || []).filter(p => id_(p.id_restaurante || p.ID_Restaurante) === s.id).map(p => ({
    id: id_(p.id_producto || p.ID_Producto), 
    idRest: id_(p.id_restaurante || p.ID_Restaurante), 
    nombre: String(p.nombre || p.Nombre || ''),
    desc: String(p.descripcion || p.Descripcion || ''), 
    precio: money_(p.precio || p.Precio), 
    precioAnterior: money_(p.precio_anterior || p.Precio_Anterior, true),
    esTop: bool_(p.es_top || p.Es_Top), 
    categoria: String(p.categoria_plato || p.Categoria_Plato || ''), 
    foto: String(p.foto_url || p.Foto_URL || ''), 
    disponible: bool_((p.disponible !== false) && (p.Disponible !== false))
  }));
  return { rest: rObj, productos };
}

async function guardarConfiguracionTienda() { return true; }
async function guardarCoberturaTienda() { return true; }
async function guardarPerfilTienda() { return true; }
async function guardarProductoTienda() { return true; }
async function setDisponibilidadProducto() { return true; }
async function eliminarProducto() { return true; }
async function resolverUbicacionCliente() { return { pais: 'Colombia', departamento: 'Antioquia', ciudad: 'Medellín' }; }
async function validarProductoParaCarrito() { return true; }

async function prepararPedido(id, items, direccion) {
  const appData = await getAppData();
  const r = appData.restaurantes.find(x => x.id === id_(id));
  if (!r) fail_('Restaurante no encontrado.');
  let subtotal = 0;
  const lines = items.map(it => {
    const p = appData.productos.find(x => x.id === id_(it.id));
    const sub = (p ? p.precio : 0) * it.qty;
    subtotal += sub;
    return `• ${it.qty}x ${p ? p.nombre : 'Plato'} ($${sub.toLocaleString()})`;
  });
  const envio = r.envioGratis ? 0 : r.costoEnvio;
  const total = subtotal + envio;
  const msgLines = ['🛒 *PEDIDO PideyYa*', '🏪 *Local:* ' + r.nombre, '📍 *Dirección:* ' + direccion, '', ...lines, '', 'TOTAL: $' + total.toLocaleString()];
  const phone = String(r.whatsapp || '573000000000').replace(/\D/g, '');
  return {
    nombreRestaurante: r.nombre, subtotal, envio, total,
    url: `https://api.whatsapp.com/send?phone=${phone}&text=` + encodeURIComponent(msgLines.join('\n'))
  };
}

async function calificarRestaurante() { return true; }
async function registrarClickWhatsApp() { return true; }
