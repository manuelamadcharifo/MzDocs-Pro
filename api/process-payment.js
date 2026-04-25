// api/process-payment.js
// Processamento de pagamentos: M-Pesa + Manual (fallback)
// Vercel Serverless Function

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Preços dos pacotes (em MZN)
const PACKAGES = {
  'basico': { credits: 5, price: 50, name: 'Básico' },
  'padrao': { credits: 15, price: 120, name: 'Padrão' },
  'premium': { credits: 50, price: 350, name: 'Premium' },
  'ilimitado': { credits: 9999, price: 800, name: 'Ilimitado' },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).set(corsHeaders).json({ error: 'Método não permitido' });
  }

  const {
    mode,           // 'mpesa' | 'manual'
    packageId,
    phoneNumber,    // Para M-Pesa
    userId,
    manualDetails,  // Para pagamento manual: { method, reference, screenshot }
  } = req.body;

  // Validações
  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).set(corsHeaders).json({
      error: 'Pacote inválido',
      available: Object.keys(PACKAGES),
    });
  }

  const pkg = PACKAGES[packageId];

  // ============================================
  // MODO 1: M-PESA AUTOMÁTICO
  // ============================================
  if (mode === 'mpesa') {
    const mpesaActive = process.env.MPESA_ENV === 'production';

    if (!mpesaActive) {
      return res.status(503).set(corsHeaders).json({
        error: 'M-Pesa indisponível',
        details: 'Pagamento automático M-Pesa ainda não ativado',
        fallback: 'Use modo manual',
      });
    }

    // Validação M-Pesa
    if (!phoneNumber || !/^2588[4-7]\d{7}$/.test(phoneNumber)) {
      return res.status(400).set(corsHeaders).json({
        error: 'Número M-Pesa inválido',
        format: '25884XXXXXXX',
      });
    }

    try {
      // Aqui integrarias a API real do M-Pesa quando ativares
      // Por agora, simula o fluxo
      const transactionId = `MP${Date.now()}`;

      // Guarda transação pendente no Supabase (se disponível)
      await saveTransaction({
        id: transactionId,
        userId,
        packageId,
        amount: pkg.price,
        phoneNumber,
        status: 'pending',
        mode: 'mpesa',
        createdAt: new Date().toISOString(),
      });

      return res.status(200).set(corsHeaders).json({
        success: true,
        mode: 'mpesa',
        transactionId,
        status: 'pending',
        message: 'Confirme o pagamento no seu telemóvel M-Pesa',
        instructions: `Dial *150# → Opção 3 (Pagamentos) → Código: ${transactionId}`,
      });

    } catch (error) {
      console.error('Erro M-Pesa:', error);
      return res.status(500).set(corsHeaders).json({
        error: 'Falha no processamento M-Pesa',
        fallback: 'Use modo manual',
      });
    }
  }

  // ============================================
  // MODO 2: PAGAMENTO MANUAL (Fallback)
  // ============================================
  if (mode === 'manual') {
    const whatsappNumber = process.env.WHATSAPP_NUMBER || '258840000000';

    const manualId = `MAN${Date.now()}`;

    // Guarda pedido manual
    await saveTransaction({
      id: manualId,
      userId,
      packageId,
      amount: pkg.price,
      status: 'awaiting_payment',
      mode: 'manual',
      manualDetails: manualDetails || {},
      createdAt: new Date().toISOString(),
    });

    const message = encodeURIComponent(
      `*Pedido MzDocs Pro — ${manualId}*\n\n` +
      `Pacote: ${pkg.name}\n` +
      `Créditos: ${pkg.credits}\n` +
      `Valor: ${pkg.price} MZN\n` +
      `Utilizador: ${userId}\n\n` +
      `Por favor envie o comprovativo de pagamento.`
    );

    return res.status(200).set(corsHeaders).json({
      success: true,
      mode: 'manual',
      transactionId: manualId,
      status: 'awaiting_payment',
      package: pkg,
      paymentInstructions: {
        method: 'M-Pesa (manual)',
        number: whatsappNumber,
        amount: pkg.price,
        reference: manualId,
        steps: [
          `1. Faça M-Pesa para ${whatsappNumber}`,
          `2. Valor: ${pkg.price} MZN`,
          `3. Referência: ${manualId}`,
          `4. Envie comprovativo por WhatsApp`,
        ],
      },
      whatsappLink: `https://wa.me/${whatsappNumber}?text=${message}`,
      message: 'Envie o comprovativo de pagamento pelo WhatsApp para ativação manual',
    });
  }

  // Modo desconhecido
  return res.status(400).set(corsHeaders).json({
    error: 'Modo de pagamento inválido',
    validModes: ['mpesa', 'manual'],
  });
}

// Helper para guardar transações (Supabase ou memória)
async function saveTransaction(transaction) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('transactions').insert(transaction);
      console.log('✅ Transação guardada:', transaction.id);
    } catch (e) {
      console.warn('Supabase indisponível, log local:', e.message);
    }
  } else {
    console.log('📝 Transação (sem Supabase):', transaction);
  }
}

export const config = { maxDuration: 15 };