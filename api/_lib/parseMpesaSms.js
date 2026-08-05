// api/_lib/parseMpesaSms.js — extrai os dados estruturados do SMS de
// confirmação que a Vodacom envia ao TEU telefone (o que recebe os
// pagamentos), não do que o cliente te envia — é essa diferença que torna
// isto muito mais difícil de falsificar do que um comprovativo em imagem.
// ──────────────────────────────────────────────────────────────────────────
// Baseado num SMS real fornecido directamente:
//
//   "Confirmado DH43L30JTID. Recebeste 7,000.00MT de 258841234567 -
//    ANTENIO AMADO CHARIFEIO aos 4/8/26 as 9:25 PM. O teu novo saldo
//    M-Pesa e de 7,117.54MT. Em caso de duvida, liga 100. M-Pesa e facil!"
//
// Nota: sem acentos (é→e, dúvida→duvida) — normal em SMS GSM-7, não é erro
// de encoding do nosso lado, é assim que a Vodacom envia.
// Nota: a data vem em formato D/M/AA (dia/mês/ano) — confirmado porque
// "4/8/26" bateu com o dia em que o SMS foi mesmo recebido (4 de Agosto).
//
// SE A VODACOM MUDAR O TEXTO deste SMS no futuro (acontece, sem aviso),
// esta função devolve `null` em vez de rebentar — o webhook trata isso
// como "não reconhecido" e regista para revisão manual, nunca finge ter
// entendido um formato que já não é este.
// ──────────────────────────────────────────────────────────────────────────

const MPESA_CONFIRM_RE =
  /Confirmado\s+([A-Z0-9]+)\.\s*Recebeste\s+([\d,]+\.\d{2})\s*MT\s+de\s+(\d+)\s*-\s*(.+?)\s+aos\s+(\d{1,2})\/(\d{1,2})\/(\d{2})\s+as\s+(\d{1,2}):(\d{2})\s*([AP]M)\.?\s*O teu novo saldo M-Pesa e de\s+([\d,]+\.\d{2})\s*MT/i;

/**
 * @param {string} rawText — o corpo exacto do SMS recebido.
 * @returns {{ reference: string, amount: number, senderPhone: string, senderName: string, newBalance: number, confirmedAt: string } | null}
 *   `senderPhone` normalizado para 9 dígitos sem o 258 (ex: "841234567"),
 *   consistente com o formato já usado no resto do projecto.
 *   `confirmedAt` é ISO 8601, assumindo o fuso de Moçambique (UTC+2, sem
 *   horário de Verão).
 */
function parseMpesaConfirmationSms(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const m = rawText.match(MPESA_CONFIRM_RE);
  if (!m) return null;

  const [, reference, amountStr, phoneRaw, senderName, day, month, yy, hour12Str, minStr, ampm, balanceStr] = m;

  const amount     = parseFloat(amountStr.replace(/,/g, ''));
  const newBalance = parseFloat(balanceStr.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // 258841234567 → 841234567 (mesmo formato que o resto do projecto usa em phone_number).
  const senderPhone = phoneRaw.startsWith('258') ? phoneRaw.slice(3) : phoneRaw;

  // Converte 12h→24h e monta um ISO em UTC+2 (Africa/Maputo, fixo, sem DST).
  let hour24 = parseInt(hour12Str, 10) % 12;
  if (ampm.toUpperCase() === 'PM') hour24 += 12;
  const fullYear = 2000 + parseInt(yy, 10);
  const pad = n => String(n).padStart(2, '0');
  const confirmedAt = `${fullYear}-${pad(month)}-${pad(day)}T${pad(hour24)}:${pad(minStr)}:00+02:00`;

  return {
    reference,
    amount,
    senderPhone,
    senderName: senderName.trim(),
    newBalance,
    confirmedAt,
  };
}

module.exports = { parseMpesaConfirmationSms };
