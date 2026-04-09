export const PUBLIC_CONFIG = {
  SITE_URL: typeof window !== 'undefined' ? window.location.origin : process.env.SITE_URL || ''
};
// config/public.js - Public configuration (no secrets)
export const PUBLIC_CONFIG = {
  site: {
    name: 'MzDocs Pro',
    version: 'v3',
    whatsapp: '258858695506'
  },
  packages: {
    starter: { amount: 150, credits: 10 },
    basico: { amount: 350, credits: 25 },
    pro: { amount: 750, credits: 60 }
  },
  services: {
    generateDocument: '/.netlify/functions/generate-document',
    processPayment: '/.netlify/functions/process-payment',
    verifyCredits: '/.netlify/functions/verify-credits'
  }
};