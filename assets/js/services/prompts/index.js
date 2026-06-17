// assets/js/services/prompts/index.js
// Registo central dos geradores de prompt por tipo de documento.
// Cada modulo exporta exactamente as mesmas duas funcoes que existiam
// como entradas dos objectos `builders` e `blocks` dentro de
// OpenRouterService._buildPrompt / _buildDataBlock no Services.js original.
// Mover para aqui NAO altera nenhuma string nem nenhuma logica — apenas
// reorganiza o codigo em modulos por tipo de documento.

import * as trabalho from './trabalho.js';
import * as cv from './cv.js';
import * as carta from './carta.js';
import * as orcamento from './orcamento.js';
import * as arrendamento from './arrendamento.js';
import * as procuracao from './procuracao.js';
import * as requerimento from './requerimento.js';
import * as residencia from './residencia.js';
import * as prestacao from './prestacao.js';
import * as recibo from './recibo.js';
import * as recomendacao from './recomendacao.js';
import * as planonegocio from './planonegocio.js';
import * as licenca from './licenca.js';
import * as acta from './acta.js';

// Equivalente ao antigo `const builders = { trabalho: () => {...}, cv: () => {...}, ... }`
export const PROMPT_BUILDERS = {
  trabalho: trabalho.buildPrompt,
  cv: cv.buildPrompt,
  carta: carta.buildPrompt,
  orcamento: orcamento.buildPrompt,
  arrendamento: arrendamento.buildPrompt,
  procuracao: procuracao.buildPrompt,
  requerimento: requerimento.buildPrompt,
  residencia: residencia.buildPrompt,
  prestacao: prestacao.buildPrompt,
  recibo: recibo.buildPrompt,
  recomendacao: recomendacao.buildPrompt,
  planonegocio: planonegocio.buildPrompt,
  licenca: licenca.buildPrompt,
  acta: acta.buildPrompt,
};

// Equivalente ao antigo `const blocks = { cv: () => `...`, carta: () => {...}, ... }`
export const DATA_BLOCK_BUILDERS = {
  trabalho: trabalho.buildDataBlock,
  cv: cv.buildDataBlock,
  carta: carta.buildDataBlock,
  orcamento: orcamento.buildDataBlock,
  arrendamento: arrendamento.buildDataBlock,
  procuracao: procuracao.buildDataBlock,
  requerimento: requerimento.buildDataBlock,
  residencia: residencia.buildDataBlock,
  prestacao: prestacao.buildDataBlock,
  recibo: recibo.buildDataBlock,
  recomendacao: recomendacao.buildDataBlock,
  planonegocio: planonegocio.buildDataBlock,
  licenca: licenca.buildDataBlock,
  acta: acta.buildDataBlock,
};
