// api/config.js
// Serve configuração pública do Supabase (anon key apenas, nunca service key)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(503).json({
            error: 'Supabase não configurado',
            configured: false
        });
    }

    return res.status(200).json({
        configured: true,
        supabaseUrl,
        supabaseAnonKey
        // NOTA: NUNCA expor SUPABASE_SERVICE_KEY aqui
    });
}

export const config = { maxDuration: 10 };