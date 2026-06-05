// assets/js/app.js — MVC Entry Point v7.2

import { Storage } from './utils/Storage.js';
import { initHome } from './homeController.js';
import { CreditModel, DocumentModel } from './models/Models.js';
import { DocumentController } from './controllers/DocumentController.js';
import { PaymentController } from './controllers/PaymentController.js';
import { OCRController } from './controllers/OCRController.js';
import { HistoryController } from './controllers/HistoryController.js';
import { authManager } from './auth/AuthManager.js';
import { authUI } from './auth/AuthUI.js';
import { authGuard } from './auth/AuthGuard.js';
import { DocumentEditor } from './components/DocumentEditor.js';

// ── CAPTURA LINK DE AFILIADO (?ref=CODIGO) ─────────────────────────────────
(function () {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.length <= 20) {
      sessionStorage.setItem('mz_ref', ref.trim().toUpperCase());
      // Chamar API para registar o clique
      fetch('/api/affiliate/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_code: ref.trim().toUpperCase(), page: window.location.pathname }),
      }).catch(() => {}); // silencioso — não bloquear o site
      // Limpar o ?ref= da URL sem recarregar
      const clean = new URL(window.location.href);
      clean.searchParams.delete('ref');
      window.history.replaceState({}, '', clean.toString());
    }
  } catch (_) {}
})();
// ───────────────────────────────────────────────────────────────────────────

async function bootstrap() {
  await authManager.ready();

  const creditModel = new CreditModel();
  await creditModel.init();
  const docModel = new DocumentModel();

  window.documentEditor = new DocumentEditor();

  const docCtrl  = new DocumentController(creditModel);
  const payCtrl  = new PaymentController(creditModel);
  const ocrCtrl  = new OCRController(docModel);
  const histCtrl = new HistoryController();

  docCtrl.docModel = docModel;
  ocrCtrl.docModel = docModel;

  window.paymentController  = payCtrl;
  window.ocrController      = ocrCtrl;
  window.docController      = docCtrl;
  window.historyController  = histCtrl;
  window.authManager        = authManager;
  window.authUI             = authUI;

  _setupAuthHeader();

  authManager.onChange(() => {
    authGuard.applyVisibility();
  });

  window.addEventListener('creditsChanged', e => {
    const val = e.detail;
    const el  = document.getElementById('creditVal');
    if (el) el.textContent = val;
    const chip = document.getElementById('creditPill');
    if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';
  });

  window.dispatchEvent(new CustomEvent('creditsChanged', { detail: creditModel.value }));

  const { UserModel } = await import('./models/Models.js');
  const userModel = new UserModel();
  const fab = document.getElementById('fabWa');
  if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

  // Sandbox bar sempre oculta (pagamentos em produção)
  const sandboxBar = document.getElementById('sandboxBar');
  if (sandboxBar) sandboxBar.style.display = 'none';

  let _config = {};
  try {
    _config = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  } catch { }

  // Expor config globalmente para homeController e outros módulos
  window._mzConfig = _config;

  // ── Contador público de documentos gerados ──────────────────────────────
  if (_config.docsGenerated != null) {
    const bar = document.getElementById('docCounterBar');
    const num = document.getElementById('docCounterNum');
    if (bar && num) {
      // Animar o número de 0 até o valor real
      const target = Math.max(0, _config.docsGenerated);
      if (target > 0) {
        bar.style.display = 'block';
        let current = Math.max(0, target - 50);
        const step  = Math.ceil((target - current) / 40);
        const timer = setInterval(() => {
          current = Math.min(current + step, target);
          num.textContent = current.toLocaleString('pt-MZ');
          if (current >= target) clearInterval(timer);
        }, 30);
      }
    }
  }

  // ── Inicializar homepage de conversão ──────────────────────────────────
  initHome().catch(e => console.warn('[MzDocs] homeController erro:', e));

  // ── Onboarding de 15 segundos (só na primeira visita) ──────────────────
  _showOnboardingIfNeeded();

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[MzDocs] SW registado ✅');

      // CORRIGIDO: listener de actualização do SW.
      // Quando o Service Worker activa uma nova versão, envia postMessage SW_UPDATED.
      // Aqui decidimos quando é seguro recarregar: só se não houver modal aberto
      // e não estiver a gerar um documento — evita congelar a app a meio de uma operação.
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type !== 'SW_UPDATED') return;
        console.log('[MzDocs] SW actualizado para', event.data.version, '— a verificar se é seguro recarregar…');

        const isSafe = () => {
          const hasOpenModal  = !!document.querySelector('.open[id]');
          const isGenerating  = !!window.docController?._generating;
          return !hasOpenModal && !isGenerating;
        };

        if (isSafe()) {
          console.log('[MzDocs] Seguro — a recarregar agora.');
          location.reload();
        } else {
          // Aguardar até não haver modal aberto nem geração em curso
          console.log('[MzDocs] Modal/geração em curso — aguardar para recarregar…');
          const check = setInterval(() => {
            if (isSafe()) {
              clearInterval(check);
              console.log('[MzDocs] Livre — a recarregar agora.');
              location.reload();
            }
          }, 1500);
          // Segurança: recarregar no máximo após 5 min mesmo que algo fique preso
          setTimeout(() => { clearInterval(check); location.reload(); }, 5 * 60 * 1000);
        }
      });
      authManager.onChange(user => {
        if (user && !user.is_anonymous) {
          _setupPushNotifications(registration).catch(() => {});
        }
      });
    } catch (e) {
      console.warn('[MzDocs] SW erro:', e);
    }
  }

  console.log('[MzDocs Pro v9] Iniciado ✅ | Créditos:', creditModel.value);

  // ── Escape global: fecha qualquer modal aberto ──────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Fechar todos os overlays com classe .open
    document.querySelectorAll('.open[id]').forEach(el => el.classList.remove('open'));
    document.body.style.overflow = '';
    // Libertar qualquer botão de geração bloqueado
    const btnGen = document.getElementById('btnGen');
    if (btnGen) { btnGen.disabled = false; btnGen.style.opacity = ''; }
  });

  // ── Watchdog: se body.overflow ficar 'hidden' sem modal aberto, corrigir ─
  setInterval(() => {
    const hasOpenModal = !!document.querySelector('.open[id]');
    if (!hasOpenModal && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
      console.warn('[MzDocs] Watchdog: overflow corrigido automaticamente');
    }
  }, 3000);
}

