// assets/js/homeController.js — Conversão Freemium v1.0
// Responsável por:
//   1. Mostrar/ocultar secção de serviços conforme estado de login
//   2. Animar contador social de documentos
//   3. Dar crédito de boas-vindas a novos utilizadores
//   4. Botão CTA "Primeiro documento grátis" para visitantes

import { authManager } from './auth/AuthManager.js';
import { authUI }      from './auth/AuthUI.js';

// ─── Feature flags ────────────────────────────────────────────────────────────
const FEATURES = {
  welcome_bonus:   true,   // Crédito de boas-vindas para novos utilizadores
  social_proof:    true,   // Contador animado de documentos gerados
  guest_cta:       true,   // Botão CTA + teaser para visitantes
  how_it_works:    true,   // Secção "Como funciona" visível a todos
  real_reviews:    true,   // Estrelas reais no hero + testemunhos aprovados
};

// ─── initHome ─────────────────────────────────────────────────────────────────
export async function initHome() {
  // Aguardar auth antes de qualquer decisão de visibilidade
  await authManager.ready();

  _applyVisibility(authManager.user);

  // Reagir a mudanças de sessão (login / logout durante a visita)
  authManager.onChange(user => _applyVisibility(user));

  // Contador social (independente de auth)
  if (FEATURES.social_proof) _animateSocialCounter();

  // Estrelas reais no hero + testemunhos aprovados (independente de auth)
  if (FEATURES.real_reviews) _loadRealReviews();
}

// ─── Visibilidade condicional ─────────────────────────────────────────────────
function _applyVisibility(user) {
  const isAuth = !!user && !user.is_anonymous;

  // Secção de serviços — visível só para autenticados
  const servicesSection = document.getElementById('servicesSection');
  if (servicesSection) {
    servicesSection.style.display = isAuth ? '' : 'none';
  }

  // Teaser para visitantes — visível só para não autenticados
  const guestTeaser = document.getElementById('guestTeaser');
  if (guestTeaser) {
    guestTeaser.style.display = isAuth ? 'none' : '';
  }

  // Hero CTA principal — mudar texto conforme estado
  const heroCta = document.getElementById('heroCta');
  if (heroCta) {
    if (isAuth) {
      heroCta.textContent = '📄 Ver os meus serviços';
      heroCta.onclick = () => {
        const el = document.getElementById('servicesSection');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      };
    } else {
      heroCta.textContent = '🎁 Obter o meu primeiro documento GRÁTIS';
      heroCta.onclick = () => authUI.open('register');
    }
  }

  // Crédito de boas-vindas para novos utilizadores autenticados
  if (isAuth && FEATURES.welcome_bonus) {
    _checkWelcomeBonus(user.id).catch(() => {});
  }
}

// ─── Crédito de boas-vindas ───────────────────────────────────────────────────
// Verifica se o utilizador acabou de se registar (sem créditos ainda) e notifica.
// A atribuição real do crédito é feita no servidor em /api/auth (signup),
// aqui apenas mostramos o toast de boas-vindas na primeira visita pós-registo.
async function _checkWelcomeBonus(userId) {
  if (!FEATURES.welcome_bonus) return;

  const storageKey = `mz_welcome_shown_${userId}`;
  try {
    if (localStorage.getItem(storageKey)) return;
  } catch (_) { return; }

  // Verificar se a conta foi criada nos últimos 5 minutos (indica registo recente)
  const user = authManager.user;
  if (!user) return;

  const createdAt = user.created_at
    ? new Date(user.created_at).getTime()
    : (user._profile?.created_at ? new Date(user._profile.created_at).getTime() : 0);

  const isNew = createdAt && (Date.now() - createdAt) < 5 * 60 * 1000;
  if (!isNew) return;

  try { localStorage.setItem(storageKey, '1'); } catch (_) {}

  // Mostrar toast de boas-vindas
  _showWelcomeToast();
}

function _showWelcomeToast() {
  const msg = '🎉 Bem-vindo! Recebeu 1 crédito grátis para criar o seu primeiro documento.';
  if (typeof window.showToast === 'function') {
    window.showToast(msg, 5000);
    return;
  }
  // Fallback: criar notificação simples
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:999;
    background:linear-gradient(135deg,#065F46,#047857);color:#fff;
    border-radius:14px;padding:14px 20px;box-shadow:0 8px 32px rgba(0,0,0,.25);
    font-size:13.5px;font-weight:600;max-width:340px;width:calc(100% - 32px);
    text-align:center;animation:toastIn .35s cubic-bezier(.34,1.1,.64,1);
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 5000);
}

// ─── Formatação compacta de números (31 → "31", 2000 → "2k", 2300 → "2.3k",
//     1000000 → "1M") — aplicada sempre ao valor REAL vindo do servidor,
//     nunca a um número inventado.
function _formatCompact(n) {
  if (n >= 1000000) {
    const v = n / 1000000;
    return (Number.isInteger(v) ? v : v.toFixed(1)) + 'M';
  }
  if (n >= 1000) {
    const v = n / 1000;
    return (Number.isInteger(v) ? v : v.toFixed(1)) + 'k';
  }
  return String(n);
}

