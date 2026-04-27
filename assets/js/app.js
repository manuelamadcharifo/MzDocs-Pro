// assets/js/app.js — MVC Entry Point

import { Storage } from './utils/Storage.js';
import { CreditModel, DocumentModel } from './models/Models.js';
import { DocumentController } from './controllers/DocumentController.js';
import { PaymentController } from './controllers/PaymentController.js';
import { OCRController } from './controllers/OCRController.js';

async function bootstrap() {
  const creditModel = new CreditModel();
  await creditModel.init();

  const docModel = new DocumentModel();

  const docCtrl = new DocumentController(creditModel);
  const payCtrl = new PaymentController(creditModel);
  const ocrCtrl = new OCRController(docModel);

  docCtrl.docModel = docModel;
  ocrCtrl.docModel = docModel;

  window.paymentController = payCtrl;
  window.ocrController = ocrCtrl;
  window.docController = docCtrl;

  window.addEventListener('creditsChanged', e => {
    const val = e.detail;
    const el = document.getElementById('creditVal');
    if (el) el.textContent = val;
    const chip = document.getElementById('creditPill');
    if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';

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

  window.dispatchEvent(new CustomEvent('creditsChanged', { detail: creditModel.value }));

  const userModel = new (await import('./models/Models.js')).UserModel();
  const fab = document.getElementById('fabWa');
  if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('[MzDocs] SW registado ✅'))
      .catch(e => console.warn('[MzDocs] SW erro:', e));
  }

  console.log('[MzDocs Pro v3] Iniciado — MVC ✅ | Créditos:', creditModel.value);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}