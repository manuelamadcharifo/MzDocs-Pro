// config/constants.js
const PACKAGES = {
  starter: { amount: 150, credits: 10 },
  basico: { amount: 350, credits: 25 },
  pro: { amount: 750, credits: 60 }
};

const MPESA_ERRORS = {
  'INS-9': 'Saldo insuficiente na conta M-Pesa.',
  'INS-16': 'Limite diário atingido.',
  'INS-18': 'Número não registado no M-Pesa.',
  'INS-22': 'Utilizador cancelou a transacção.',
  'INS-23': 'Tempo esgotado — sem resposta do utilizador.',
  'INS-24': 'Transacção pendente em curso.',
  'INS-25': 'Conta M-Pesa bloqueada.',
};

module.exports = {
  PACKAGES,
  MPESA_ERRORS
};