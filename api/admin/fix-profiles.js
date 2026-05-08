// api/admin/fix-profiles.js
// Endpoint de diagnóstico e reparação de perfis sem phone
// Uso: POST /api/admin/fix-profiles  (requer token de admin)

export default async function handler(req, res) {
    const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey     = process.env.SUPABASE_ANON_KEY;

    if (!serviceKey) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada — endpoint indisponível' });
    }

    // Verificar que quem chama é admin
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token ausente' });

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

    if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });

    try {
        if (req.method === 'GET') {
            // Listar perfis com phone em falta
            const { data: broken } = await supabaseAdmin
                .from('profiles')
                .select('id, email, phone, full_name, created_at')
                .or('phone.is.null,phone.eq.')
                .order('created_at', { ascending: false });

            return res.status(200).json({
                total_broken: broken?.length || 0,
                profiles: broken || [],
                message: broken?.length
                    ? `${broken.length} perfis sem telemóvel encontrados`
                    : 'Todos os perfis têm telemóvel ✅'
            });
        }

        if (req.method === 'POST') {
            // Sincronizar phone de auth.users → profiles usando user_metadata
            // Obtém todos os utilizadores do Auth e tenta preencher phone em falta
            let fixed = 0;
            let failed = 0;
            const errors = [];

            // Listar perfis sem phone
            const { data: toFix } = await supabaseAdmin
                .from('profiles')
                .select('id, email, phone')
                .or('phone.is.null,phone.eq.');

            if (!toFix?.length) {
                return res.status(200).json({ message: 'Nenhum perfil para corrigir ✅', fixed: 0 });
            }

            // Para cada perfil sem phone, buscar no Auth o user_metadata
            for (const profile of toFix) {
                try {
                    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);
                    const meta = authUser?.user?.user_metadata || {};
                    const phoneFromMeta = meta.phone || meta.user_phone || null;

                    if (phoneFromMeta) {
                        const { error } = await supabaseAdmin
                            .from('profiles')
                            .update({
                                phone:      phoneFromMeta,
                                full_name:  meta.full_name || profile.full_name || '',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', profile.id);

                        if (error) { failed++; errors.push({ id: profile.id, error: error.message }); }
                        else fixed++;
                    } else {
                        // Sem phone no metadata — não podemos recuperar
                        errors.push({ id: profile.id, note: 'sem phone no user_metadata — utilizador deve actualizar o perfil' });
                    }
                } catch (err) {
                    failed++;
                    errors.push({ id: profile.id, error: err.message });
                }
            }

            return res.status(200).json({
                message: `Reparação concluída: ${fixed} corrigidos, ${failed} falhados`,
                fixed,
                failed,
                errors: errors.slice(0, 20) // máx 20 erros no response
            });
        }

    } catch (err) {
        console.error('[fix-profiles]', err);
        return res.status(500).json({ error: err.message });
    }
}

export const config = { maxDuration: 60 };
