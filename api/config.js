// api/config.js — Configuração pública do Supabase (nunca expõe service key)
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

module.exports = async function handler(req, res) {
    const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabaseUrl     = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // Sandbox = M-Pesa automático não configurado
    const isSandbox = !process.env.MPESA_API_KEY || !process.env.MPESA_SERVICE_CODE;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(200).json({ configured: false, isSandbox, message: 'Supabase não configurado' });
    }

    // Contador público de documentos gerados (leitura leve com cache)
    let docsGenerated = null;
    try {
        const supabase = createClient(
            supabaseUrl,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
        );
        const { count } = await supabase
            .from('credit_usage_log')
            .select('*', { count: 'exact', head: true });
        docsGenerated = count || 0;
    } catch (_) {}

    return res.status(200).json({ configured: true, supabaseUrl, supabaseAnonKey, isSandbox, docsGenerated });
}
