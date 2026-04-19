// config/public.js - Public configuration (safe for frontend - no secrets)
// All sensitive config (API keys, credentials) must be in backend functions

export const PUBLIC_CONFIG = {
  site: {
    name: 'MzDocs Pro',
    version: 'v3',
    description: 'Documentos profissionais com IA gratuita para Moçambique',
    whatsapp: '258858695506'
  },
  
  packages: {
    starter: { id: 'starter', amount: 150, credits: 10, label: 'Starter' },
    basico: { id: 'basico', amount: 350, credits: 25, label: 'Básico' },
    pro: { id: 'pro', amount: 750, credits: 60, label: 'Pro' }
  },
  
  services: {
    generateDocument: '/.netlify/functions/generate-document',
    processPayment: '/.netlify/functions/process-payment',
    verifyCredits: '/.netlify/functions/verify-credits'
  },
  
  models: {
    openrouter: {
      free: ['meta-llama/llama-3.3-70b-instruct', 'google/gemini-3-pro', 'mistralai/mistral-large'],
      fallback: 'meta-llama/llama-3.3-70b-instruct'
    }
  },
  
  limits: {
    freeTrialCredits: 3,
    creditSyncInterval: 30000, // ms
    queueMinInterval: 3000, // ms
    requestTimeout: 30000, // ms
    ocrTimeout: 60000 // ms
  }
};

export default PUBLIC_CONFIG;