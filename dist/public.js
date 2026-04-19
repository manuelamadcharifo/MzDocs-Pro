const serviceDetails = {
  cv: {
    title: 'CV Profissional',
    description: 'Prepara um currículo claro e fácil de usar.'
  },
  carta: {
    title: 'Carta Formal',
    description: 'Escreve uma carta pronta para enviar.'
  },
  trabalho: {
    title: 'Trabalho Escolar',
    description: 'Organiza o teu texto com estrutura correta.'
  },
  orcamento: {
    title: 'Orçamento',
    description: 'Cria um orçamento com valores simples.'
  }
};

const overlay = document.getElementById('formOverlay');
const formTitle = document.getElementById('formTitle');
const formSubtitle = document.getElementById('formSubtitle');
const formMessage = document.getElementById('formMessage');
const formAction = document.getElementById('formAction');
const formClose = document.getElementById('formClose');
let selectedService = 'cv';

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }
}

function openOverlay(serviceKey) {
  const service = serviceDetails[serviceKey] || serviceDetails.cv;
  selectedService = serviceKey;
  formTitle.textContent = service.title;
  formSubtitle.textContent = 'Vamos preparar o teu documento.';
  formMessage.textContent = service.description;
  formAction.textContent = 'Continuar';
  formAction.disabled = false;
  overlay.classList.remove('hidden');
}

function closeOverlay() {
  overlay.classList.add('hidden');
}

function handleAction() {
  formMessage.textContent = 'A tua escolha está a ser preparada. Em breve vais ver os próximos passos.';
  formAction.textContent = 'Pronto';
  formAction.disabled = true;
}

function bindEvents() {
  const serviceCards = document.querySelectorAll('[data-svc]');

  serviceCards.forEach(card => {
    const serviceKey = card.dataset.svc;
    card.addEventListener('click', () => openOverlay(serviceKey));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openOverlay(serviceKey);
      }
    });
  });

  document.getElementById('startButton')?.addEventListener('click', () => openOverlay('cv'));
  document.getElementById('heroAction')?.addEventListener('click', () => openOverlay('cv'));
  document.getElementById('heroLearn')?.addEventListener('click', () => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }));
  formClose?.addEventListener('click', closeOverlay);
  formAction?.addEventListener('click', handleAction);
}

function init() {
  registerServiceWorker();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
