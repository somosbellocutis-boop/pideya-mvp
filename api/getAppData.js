export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const ID = '1XoqkBuBwAgcmubj82cNIOECHa36AxjKMF5kdei5YBpo';

  async function getSheet(name) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
      const txt = await fetch(url).then(r => r.text());
      const json = JSON.parse(txt.match(/\{.*\}/s)[0].replace(/\/\*.*?\*\//g,''));
      const headers = json.table.cols.map(c => (c.label || '').trim()).filter(Boolean);
      const rows = json.table.rows.map(r => {
        const o = {};
        headers.forEach((h,i) => o[h] = r.c[i] ? (r.c[i].v ?? '') : '');
        return o;
      });
      return { headers, rows };
    } catch(e) { return { headers: [], rows: [] }; }
  }

  const restSheet = await getSheet('Restaurantes');
  const prodSheet = await getSheet('Productos');

  const restaurantes = restSheet.rows.filter(r => String(r.ID_Restaurante||'').trim()).map(r => ({
    id: String(r.ID_Restaurante).toUpperCase(),
    nombre: r.Nombre || 'Sin nombre',
    categoria: r.Categoria || 'General',
    logo: r.Logo_URL || '',
    portada: r.Portada_URL || '',
    costoEnvio: Number(r.Costo_Envio)||0,
    envioGratis: ['TRUE','true','SI','si','1','x','VERDADERO'].includes(String(r.Envio_Gratis)),
    tiempo: r.Tiempo_Entrega || '30-45',
    ciudad: r.Ciudad || r.Municipio || '',
    abierto: String(r.Estado_Manual||'').toLowerCase() !== 'cerrado',
    whatsapp: r.WhatsApp || ''
  }));

  const productos = prodSheet.rows.filter(p => String(p.ID_Producto||'').trim()).map(p => ({
    id: String(p.ID_Producto).toUpperCase(),
    idRest: String(p.ID_Restaurante).toUpperCase(),
    nombre: p.Nombre || '',
    precio: Number(p.Precio)||0,
    foto: p.Foto_URL || '',
    disponible: String(p.Disponible).toUpperCase() !== 'FALSE'
  }));

  res.status(200).json({ restaurantes, productos, banners: [] });
}