// ─── Animação do contador social ─────────────────────────────────────────────
// Lê o valor que já veio em /api/config (guardado em window._mzConfig por app.js)
// e anima o elemento #heroDocCount. Antes havia um fallback que inventava
// "1200" quando o valor real era 0 ou indisponível — substituído por
// mensagens honestas que se ajustam à fase real de crescimento.
function _animateSocialCounter() {
  const wrap = document.getElementById('hspCounter');
  const el   = document.getElementById('heroDocCount');
  if (!wrap || !el) return;

  // Aguardar até _mzConfig estar disponível (app.js define-o)
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const count = window._mzConfig?.docsGenerated;
    if (count != null || attempts > 30) {
      clearInterval(poll);

      if (count == null) {
        // Valor indisponível (erro de rede, etc.) — mensagem genérica em
        // vez de "…" pendurado ou um número inventado.
        wrap.innerHTML = '🇲🇿 Feito para Moçambique';
        return;
      }
      if (count <= 0) {
        wrap.innerHTML = '🆕 Novo — sê um dos primeiros a experimentar';
        return;
      }
      if (count < 50) {
        // Fase inicial: mostra o número real, mas sem o enquadrar como
        // "muito volume" — só como sinal de crescimento genuíno.
        wrap.innerHTML = `🚀 <strong id="heroDocCount">${count}</strong> documentos gerados — em crescimento`;
      } else {
        wrap.innerHTML = `📄 <strong id="heroDocCount">…</strong> documentos gerados em Moçambique 🇲🇿`;
        _runCounter(document.getElementById('heroDocCount'), count, _formatCompact);
        return;
      }
    }
  }, 200);
}

function _runCounter(el, target, formatFn) {
  const start = Math.max(0, target - Math.min(80, Math.floor(target * 0.06)));
  let current = start;
  const step  = Math.max(1, Math.ceil((target - start) / 45));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = formatFn ? formatFn(current) : current.toLocaleString('pt-MZ');
    if (current >= target) clearInterval(timer);
  }, 28);
}

// ─── Scroll suave para serviços (botão "Ver serviços" no teaser) ─────────────
export function scrollToServices() {
  const el = document.getElementById('servicesSection') || document.getElementById('svcGrid');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ─── Avaliações reais (v44) ───────────────────────────────────────────────────
// Substitui o antigo "⭐ 4.9 (128 avaliações)" fixo por um número real, e
// preenche a secção "O que dizem os utilizadores" só quando há testemunhos
// aprovados de verdade. Nunca inventa nem arredonda para cima na ausência
// de dados — mesma filosofia honesta do contador de documentos acima.
async function _loadRealReviews() {
  // 1. Estrelas do hero — usa o resumo que já veio em /api/config (mesma
  //    chamada que alimenta docsGenerated, sem pedido extra).
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const summary = window._mzConfig?.reviewsSummary;
    if (summary != null || attempts > 30) {
      clearInterval(poll);
      const starsEl = document.getElementById('hspStars');
      if (starsEl && summary && summary.count > 0) {
        starsEl.textContent = `⭐ ${summary.avg} (${summary.count} avaliaç${summary.count === 1 ? 'ão' : 'ões'})`;
        starsEl.style.display = '';
      }
      // Se ainda não há avaliações, o elemento fica escondido — em vez de
      // mostrar "0 avaliações", que passaria uma imagem pior do que não
      // mostrar nada.
    }
  }, 200);

  // 2. Testemunhos — pedido dedicado (lista completa, não vem em /api/config).
  try {
    const res  = await fetch('/api/misc?action=public-reviews');
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.testimonials) || !data.testimonials.length) return;

    const grid = document.getElementById('testimonialsGrid');
    const section = document.getElementById('testimonialsSection');
    if (!grid || !section) return;

    const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    grid.innerHTML = data.testimonials.map(t => `
      <div style="flex:1 1 240px;max-width:260px;background:#0F1B2E;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;">
        <div style="color:#FBBF24;font-size:14px;margin-bottom:8px;">${'⭐'.repeat(Math.max(1, Math.min(5, t.rating)))}</div>
        <p style="color:rgba(255,255,255,.85);font-size:13.5px;line-height:1.5;margin:0 0 10px;">${escapeHtml(t.comment)}</p>
        <div style="color:rgba(255,255,255,.4);font-size:12px;">${escapeHtml(t.name)}</div>
      </div>
    `).join('');

    section.style.display = '';
  } catch (err) {
    console.warn('[homeController] _loadRealReviews testimonials:', err.message);
  }
}

// ─── Abrir registo a partir do teaser ────────────────────────────────────────
export function openRegister() {
  authUI.open('register');
}
