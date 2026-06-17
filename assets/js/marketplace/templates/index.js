// assets/js/marketplace/templates/index.js
// Agrega todas as categorias de templates num so objecto, equivalente ao
// antigo TEMPLATE_LIBRARY definido inline em TemplateLibrary.js.
// Nenhum template foi alterado — apenas reorganizados por categoria.

import { TEMPLATES as trabalho } from './trabalho.js';
import { TEMPLATES as cv } from './cv.js';
import { TEMPLATES as carta } from './carta.js';
import { TEMPLATES as orcamento } from './orcamento.js';
import { TEMPLATES as arrendamento } from './arrendamento.js';
import { TEMPLATES as prestacao } from './prestacao.js';
import { TEMPLATES as procuracao } from './procuracao.js';
import { TEMPLATES as requerimento } from './requerimento.js';
import { TEMPLATES as residencia } from './residencia.js';
import { TEMPLATES as planonegocio } from './planonegocio.js';
import { TEMPLATES as recibo } from './recibo.js';
import { TEMPLATES as recomendacao } from './recomendacao.js';
import { TEMPLATES as licenca } from './licenca.js';
import { TEMPLATES as acta } from './acta.js';

export const TEMPLATE_LIBRARY = {
  trabalho,
  cv,
  carta,
  orcamento,
  arrendamento,
  prestacao,
  procuracao,
  requerimento,
  residencia,
  planonegocio,
  recibo,
  recomendacao,
  licenca,
  acta,
};
