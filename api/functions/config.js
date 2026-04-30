// api/functions/config.js
// Endpoint seguro para fornecer configuração do Supabase ao frontend
// As credenciais nunca são expostas no código-fonte do cliente

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // Responder a preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Apenas aceitar GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // Se não estiver configurado, retornar modo anónimo
    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(200).json({
            configured: false,
            message: 'Supabase não configurado no servidor'
        });
    }

    // Retornar configuração segura
    return res.status(200).json({
        configured: true,
        supabaseUrl,
        supabaseAnonKey
    });
}