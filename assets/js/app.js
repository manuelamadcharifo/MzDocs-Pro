// assets/js/app.js — MVC Entry Point v7.3 (analytics + credit badge)
// ALTERAÇÕES v7.3:
//  1. Import Analytics module
//  2. creditsChanged: badge colorido (vermelho/laranja/verde) com mensagem
//  3. authManager.onChange: trackLogin / trackSignUp via eventos globais
//  4. initScrollDepth chamado na landing page
//  5. CTA hero trackeado com trackCTAClick
//  Preservado: toda a lógica existente — inalterada

import { Storage } from './utils/Storage.js';

// CSP (auditoria Ago/2026): fallback do avatar do utilizador movido de
// onerror inline para listener delegado. 'error' em <img> não faz bubble,
// por isso precisa de capture:true para ser apanhado num único listener
// no document (em vez de um por cada avatar renderizado).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.classList && img.classList.contains('avatar-img')) {
    img.parentElement.textContent = img.dataset.fallbackInitials || '';
  }
}, true);
import { initHome } from './homeController.js';
import { CreditModel, DocumentModel } from './models/Models.js';
import { DocumentController } from './controllers/DocumentController.js';
import { PaymentController, syncPackagesV8FromConfig, renderPackageCards } from './controllers/PaymentController.js';
import { updatePackagesFromConfig, updateWhatsAppFromConfig, loadMyExclusivePackages } from './services/PaymentService.js';
import { OCRController } from './controllers/OCRController.js';
import { HistoryController } from './controllers/HistoryController.js';
import { authManager } from './auth/AuthManager.js';
import { authUI } from './auth/AuthUI.js';
import { authGuard } from './auth/AuthGuard.js';
import { DocumentEditor } from './components/DocumentEditor.js';
import { Analytics } from './analytics/Analytics.js';
import { MarketingTracker } from './services/MarketingTracker.js';

// ── CAPTURA LINK DE AFILIADO (?ref=CODIGO) ─────────────────────────────────
// CORRIGIDO: este bloco duplicava a captura do ref e o registo do clique já
// feitos em index.html (3 pontos independentes no total gravavam o código,
// dois deles em sessionStorage — que se perde ao fechar o separador/app e
// é por isso que os "Registados" ficavam sempre a 0 apesar dos "Cliques"
// subirem). A captura e o registo do clique agora acontecem uma única vez,
// em index.html, gravando em localStorage (persistente). Nada a fazer aqui.
// ───────────────────────────────────────────────────────────────────────────

