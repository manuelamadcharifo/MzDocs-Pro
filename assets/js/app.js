// assets/js/app.js — MVC Entry Point
// Importa e instancia todos os módulos em ordem correcta

import { Storage } from './utils/Storage.js';
import { CreditModel, DocumentModel, QueueModel, UserModel } from './models/Models.js';
import { DocumentController, PaymentController, OCRController } from './controllers/Controllers.js';

// ══════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════
async function bootstrap() {
  // 1. Criar modelos singleton
  const creditModel = new CreditModel();
  await creditModel.init();

  const docModel = new DocumentModel();

  // 2. Criar controllers (injectando dependências)
  const docCtrl  = new DocumentController(creditModel);
  const payCtrl  = new PaymentController(creditModel);
  const ocrCtrl  = new OCRController(docModel);

  // Passar docModel ao docCtrl (para OCR)
  docCtrl.docModel = docModel;
  ocrCtrl.docModel = docModel;

  // Expor globalmente para acesso em HTML inline (compatibilidade)
  window.paymentController = payCtrl;
  window.ocrController     = ocrCtrl;
  window.docController     = docCtrl;

  // 3. Actualizar UI de créditos ao mudar
  window.addEventListener('creditsChanged', e => {
    const val = e.detail;
    const el = document.getElementById('creditVal');
    if (el) el.textContent = val;
    const chip = document.getElementById('creditPill');
    if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';

    // Atualizar banner de créditos gratuitos
    const freeKey = Storage.getFreeKey();
    const freeUsed = Storage.get(freeKey, 0);
    const freeLeft = Math.max(0, 3 - freeUsed);
    const el2 = document.getElementById('freeLeft');
    if (el2) el2.textContent = freeLeft;
    if (freeLeft === 0) {
      const bar = document.getElementById('freeBar');
      if (bar) bar.style.display = 'none';
    }
  });

  // Trigger inicial
  window.dispatchEvent(new CustomEvent('creditsChanged', { detail: creditModel.value }));

  // 4. FAB WhatsApp
  const userModel = new UserModel();
  const fab = document.getElementById('fabWa');
  if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

  // 5. Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('[MzDocs] SW registado ✅'))
      .catch(e => console.warn('[MzDocs] SW erro:', e));
  }

  console.log('[MzDocs Pro v3] Iniciado — MVC ✅ | Créditos:', creditModel.value);
}

// Aguardar DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}