async function _setupPushNotifications(registration) {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  console.log('[MzDocs] Notificações push activadas ✅');
}

// Singleton: listener de fechar dropdown registado só uma vez
let _dropdownListenerAttached = false;

function _setupAuthHeader() {
  const authBtn     = document.getElementById('authBtn');
  const userArea    = document.getElementById('userArea');
  const userMenu    = document.getElementById('userMenu');
  const guestBar    = document.getElementById('guestBar');
  const btnGuestBuy = document.getElementById('btnGuestBuy');

  btnGuestBuy?.addEventListener('click', () => {
    window.paymentController?.openAsGuest();
  });

  authManager.onChange(user => {
    if (user && !user.is_anonymous) {
      // ── Autenticado ─────────────────────────────────────────────────────────
      if (authBtn)  authBtn.style.display  = 'none';
      if (userArea) userArea.classList.add('visible');
      if (guestBar) guestBar.style.display = 'none';

      // FAB logout (só visível em mobile via CSS)
      const fabLogout = document.getElementById('fabLogout');
      if (fabLogout) {
        fabLogout.style.display = 'flex';
        fabLogout.onclick = () => {
          if (confirm('Terminar sessão?')) {
            authManager.signOut().then(() => location.reload());
          }
        };
      }

      // Dados do utilizador
      const phone    = user.phone || user._profile?.phone || '';
      const email    = user.email || user._profile?.email || '';
      const name     = user._profile?.full_name
                    || user.user_metadata?.full_name
                    || (phone ? `···${phone.slice(-4)}` : 'Utilizador');
      const initials = name.charAt(0).toUpperCase();
      const subtitle = email || phone || '';

      // Usar classes CSS do styles.css — sem inline styles
      if (userMenu) {
        userMenu.innerHTML = `
          <div class="usr-avatar-wrap" id="usrAvatarWrap">
            <div class="usr-avatar" title="${name}">${initials}</div>
            <div class="usr-dropdown" id="usrDropdown">
              <div class="usr-dd-name">${name}</div>
              <div class="usr-dd-sub">${subtitle}</div>
              <hr class="usr-dd-sep"/>
              <button class="usr-dd-btn" id="btnLogout">🚪 Terminar sessão</button>
            </div>
          </div>
        `;

        const wrap = document.getElementById('usrAvatarWrap');
        const drop = document.getElementById('usrDropdown');

        wrap?.addEventListener('click', e => {
          e.stopPropagation();
          drop?.classList.toggle('open');
        });

        document.getElementById('btnLogout')?.addEventListener('click', e => {
          e.stopPropagation();
          if (confirm('Terminar sessão?')) {
            authManager.signOut().then(() => location.reload());
          }
        });

        if (!_dropdownListenerAttached) {
          _dropdownListenerAttached = true;
          document.addEventListener('click', () => {
            document.getElementById('usrDropdown')?.classList.remove('open');
          }, { capture: true });
        }
      }

    } else {
      // ── Não autenticado ─────────────────────────────────────────────────────
      if (authBtn) {
        authBtn.style.display = 'block';
        authBtn.textContent   = '🔐 Entrar';
        authBtn.onclick       = () => authUI.open('login');
      }
      if (userArea) userArea.classList.remove('visible');
      if (guestBar) guestBar.style.display = 'flex';

      const fabLogout = document.getElementById('fabLogout');
      if (fabLogout) fabLogout.style.display = 'none';
    }
  });
}