async function bootstrap() {
  // NOVO (Fase 1 — Marketing Analytics): inicializado antes de tudo, para
  // que window.marketingTracker já exista quando AuthManager/DocumentController
  // tentarem disparar eventos (signup, login, documento gerado, …).
  window.marketingTracker = MarketingTracker.init();

  await authManager.ready();

  // CORRIGIDO: carregar /api/config (incluindo preços/créditos reais dos
  // pacotes) ANTES de instanciar o PaymentController — eliminava-se assim
  // a janela em que o utilizador podia abrir o checkout com os valores
  // hard-coded antigos, antes da config real chegar.
  let _config = {};
  try {
    _config = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  } catch { }
  window._mzConfig = _config;
  updatePackagesFromConfig(_config.packages);
  syncPackagesV8FromConfig(_config.packages);
  // NOVO (v65): pacotes exclusivos por categoria de parceiro/afiliado —
  // carregados ANTES da primeira renderização dos cartões, para que já
  // apareçam de imediato se o utilizador tiver sessão activa (evita um
  // "flash" sem eles seguido de uma re-renderização).
  await loadMyExclusivePackages(authManager.getToken ? authManager.getToken() : null);
  renderPackageCards();
  updateWhatsAppFromConfig(_config.whatsappSupport);

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
    // NOVO (v65): login/logout a meio da sessão muda quem é/não é
    // parceiro — recarrega os pacotes exclusivos e actualiza os cartões
    // do checkout de imediato, em vez de só na próxima visita à página.
    loadMyExclusivePackages(authManager.getToken ? authManager.getToken() : null)
      .then(() => renderPackageCards())
      .catch(() => {});
  });

  // ── Credit badge colorido ─────────────────────────────────────────────
  // NOVO (v66): actualiza o badge de créditos, mostrando "Grátis" em vez
  // do número de créditos (que pode legitimamente ser 0) enquanto o
  // utilizador ainda tiver direito a um documento inicial grátis — ver
  // CreditModel.hasFreeDocument/freeDocsRemaining. Chamada tanto quando os
  // créditos mudam como quando o estado do documento grátis muda (ex.:
  // acabou de ser consumido), para nunca ficar dessincronizado.
  function _updateCreditBadge() {
    const val   = creditModel.credits;
    const chip  = document.getElementById('creditPill');
    const el    = document.getElementById('creditVal');
    const icon  = chip?.querySelector('.cp-icon');
    const lbl   = chip?.querySelector('.cp-lbl');
    if (!chip) return;

    if (creditModel.hasFreeDocument) {
      const remaining = creditModel.freeDocsRemaining;
      if (icon) icon.textContent = '🎁';
      if (el)   el.textContent   = 'Grátis';
      if (lbl)  lbl.textContent  = '';
      chip.style.borderColor = '#10B981';
      chip.style.color       = '#10B981';
      chip.title = remaining === 1
        ? 'Tem 1 documento grátis por usar'
        : `Tem ${remaining} documentos grátis por usar`;
      return;
    }

    if (icon) icon.textContent = '⚡';
    if (lbl)  lbl.textContent  = 'cr';
    if (el)   el.textContent   = val;

    // Cor e borda dinâmica conforme nível de créditos
    if (val === 0) {
      chip.style.borderColor  = '#EF4444';
      chip.style.color        = '#EF4444';
      chip.title              = 'Sem créditos — Recarregue!';
    } else if (val === 1) {
      chip.style.borderColor  = '#F59E0B';
      chip.style.color        = '#F59E0B';
      chip.title              = 'Só tem 1 crédito restante';
    } else if (val === 2) {
      chip.style.borderColor  = '#F59E0B';
      chip.style.color        = '#D97706';
      chip.title              = `Tem ${val} créditos`;
    } else {
      chip.style.borderColor  = '';
      chip.style.color        = '';
      chip.title              = `Créditos disponíveis: ${val}`;
    }
  }

  window.addEventListener('creditsChanged', _updateCreditBadge);
  window.addEventListener('freeDocsChanged', _updateCreditBadge);
  _updateCreditBadge();

  const { UserModel } = await import('./models/Models.js');
  const userModel = new UserModel();
  userModel.updateWhatsAppSupportFromConfig(_config.whatsappSupport);
  const fab = document.getElementById('fabWa');
  if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

  // NOVO — o FAB de WhatsApp ficava sempre fixo por cima do conteúdo,
  // chegando a tapar os cartões de serviço ao percorrer a lista. Agora
  // esconde-se enquanto se faz scroll para baixo e volta a aparecer ao
  // parar ou ao subir — continua acessível sem ficar no caminho.
  if (fab) {
    let lastY = window.scrollY;
    let hideTimer = null;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      const goingDown = y > lastY && y > 80;
      fab.classList.toggle('fab-hidden', goingDown);
      lastY = y;
      clearTimeout(hideTimer);
      // Parou de fazer scroll (mesmo a meio de um gesto para baixo) → mostrar de novo
      hideTimer = setTimeout(() => fab.classList.remove('fab-hidden'), 900);
    }, { passive: true });
  }

  // NOTA: o contador de documentos gerados já é mostrado no hero (ver
  // homeController.js → _animateSocialCounter). Havia aqui um segundo
  // contador duplicado ("X documentos gerados por moçambicanos") logo
  // acima de "O que precisa criar?" — removido para não repetir a mesma
  // informação duas vezes na mesma página.

  // ── Inicializar homepage de conversão ──────────────────────────────────
  initHome().catch(e => console.warn('[MzDocs] homeController erro:', e));

  // ── Analytics: scroll depth na landing page ────────────────────────────
  Analytics.initScrollDepth();

  // ── Analytics: tracking do CTA hero ───────────────────────────────────
  document.getElementById('heroCta')?.addEventListener('click', () => {
    Analytics.trackCTAClick('Obter o meu primeiro documento GRÁTIS', 'hero');
  });

  // ── Onboarding de 15 segundos (só na primeira visita) ──────────────────
  _showOnboardingIfNeeded();

  // ── Deep-links de acção (?topup=1 / ?history=1) ─────────────────────────
  // Usados por /perfil.html para que "Comprar Créditos" e "Ver arquivo
  // completo" abram directamente o modal correspondente na home, em vez de
  // simplesmente deixar o utilizador na página inicial sem fazer nada.
  _handleActionDeepLinks(payCtrl, histCtrl);

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[MzDocs] SW registado ✅');

      // CORRIGIDO: listener de actualização do SW.
      // Quando o Service Worker activa uma nova versão, envia postMessage SW_UPDATED.
      // Aqui decidimos quando é seguro recarregar: só se não houver modal aberto
      // e não estiver a gerar um documento — evita congelar a app a meio de uma operação.
      // CORRIGIDO (relatado pelo utilizador: "a app recarrega sozinha ao fim
      // de um tempo"): antes, ao detectar uma versão nova do Service
      // Worker, a app recarregava-se SOZINHA — e se houvesse um modal aberto
      // ou uma geração em curso, esperava até 5 minutos e recarregava à
      // força de qualquer forma, apagando o que a pessoa estivesse a fazer
      // sem aviso. Como o projecto tem saído com deploys frequentes, isto
      // acontecia no meio de sessões normais. Agora nunca recarrega
      // sozinha — mostra um aviso fixo e discreto, e só actualiza quando o
      // próprio utilizador escolher.
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type !== 'SW_UPDATED') return;
        console.log('[MzDocs] Nova versão disponível:', event.data.version);
        _showUpdateBanner();
      });

      function _showUpdateBanner() {
        if (document.getElementById('mzUpdateBanner')) return; // já visível
        const bar = document.createElement('div');
        bar.id = 'mzUpdateBanner';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;'
          + 'background:var(--ink,#07101F);color:#fff;padding:12px 16px;'
          + 'display:flex;align-items:center;justify-content:space-between;gap:10px;'
          + 'font-size:12.5px;box-shadow:0 -4px 16px rgba(0,0,0,.25);'
          + 'padding-bottom:calc(12px + env(safe-area-inset-bottom));';
        bar.innerHTML = `
          <span>✨ Há uma versão nova do MzDocs Pro.</span>
          <span style="display:flex;gap:8px;flex-shrink:0">
            <button id="mzUpdateNow" style="background:var(--green,#16A34A);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer">Actualizar</button>
            <button id="mzUpdateLater" style="background:transparent;color:rgba(255,255,255,.6);border:none;font-size:12px;cursor:pointer">Depois</button>
          </span>`;
        document.body.appendChild(bar);
        document.getElementById('mzUpdateNow').onclick = () => location.reload();
        document.getElementById('mzUpdateLater').onclick = () => bar.remove();
      }
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

  // ── Auth: ouvir eventos globais emitidos por AuthUI ────────────────────
  // CORRIGIDO: antes só registávamos analytics aqui — o CreditModel nunca
  // era re-sincronizado após um login/registo feito sem reload da página,
  // por isso o utilizador ficava a ver "0" créditos (e qualquer serviço
  // pedia pagamento) mesmo já tendo saldo — incluindo o crédito grátis de
  // boas-vindas ou de referência de afiliado — até fazer reload manual.
  window.addEventListener('mz:signup', () => {
    Analytics.trackSignUp('email');
    creditModel.refreshAfterLogin();
  });
  window.addEventListener('mz:login', () => {
    Analytics.trackLogin('email');
    creditModel.refreshAfterLogin();
  });
}

