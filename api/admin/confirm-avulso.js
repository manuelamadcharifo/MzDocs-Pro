// api/admin/confirm-avulso.js
// Confirma pagamento avulso → cria conta temporária → avisa pelo WhatsApp
// Requer admin autenticado (Authorization: Bearer <token>)

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';
const WA_NUMBER = process.env.WHATSAPP_NUMBER || '258858695506';

// Créditos por pacote avulso
const AVULSO_CREDITS = 3;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── 1. Autenticação admin ───────────────────────────────────────────────
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token obrigatório' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const { transactionId, referenceId } = body;
  if (!transactionId && !referenceId) {
    return res.status(400).json({ error: 'transactionId ou referenceId obrigatório' });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Validar admin
    const { data: { user: adminUser }, error: authErr } =
      await supabaseAdmin.auth.getUser(token);
    if (authErr || !adminUser) return res.status(401).json({ error: 'Token inválido' });

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles').select('is_admin').eq('id', adminUser.id).single();
    if (!adminProfile?.is_admin) return res.status(403).json({ error: 'Acesso negado — apenas admins' });

    // ── 2. Carregar transacção ────────────────────────────────────────────
    let txQuery = supabaseAdmin.from('transactions').select('*');
    if (transactionId) txQuery = txQuery.eq('id', transactionId);
    else               txQuery = txQuery.eq('reference_id', referenceId);

    const { data: tx, error: txErr } = await txQuery.single();
    if (txErr || !tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transação já processada' });
    if (tx.package_id !== 'avulso') {
      return res.status(400).json({ error: 'Use /api/admin/confirm-payment para pacotes não avulsos' });
    }

    // ── 3. Gerar credenciais temporárias ─────────────────────────────────
    const ref       = tx.reference_id || ('AV' + Date.now());
    const tempEmail = `temp_${ref.toLowerCase()}@mzdocs.temp`;
    const tempPass  = _genPassword(); // 8 chars legíveis

    // ── 4. Criar utilizador no Supabase Auth ─────────────────────────────
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email:             tempEmail,
      password:          tempPass,
      email_confirm:     true,          // confirmar imediatamente — sem email de verificação
      user_metadata: {
        full_name:  `Avulso ${ref}`,
        is_temp:    true,
        temp_ref:   ref,
        phone:      tx.phone_number || '',
      },
    });
    if (createErr) throw new Error('Erro ao criar conta temp: ' + createErr.message);

    const tempUserId = newUser.user.id;

    // ── 5. Actualizar perfil: marcar como temporário + créditos ──────────
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({
        is_temp:       true,
        temp_ref:      ref,
        temp_password: tempPass,   // guardamos para o admin ver se precisar
        credits:       tx.credits,
        plan:          'free',
        full_name:     `Avulso ${ref}`,
        phone:         tx.phone_number || null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', tempUserId);
    if (profileErr) throw profileErr;

    // ── 6. Actualizar a transacção: ligar ao user_id temp ─────────────────
    await supabaseAdmin
      .from('transactions')
      .update({
        user_id:      tempUserId,
        status:       'completed',
        confirmed_by: adminUser.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    // ── 7. Mensagem WhatsApp para o utilizador ────────────────────────────
    const clientPhone = tx.phone_number?.replace(/\D/g, '') || '';
    const waTarget    = clientPhone
      ? (clientPhone.startsWith('258') ? clientPhone : '258' + clientPhone)
      : null;

    const waMsg = [
      `✅ *Pagamento Confirmado — MzDocs Pro*`,
      ``,
      `📦 Pacote: Avulso (${tx.credits} créditos)`,
      `🆔 Referência: ${ref}`,
      ``,
      `A sua conta temporária foi criada:`,
      `🔑 *Acesso:* ${origin}`,
      `📧 *Utilizador:* ${tempEmail}`,
      `🔐 *Password:* ${tempPass}`,
      ``,
      `⚠️ Esta conta é eliminada automaticamente quando os ${tx.credits} créditos acabarem.`,
      `   Considere criar uma conta permanente para guardar os seus documentos.`,
    ].join('\n');

    const waLink = waTarget
      ? `https://wa.me/${waTarget}?text=${encodeURIComponent(waMsg)}`
      : null;

    return res.status(200).json({
      success:     true,
      tempEmail,
      tempPass,
      tempUserId,
      credits:     tx.credits,
      waLink,       // admin abre este link para enviar as credenciais ao cliente
      message:     `Conta temporária criada: ${tempEmail} / ${tempPass}`,
    });

  } catch (err) {
    console.error('[confirm-avulso] Erro:', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// Gerar password legível: 4 letras + 4 dígitos ex: KpRx4821
function _genPassword() {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '0123456789';
  let pass = '';
  for (let i = 0; i < 4; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) pass += digits[Math.floor(Math.random() * digits.length)];
  return pass;
}

export const config = { maxDuration: 30 };