// ── Onboarding 15 segundos ────────────────────────────────────────────────
function _showOnboardingIfNeeded() {
  try {
    if (localStorage.getItem('mz_onboarded')) return;
  } catch (_) { return; }

  const CSS = `
#mzOnboard{position:fixed;inset:0;z-index:800;background:rgba(7,16,31,.82);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;padding:16px;animation:tplFadeIn .3s ease;}
#mzOnboardBox{background:#fff;border-radius:20px;width:100%;max-width:360px;overflow:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.3);animation:tplSlideUp .4s cubic-bezier(.34,1.1,.64,1);}
.mzob-step{display:none;padding:28px 24px 20px;}
.mzob-step.active{display:block;}
.mzob-icon{font-size:44px;text-align:center;margin-bottom:14px;}
.mzob-title{font-size:17px;font-weight:800;color:#0f172a;text-align:center;margin-bottom:8px;}
.mzob-desc{font-size:13.5px;color:#475569;text-align:center;line-height:1.6;margin-bottom:20px;}
.mzob-dots{display:flex;justify-content:center;gap:6px;margin-bottom:20px;}
.mzob-dot{width:8px;height:8px;border-radius:50%;background:#e2e8f0;transition:background .2s;}
.mzob-dot.active{background:#3B82F6;}
.mzob-bar-wrap{height:3px;background:#f1f5f9;margin:0 -24px;margin-bottom:16px;}
.mzob-bar{height:3px;background:linear-gradient(90deg,#3B82F6,#10b981);width:0%;transition:width .1s linear;}
.mzob-btns{display:flex;gap:8px;}
.mzob-btn-skip{flex:1;padding:11px;border:1.5px solid #e2e8f0;border-radius:12px;background:#fff;
  font-size:13px;font-weight:600;color:#64748b;cursor:pointer;font-family:inherit;}
.mzob-btn-next{flex:2;padding:11px;border:none;border-radius:12px;
  background:linear-gradient(135deg,#1e40af,#3B82F6);color:#fff;
  font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;}
@keyframes tplFadeIn{from{opacity:0}to{opacity:1}}
@keyframes tplSlideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`;

  const STEPS = [
    { icon:'📄', title:'Bem-vindo ao MzDocs Pro!', desc:'Crie documentos profissionais em segundos com Inteligência Artificial. Rápido, simples e pensado para Moçambique.' },
    { icon:'🎯', title:'Escolha o seu documento', desc:'Trabalho escolar, currículo, carta formal, orçamento de obra e muito mais — basta clicar no serviço que precisa.' },
    { icon:'🤖', title:'A IA faz o trabalho', desc:'Preencha um formulário rápido e a nossa IA gera o documento completo em segundos, já formatado e pronto a usar.' },
    { icon:'🎨', title:'Personalize o modelo', desc:'Escolha entre 5 estilos visuais por serviço. Exporte em PDF ou Word com um toque.' },
    { icon:'🚀', title:'Pronto a começar!', desc:'Toque em qualquer serviço na lista abaixo. O primeiro documento de demonstração é gratuito.' },
  ];

  const TOTAL_MS = 15000;
  const step_ms  = TOTAL_MS / STEPS.length;

  // Injectar CSS
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Criar overlay
  const overlay = document.createElement('div');
  overlay.id = 'mzOnboard';
  overlay.innerHTML = `
    <div id="mzOnboardBox">
      <div class="mzob-bar-wrap"><div class="mzob-bar" id="mzobBar"></div></div>
      <div class="mzob-dots">${STEPS.map((_,i) => `<div class="mzob-dot${i===0?' active':''}"></div>`).join('')}</div>
      ${STEPS.map((s,i) => `
        <div class="mzob-step${i===0?' active':''}">
          <div class="mzob-icon">${s.icon}</div>
          <div class="mzob-title">${s.title}</div>
          <div class="mzob-desc">${s.desc}</div>
        </div>`).join('')}
      <div style="padding:0 24px 20px;">
        <div class="mzob-btns">
          <button class="mzob-btn-skip" id="mzobSkip">Saltar</button>
          <button class="mzob-btn-next" id="mzobNext">Próximo →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let currentStep = 0;
  let elapsed     = 0;
  let timer       = null;

  const dots    = overlay.querySelectorAll('.mzob-dot');
  const steps   = overlay.querySelectorAll('.mzob-step');
  const bar     = document.getElementById('mzobBar');
  const btnNext = document.getElementById('mzobNext');
  const btnSkip = document.getElementById('mzobSkip');

  function goTo(idx) {
    steps.forEach((s,i)  => s.classList.toggle('active', i === idx));
    dots.forEach((d,i)   => d.classList.toggle('active', i === idx));
    currentStep = idx;
    elapsed     = 0;
    if (idx === STEPS.length - 1) btnNext.textContent = '✅ Começar!';
    else btnNext.textContent = 'Próximo →';
  }

  function finish() {
    clearInterval(timer);
    try { localStorage.setItem('mz_onboarded','1'); } catch(_) {}
    overlay.style.animation = 'none';
    overlay.style.opacity   = '0';
    overlay.style.transition = 'opacity .3s';
    setTimeout(() => overlay.remove(), 300);
  }

  // Auto-advance timer
  const TICK = 100; // ms
  timer = setInterval(() => {
    elapsed += TICK;
    const totalElapsed = currentStep * step_ms + elapsed;
    if (bar) bar.style.width = Math.min(100, (totalElapsed / TOTAL_MS) * 100) + '%';
    if (elapsed >= step_ms) {
      if (currentStep < STEPS.length - 1) goTo(currentStep + 1);
      else finish();
    }
  }, TICK);

  btnNext.addEventListener('click', () => {
    if (currentStep < STEPS.length - 1) goTo(currentStep + 1);
    else finish();
  });
  btnSkip.addEventListener('click', finish);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
