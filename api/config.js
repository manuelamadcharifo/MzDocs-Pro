// api/config.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(200).json({ 
            configured: false,
            message: 'Supabase não configurado'
        });
    }

    return res.status(200).json({
        configured: true,
        supabaseUrl,
        supabaseAnonKey
    });
}