/**
 * API Proxy para obtener combinaciones de productos de Ecwid
 * Este endpoint usa el secret token de forma segura en el servidor
 */

export default async function handler(req, res) {
  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId } = req.query;

  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }

  const STORE_ID = 20337891;
  const SECRET_TOKEN = 'secret_yxFDL1jwygReLttrhrKXKePhxhusdJFp';
  const API_URL = `https://app.ecwid.com/api/v3/${STORE_ID}/products/${productId}/combinations`;

  try {
    const response = await fetch(API_URL, {
      headers: {
        'Authorization': `Bearer ${SECRET_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Ecwid API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `Ecwid API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    // Configurar headers de caché
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching combinations:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

