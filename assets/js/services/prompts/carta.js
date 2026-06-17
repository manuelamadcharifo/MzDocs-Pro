// assets/js/services/prompts/carta.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const tipo = data.tipo || 'Pedido Formal';
        const isReclamacao   = tipo === 'Reclamação';
        const isDemissao     = tipo === 'Demissão';
        const isCandidatura  = tipo === 'Candidatura a Emprego' || tipo === 'Carta de Motivação';
        const isComercial    = tipo === 'Apresentação Comercial';

        const blocoCondicional = isReclamacao
          ? `\n- N.º de referência / encomenda: ${data.refReclamacao || '[indicar referência]'}`
          : isDemissao
          ? `\n- Data de saída pretendida: ${data.dataSaida || '[a indicar]'}\n- Aviso prévio: ${data.avisoPrevio || 'Sim (30 dias)'}`
          : '';

        const estruturaPorTipo = isCandidatura
          ? `[§1 — Apresentação directa: quem é, para que vaga/função se candidata e como soube da oportunidade. 2-3 linhas sem "venho por este meio"]

[§2 — Correspondência perfil/vaga: mostre como a sua formação (${data.formacao || 'não indicada'}) e experiência se encaixam directamente nos requisitos. 4-5 linhas com exemplos concretos]

[§3 — Motivação genuína: por que esta empresa/organização especificamente. 3-4 linhas]

[§4 — Chamada à acção: solicita entrevista com disponibilidade concreta]`
          : isReclamacao
          ? `[§1 — Identificação do problema: descreva de forma factual o que aconteceu, quando, e qual o impacto. Mencione a ref. ${data.refReclamacao || '[referência]'}. 3-4 linhas]

[§2 — Evidências e tentativas anteriores: o que já foi comunicado ou tentado resolver, sem resultado. 3-4 linhas]

[§3 — Pedido específico e prazo: o que pretende exactamente (reembolso / substituição / explicação) e em que prazo razoável. 2-3 linhas]

[§4 — Aviso: consequências caso não haja resposta (reclamação no Livro de Reclamações / entidade reguladora)]`
          : isDemissao
          ? `[§1 — Comunicação directa da demissão: data de entrada na empresa, cargo, e data de saída pretendida (${data.dataSaida || '[data]'}). ${data.avisoPrevio ? 'Mencione o aviso prévio: ' + data.avisoPrevio : ''}. 2-3 linhas]

[§2 — Motivação (opcional e diplomática): razão genérica sem queimar pontes. 2-3 linhas]

[§3 — Comprometimento com transição: disponibilidade para formar substituto, entregar trabalhos pendentes, garantir continuidade. 3-4 linhas]

[§4 — Agradecimento genuíno pela oportunidade e experiência]`
          : isComercial
          ? `[§1 — Apresentação da empresa/serviço: o que oferece, para quem, e por que é relevante para o destinatário específico. 3-4 linhas]

[§2 — Proposta de valor concreta: dados, resultados, casos de sucesso. 4-5 linhas]

[§3 — Oferta específica e próximo passo: reunião, demonstração, proposta formal. 2-3 linhas]`
          : `[§1 — Apresentação e propósito directo: 2-3 linhas sem "venho por este meio"]

[§2 — Desenvolvimento do ponto principal: factos e fundamentos. 4-5 linhas]

[§3 — Pontos complementares se existirem. 3-4 linhas]

[§4 — Pedido claro com prazo: "Solicito a V.ª Ex.ª que... até [data]"]`;

        return `Você é especialista em comunicação formal moçambicana. Redija uma CARTA FORMAL COMPLETA do tipo "${tipo}" — adapte RIGOROSAMENTE o tom, estrutura e linguagem a este tipo específico.

DADOS:
- Tipo: ${tipo}
- Remetente: ${data.remetenteNome}, ${data.remetenteLocal || 'Maputo'}
- Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}
- Assunto: ${data.assunto}
- O que comunicar: ${data.pontos}${blocoCondicional}${ocrBlock}

REGRAS:
1. NUNCA use "Venho por este meio" — comece directamente
2. Máximo 1 página A4. Tom 100% adaptado ao tipo "${tipo}"
3. Cada parágrafo: UMA única ideia, 3-5 linhas
4. Data por extenso: ${data.remetenteLocal || 'Maputo'}, [dia] de [mês] de [ano]
5. Para Reclamação: tom assertivo mas respeitoso, nunca agressivo
6. Para Demissão: tom positivo, agradecido, profissional — nunca crítico

ESTRUTURA OBRIGATÓRIA:

**${data.remetenteNome}**
${data.remetenteLocal || 'Maputo'}, [data por extenso]

Exmo(a). Sr(a). ${data.destinatarioNome}
${data.destinatarioEnti}

**Assunto: ${data.assunto}**

[Saudação adequada ao tipo "${tipo}"],

${estruturaPorTipo}

Com os melhores cumprimentos,

_______________________________
**${data.remetenteNome}**`;
}

export function buildDataBlock(data) {
        const iniciais = (data.remetenteNome || 'XX').split(' ').slice(0,2).map(n=>n[0]||'').join('').toUpperCase();
        const ministrioLabel = data.ministerio || data.remetenteNome || '';
        return `- Tipo: ${data.tipo || 'Formal'}
- Remetente: ${data.remetenteNome || ''}  |  Cargo: ${data.remetenteCargo || ''}  |  Local: ${data.remetenteLocal || 'Maputo'}
- Destinatário: ${data.destinatarioNome || ''} — ${data.destinatarioEnti || ''}
- Assunto: ${data.assunto || ''}
- Pontos a comunicar: ${data.pontos || ''}
- Referência: ${data.ref || 'S/Ref.'}
- Cargo pretendido (candidatura): ${data.cargoPretendido || data.cargo || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{REMETENTE_NOME}} = ${data.remetenteNome || ''}
{{REMETENTE_CARGO}} = ${data.remetenteCargo || data.cargo || ''}
{{INICIAIS}} = ${iniciais}
{{INICIAIS_EMPRESA}} = ${iniciais}
{{LOCAL}} = ${data.remetenteLocal || 'Maputo'}
{{DATA}} = data de hoje por extenso (ex: Maputo, 30 de Maio de 2026)
{{REF}} = ${data.ref || 'S/Ref.'}
{{MINISTERIO}} = ${ministrioLabel}
{{REPARTIÇÃO}} = ${data.reparticao || data.remetenteNome || ''}
{{DESTINATARIO_NOME}} = ${data.destinatarioNome || ''}
{{DESTINATARIO_ENTI}} = ${data.destinatarioEnti || ''}
{{ASSUNTO}} = ${data.assunto || ''}
{{REMETENTE_CARGO_PRETENDIDO}} = ${data.cargoPretendido || data.cargo || ''}
{{CORPO}} = corpo formal e completo da carta, desenvolvendo os pontos: "${data.pontos || ''}"
           (mínimo 3 parágrafos; linguagem formal; português de Moçambique)`;
}
