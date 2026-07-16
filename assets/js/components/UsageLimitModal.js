// assets/js/components/UsageLimitModal.js — v1.0 (v40)
// ──────────────────────────────────────────────────────────────────────────
// Modal mostrado quando um documento atinge o seu limite de downloads ou
// de edições manuais no editor. Oferece ao utilizador gastar 1 crédito da
// sua conta para desbloquear mais tentativas NAQUELE documento específico
// (+3 downloads ou +2 edições — o mesmo valor-base do plano grátis).
//
// Uso:
//   import { showUsageLimitModal } from '../components/UsageLimitModal.js';
//   const unlocked = await showUsageLimitModal({
//     kind: 'download',        // ou 'edit'
//     used, limit, tier,       // estado actual (para a mensagem)
//     documentId,
//     getToken: () => authManager.getValidToken(),
//   });
//   if (unlocked) { /* prosseguir com o download/edição */ }
// ──────────────────────────────────────────────────────────────────────────

const TIER_LABEL = { free: 'Grátis', paid: 'Pago', enterprise: 'Empresa' };
const KIND_INFO = {
  download: { icon: '📥', noun: 'downloads', verb: 'descarregar', bonus: 3, bonusLabel: '+3 downloads' },
  edit:     { icon: '✏️', noun: 'edições',   verb: 'editar',      bonus: 2, bonusLabel: '+2 edições' },
};

export async function showUsageLimitModal({ kind, used, limit, tier, documentId, getToken }) {
  const info = KIND_INFO[kind] || KIND_INFO.download;

  return new Promise((resolve) => {
    document.getElementById('mzUsageLimitOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mzUsageLimitOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;animation:tplFadeIn .3s ease';

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:24px;padding:32px 28px;max-width:420px;width:100%;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.25);position:relative;">
        <button id="mzUlClose" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:20px;color:#9CA3AF;cursor:pointer;line-height:1;">✕</button>
        <div style="font-size:3.2rem;margin-bottom:10px;">${info.icon}</div>
        <h2 style="font-size:1.25rem;font-weight:800;margin:0 0 8px;color:#1F2937;">Limite deste documento atingido</h2>
        <p style="color:#6B7280;font-size:.9rem;line-height:1.5;margin:0 0 18px;">
          Já usou os <strong>${limit} ${info.noun}</strong> incluídos neste documento
          (plano ${TIER_LABEL[tier] || 'Grátis'}). O documento continua todo seu — só precisa
          de <strong>1 crédito extra</strong> para voltar a ${info.verb}-lo.
        </p>
        <div style="background:linear-gradient(135deg,#F0FDFA,#FFFBEB);border-radius:16px;padding:18px;margin-bottom:18px;">
          <div style="font-size:1.15rem;font-weight:800;color:#0F766E;">1 crédito → ${info.bonusLabel} neste documento</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="mzUlUnlock" style="background:linear-gradient(135deg,#0F766E,#0D5F58);color:#fff;padding:15px;border-radius:100px;font-weight:700;font-size:1rem;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(15,118,110,0.3);">
            💳 Usar 1 crédito
          </button>
          <button id="mzUlBuyCredits" style="background:none;color:#0F766E;padding:6px;border:none;font-size:.85rem;font-weight:600;cursor:pointer;text-decoration:underline;">
            Não tenho créditos — comprar mais
          </button>
          <button id="mzUlCancel" style="background:none;color:#9CA3AF;padding:6px;border:none;font-size:.85rem;cursor:pointer;">
            Agora não
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = (result) => { overlay.remove(); resolve(result); };

    document.getElementById('mzUlClose')?.addEventListener('click', () => close(false));
    document.getElementById('mzUlCancel')?.addEventListener('click', () => close(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

    document.getElementById('mzUlBuyCredits')?.addEventListener('click', () => {
      close(false);
      window.paymentController?.showPricing(false);
    });

    document.getElementById('mzUlUnlock')?.addEventListener('click', async () => {
      const btn = document.getElementById('mzUlUnlock');
      btn.disabled = true;
      btn.textContent = '⏳ A desbloquear…';
      try {
        const token = await getToken();
        if (!token) throw new Error('Sessão expirada. Inicie sessão novamente.');
        const res = await fetch('/api/document-usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ action: 'unlock-extra', document_id: documentId, kind }),
        });
        const d = await res.json();
        if (res.status === 402 || d.code === 'INSUFFICIENT_CREDITS') {
          btn.disabled = false;
          btn.textContent = '💳 Usar 1 crédito';
          const { NotificationView } = await import('../views/Views.js');
          NotificationView.warn('⚠️ Créditos insuficientes. Compre mais para continuar.');
          close(false);
          window.paymentController?.showPricing(false);
          return;
        }
        if (!res.ok || !d.success) throw new Error(d.error || 'Erro ao desbloquear');

        const { NotificationView } = await import('../views/Views.js');
        NotificationView.success(`✅ Desbloqueado! ${info.bonusLabel} neste documento.`);
        close(true);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '💳 Usar 1 crédito';
        const { NotificationView } = await import('../views/Views.js');
        NotificationView.error('❌ ' + err.message);
      }
    });
  });
}
