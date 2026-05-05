// api/config.js — Configuração pública do Supabase (nunca expõe service key)
export default async function handler(req, res) {
    const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabaseUrl     = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // Sandbox = M-Pesa automático não configurado
    const isSandbox = !process.env.MPESA_API_KEY || !process.env.MPESA_SERVICE_CODE;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(200).json({ configured: false, isSandbox, message: 'Supabase não configurado' });
    }

    return res.status(200).json({ configured: true, supabaseUrl, supabaseAnonKey, isSandbox });
}