// ── Deep-links de acção vindos de outras páginas (ex: /perfil.html) ───────
// Suporta:
//   /?topup=1    → abre o modal de compra de créditos
//   /?history=1  → abre o modal de "Meus Documentos" (arquivo)
// A query-string é limpa da URL depois de aberto o modal, para que um
// refresh da página não reabra o modal indefinidamente.
function _handleActionDeepLinks(payCtrl, histCtrl) {
  try {
    const params = new URLSearchParams(window.location.search);
    const wantsTopup   = params.get('topup')   === '1';
    const wantsHistory = params.get('history') === '1';
    if (!wantsTopup && !wantsHistory) return;

    const clean = new URL(window.location.href);
    clean.searchParams.delete('topup');
    clean.searchParams.delete('history');
    window.history.replaceState({}, '', clean.toString());

    setTimeout(() => {
      if (wantsTopup)   payCtrl?.showPricing?.();
      if (wantsHistory) histCtrl?.open?.();
    }, 300);
  } catch (e) {
    console.warn('[MzDocs] _handleActionDeepLinks erro:', e);
  }
}

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function _setupPushNotifications(registration) {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return;

  // Já subscrito neste dispositivo — nada a fazer (o SW já sabe receber push).
  if (Notification.permission === 'granted') {
    const existing = await registration.pushManager.getSubscription().catch(() => null);
    if (existing) return;
  }

  // Pedir permissão de forma não intrusiva — só após 30s na app, e só a
  // utilizadores autenticados (ver chamador em main()).
  setTimeout(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      console.log('[MzDocs] Notificações push activadas ✅');

      const cfgRes = await fetch('/api/misc?action=config');
      const cfg = await cfgRes.json();
      if (!cfg.vapidPublicKey) {
        console.warn('[MzDocs] VAPID_PUBLIC_KEY não configurada no servidor — push desactivado.');
        return;
      }

      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _urlBase64ToUint8Array(cfg.vapidPublicKey),
        });
      }

      const token = authManager.getToken?.();
      await fetch('/api/misc?action=push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      }).catch(() => {});
    } catch (e) {
      console.warn('[MzDocs] Falha ao subscrever push:', e);
    }
  }, 30000);
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
      const phone     = user.phone || user._profile?.phone || '';
      const email     = user.email || user._profile?.email || '';
      const name      = user._profile?.full_name
                     || user.user_metadata?.full_name
                     || (phone ? `···${phone.slice(-4)}` : 'Utilizador');
      const initials  = name.charAt(0).toUpperCase();
      const subtitle  = email || phone || '';
      const avatarUrl = user._profile?.avatar_url || '';
      const isAdmin   = authManager.isAdmin();
      const isAffil   = user._profile?.is_affiliate === true;

      // NOTA: o botão redundante de acesso rápido ao perfil (ícone 👤 solto
      // no header, ao lado do ícone de Arquivo) foi removido — clicar no
      // avatar/"M" já abre o dropdown com o link "O Meu Perfil", pelo que
      // o ícone extra era duplicado e confuso.
      document.getElementById('btnProfileQuick')?.remove();

      const avatarInner = avatarUrl
        ? `<img class="avatar-img" src="${avatarUrl}" alt="${name}" data-fallback-initials="${initials}">`
        : initials;

      // Usar classes CSS do styles.css — sem inline styles
      if (userMenu) {
        userMenu.innerHTML = `
          <div class="usr-avatar-wrap" id="usrAvatarWrap">
            <div class="usr-avatar" title="${name}">${avatarInner}</div>
            <div class="usr-dropdown" id="usrDropdown">
              <div class="usr-dd-name">${name}</div>
              <div class="usr-dd-sub">${subtitle}</div>
              <hr class="usr-dd-sep"/>
              <a class="usr-dd-link" href="/perfil.html#dados">👤 O Meu Perfil</a>
              <a class="usr-dd-link" href="/perfil.html">🎯 Painel de Controlo</a>
              <a class="usr-dd-link" href="/perfil.html#documentos">📁 Meus Documentos</a>
              <a class="usr-dd-link" href="/afiliado.html">${isAffil ? '🤝 Painel de Afiliado' : '💰 Tornar-me Afiliado'}</a>
              ${isAdmin ? '<a class="usr-dd-link" href="/admin.html">🛡️ Administração</a>' : ''}
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
      document.getElementById('btnProfileQuick')?.remove();
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
  // CORRIGIDO (auditoria 3.6): o onboarding avançava sozinho a cada ~3s
  // mesmo que a pessoa ainda estivesse a ler — só havia "Saltar" como
  // escape. Agora, tocar e segurar a caixa pausa o avanço automático
  // (mesmo padrão do "stories" do Instagram), e solta para continuar.
  let paused      = false;

  const dots    = overlay.querySelectorAll('.mzob-dot');
  const steps   = overlay.querySelectorAll('.mzob-step');
  const bar     = document.getElementById('mzobBar');
  const btnNext = document.getElementById('mzobNext');
  const btnSkip = document.getElementById('mzobSkip');
  const box     = document.getElementById('mzOnboardBox');

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
    document.removeEventListener('pointerup', resume);
    document.removeEventListener('pointercancel', resume);
    try { localStorage.setItem('mz_onboarded','1'); } catch(_) {}
    overlay.style.animation = 'none';
    overlay.style.opacity   = '0';
    overlay.style.transition = 'opacity .3s';
    setTimeout(() => overlay.remove(), 300);
  }

  // Auto-advance timer
  const TICK = 100; // ms
  timer = setInterval(() => {
    if (paused) return;
    elapsed += TICK;
    const totalElapsed = currentStep * step_ms + elapsed;
    if (bar) bar.style.width = Math.min(100, (totalElapsed / TOTAL_MS) * 100) + '%';
    if (elapsed >= step_ms) {
      if (currentStep < STEPS.length - 1) goTo(currentStep + 1);
      else finish();
    }
  }, TICK);

  // Premir e segurar a caixa pausa o avanço automático; largar retoma.
  if (box) {
    box.addEventListener('pointerdown', () => { paused = true; if (bar) bar.style.transition = 'none'; });
  }
  const resume = () => { paused = false; if (bar) bar.style.transition = 'width .1s linear'; };
  document.addEventListener('pointerup', resume);
  document.addEventListener('pointercancel', resume);

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
