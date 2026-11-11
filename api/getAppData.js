export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const SHEET_ID = '1XoqkBuBwAgcmubj82cNIOECHa36AxjKMF5kdei5YBpo';
  
  async function getSheet(name) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
    const txt = await fetch(url).then(r => r.text());
    const json = JSON.parse(txt.substring(47).slice(0, -2));
    const headers = json.table.cols.map(c => c.label.trim());
    const rows = json.table.rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r.c[i] ? r.c[i].v : '');
      return obj;
    });
    return { headers, rows };
  }

  try {
    const restSheet = await getSheet('Restaurantes');
    const prodSheet = await getSheet('Productos');
    
    // Filtro simple igual que tu table_()
    const restaurantes = restSheet.rows.filter(r => String(r.ID_Restaurante||'').trim() !== '').map(r => ({
      id: String(r.ID_Restaurante).toUpperCase(),
      nombre: r.Nombre,
      categoria: r.Categoria,
      logo: r.Logo_URL,
      portada: r.Portada_URL,
      abierto: String(r.Estado_Manual).toLowerCase() !== 'cerrado',
      costoEnvio: Number(r.Costo_Envio)||0,
      envioGratis: ['true','si','sí','1','x'].includes(String(r.Envio_Gratis).toLowerCase()),
      tiempo: r.Tiempo_Entrega,
      ciudad: r.Ciudad || r.Municipio,
      departamento: r.Departamento
    }));

    const ids = new Set(restaurantes.map(r => r.id));
    const productos = prodSheet.rows.filter(p => ids.has(String(p.ID_Restaurante).toUpperCase())).map(p => ({
      id: String(p.ID_Producto).toUpperCase(),
      idRest: String(p.ID_Restaurante).toUpperCase(),
      nombre: p.Nombre,
      desc: p.Descripcion,
      precio: Number(p.Precio)||0,
      foto: p.Foto_URL,
      disponible: String(p.Disponible).toLowerCase() !== 'false'
    }));

    res.status(200).json({ restaurantes, productos, banners: [] });
  } catch(e) {
    res.status(500).json({ error: e.toString(), restaurantes: [], productos: [] });
  }
}
