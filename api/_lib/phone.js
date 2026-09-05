// api/_lib/phone.js
//
// NOVO (Set/2026): extraído para aqui a partir da lógica já usada (de forma
// duplicada, inline, 3x) em api/auth/index.js, para o novo webhook de
// recuperação por WhatsApp (api/whatsapp-webhook.js) usar exactamente a
// MESMA normalização — se divergissem, um número registado no signup podia
// deixar de "bater certo" na recuperação por WhatsApp mesmo sendo o mesmo
// número. As 3 ocorrências existentes em api/auth/index.js NÃO foram
// tocadas (já funcionam correctamente) — isto é só para código novo.
//
// Formato final: sempre "+258XXXXXXXXX" (E.164 de Moçambique).

function normalizeMzPhone(raw) {
  const clean = String(raw || '').replace(/\D/g, '');
  if (!clean) return null;
  return clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
}

module.exports = { normalizeMzPhone };
