// assets/js/services/minutas/index.js
// Registo central das MINUTAS FIXAS — documentos cujo clausulado legal é
// invariável e cuja "geração" é, na prática, apenas substituição de dados.
// Para qualquer serviceType presente aqui, Services.js (OpenRouterService)
// NUNCA chama um provider de IA: monta o documento localmente, no browser,
// de forma instantânea e sem custo de IA. Todos os outros serviceTypes
// (cv, trabalho, carta, recomendacao, planonegocio, orcamento, acta,
// transcricao) continuam a usar o caminho de IA existente, sem alteração.
//
// Para acrescentar um novo tipo de documento a este modo no futuro (ou
// reaproveitar para um modelo novo do marketplace), basta:
//  1. Criar assets/js/services/minutas/<serviceType>.js exportando render(data)
//  2. Importar e adicionar uma linha ao mapa MINUTA_RENDERERS abaixo
// Nenhuma outra alteração é necessária — Services.js e ServiceDefinitions.js
// já leem este mapa de forma genérica.

import * as recibo from './recibo.js';
import * as procuracao from './procuracao.js';
import * as requerimento from './requerimento.js';
import * as residencia from './residencia.js';
import * as licenca from './licenca.js';
import * as prestacao from './prestacao.js';
import * as arrendamento from './arrendamento.js';

export const MINUTA_RENDERERS = {
  recibo: recibo.render,
  procuracao: procuracao.render,
  requerimento: requerimento.render,
  residencia: residencia.render,
  licenca: licenca.render,
  prestacao: prestacao.render,
  arrendamento: arrendamento.render,
};
