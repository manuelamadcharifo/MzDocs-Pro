// assets/js/services/minutas/_shared.js
// Helpers partilhados por todos os módulos de MINUTA FIXA (assets/js/services/
// minutas/*.js). Uma "minuta fixa" monta o documento final por substituição
// directa de dados no clausulado — SEM qualquer chamada a um provider de IA.
// Reaproveita, sem alterar, a mesma lógica de "número por extenso" já usada
// (duplicada) em vários prompts de services/prompts/*.js — aqui fica uma
// única cópia partilhada, porque este é código novo (não há histórico de
// comportamento a preservar por ficheiro).

// Número inteiro (MZN) por extenso, em português de Moçambique.
export function numeroPorExtenso(val) {
  const n = parseInt(val || 0, 10);
  if (!Number.isFinite(n) || n === 0) return 'zero';
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const c = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  if (n < 20) return u[n];
  if (n < 100) return dz[Math.floor(n / 10)] + (n % 10 ? ' e ' + u[n % 10] : '');
  if (n < 1000) return (n === 100 ? 'cem' : c[Math.floor(n / 100)]) + (n % 100 ? ' e ' + numeroPorExtenso(n % 100) : '');
  if (n < 1000000) {
    const m = Math.floor(n / 1000);
    const r = n % 1000;
    return (m === 1 ? 'mil' : numeroPorExtenso(m) + ' mil') + (r ? ' e ' + numeroPorExtenso(r) : '');
  }
  return n.toLocaleString('pt-MZ') + ' (por extenso)';
}

// Formata um valor em MZN com separador de milhares (pt-MZ).
export function formatMZN(val) {
  return parseFloat(val || 0).toLocaleString('pt-MZ');
}

// Data de hoje por extenso (mesmo formato já usado em todo o projecto —
// ver hoje.toLocaleDateString('pt-MZ', {...}) em services/prompts/*.js).
export function dataHojeExtenso() {
  return new Date().toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Marcador de campo em falta — usa a MESMA convenção "[PREENCHER ...]" que
// DocumentModel.sanitizePlaceholders() (assets/js/models/Models.js) já troca
// automaticamente por uma linha em branco "____________________" assim que
// o documento é gerado (ecrã, PDF e Word) — comportamento já existente,
// hoje só disparado por texto vindo da IA. Usar aqui dá o mesmo resultado
// visual sem precisar de nenhuma lógica nova.
export function preencher(rotulo) {
  return `[PREENCHER: ${rotulo}]`;
}

// Linha de campo opcional: só aparece no documento se houver valor.
export function seExiste(valor, textoSeExiste) {
  return valor ? textoSeExiste : '';
}

