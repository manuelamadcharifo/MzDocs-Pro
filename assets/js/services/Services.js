// services/Services.js — OpenRouterService + MPesaService + SupabaseService
import { Validator } from '../utils/Formatter.js';
import { Formatter } from '../utils/Formatter.js';
import { PROMPT_BUILDERS, DATA_BLOCK_BUILDERS } from './prompts/index.js';
import { AcademicEngine } from '../academic/AcademicEngine.js';

// ── FASE 2 (Motor Jurídico/RAG) ───────────────────────────────────────────
// Para cada serviço jurídico, gera a query em linguagem natural usada para
// buscar artigos de lei relevantes em /api/legal-search (ver LegalContext.js).
// Serviços que NÃO aparecem aqui simplesmente não disparam a busca —
// comportamento idêntico ao que existia antes da Fase 2.
const LEGAL_QUERY_BUILDERS = {
  arrendamento: (data) => `contrato de arrendamento de imóvel ${data.tipoImovel?.includes('Comercial') ? 'comercial' : 'habitacional'}, locação, obrigações do senhorio e do inquilino`,
  procuracao:   (data) => `procuração, representação voluntária${data.finalidade ? ', ' + data.finalidade : ''}, reconhecimento notarial`,
  requerimento: (data) => `requerimento dirigido a ${data.entidade || 'entidade pública'} em Moçambique, ${data.assunto || 'pedido administrativo'}, base legal e competência`,
  residencia:   (data) => `declaração de residência, domicílio, falsas declarações perante autoridade`,
  acta:         (data) => `acta de reunião, assembleia, deliberação social`,
};

export class OpenRouterService {
  constructor() {
    this.endpoint = '/api/generate-document';
    this.models = {
      primary:   'meta-llama/llama-3.3-70b-instruct:free',
      fallback:  'google/gemma-3-27b-it:free',
      emergency: 'nvidia/nemotron-3-nano-30b-a3b:free',
    };
    this.currentModel = this.models.primary;
  }

  async generate(serviceType, formData, ocrText = null, credits = null, cost = 1, templateData = null, pickerTemplate = null) {
    const prompt = await this._buildPrompt(serviceType, formData, ocrText, templateData, pickerTemplate);
    return await this._callBackend(serviceType, prompt, credits, cost);
  }

  // ── NOVO v2.1: amostra grátis ───────────────────────────────────────────
  // Gera uma amostra curta do documento (cabeçalho + abertura) usando o MESMO
  // prompt-builder do serviço, mas em _previewMode — sem dedução de crédito
  // e sem exigir sessão. Permite ao utilizador avaliar a qualidade ANTES de
  // decidir gastar um crédito. Reaproveita /api/generate-document (nenhuma
  // function nova foi criada — o projecto já está no limite de 12 do Vercel
  // Hobby).
  async previewDocument(serviceType, formData, ocrText = null, templateData = null, pickerTemplate = null) {
    const prompt = await this._buildPrompt(serviceType, formData, ocrText, templateData, pickerTemplate);
    const userId = localStorage.getItem('mz_uid') || 'anon';

    // Token é opcional em modo preview — se existir sessão, é enviado (ajuda
    // nos logs/analytics), mas a ausência de sessão nunca bloqueia o preview.
    let authToken = null;
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      await authManager.ready();
      authToken = await authManager.getValidToken();
    } catch { /* visitante sem sessão — preview continua disponível */ }

    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        serviceType,
        prompt,
        userId,
        _previewMode: true,
      }),
    });

    if (res.status === 429) {
      const d = await res.json().catch(() => ({}));
      const e = new Error(d.error || 'Muitas amostras seguidas. Aguarde um pouco.');
      e.status = 429;
      throw e;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.error || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    return await res.json(); // { document, model, preview: true }
  }


  // skipDeduct=true quando o chamador (DocumentController.handleReedit) já debitou
  // o crédito no servidor antes de chamar esta função — evita dupla dedução.
  async generateRaw(prompt, reeditData = null, credits = null, skipDeduct = false) {
    const userId = localStorage.getItem('mz_uid') || 'anon';

    // Obter token JWT para autenticação no servidor
    let authToken = null;
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      await authManager.ready(); // garantir que _init() completou antes de ler o token
      authToken = await authManager.getValidToken();
    } catch { /* sem token */ }

    if (!authToken) {
      throw Object.assign(new Error('Sessão expirada. Inicie sessão novamente.'), { code: 'AUTH_REQUIRED' });
    }

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };

    let creditsAfterDeduct = credits;

    if (!skipDeduct) {
      // Deduzir 1 crédito antes da reedição (fluxo antigo — mantido para compatibilidade)
      const deductRes = await fetch('/api/deduct-credit', {
        method: 'POST', headers,
        body: JSON.stringify({ cost: 1, documentType: reeditData?.serviceType || 'reedit' }),
      });
      if (deductRes.status === 402) {
        const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e;
      }
      if (!deductRes.ok) {
        const d = await deductRes.json().catch(() => ({}));
        throw new Error(d.error || 'Erro ao verificar créditos.');
      }
      const deductData = await deductRes.json();
      creditsAfterDeduct = deductData.credits;
    }
    // Se skipDeduct=true, credits já foi passado com o valor correcto pelo chamador

    const body = reeditData
      ? {
          serviceType: reeditData.serviceType || 'reedit',
          prompt: prompt,
          userId,
          _reedit: true,
          _currentContent: reeditData.currentContent,
          _instruction: reeditData.instruction,
        }
      : {
          serviceType: 'reedit',
          prompt,
          userId,
        };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 429) { const e = new Error('RATE_LIMIT'); e.status = 429; throw e; }
    if (res.status === 402) { const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e; }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.error || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    return await res.json();
  }

  async _callBackend(serviceType, prompt, credits = null, cost = 1) {
    const userId = localStorage.getItem('mz_uid') || 'anon';

    // Obter token JWT para autenticação no servidor
    let authToken = null;
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      await authManager.ready(); // garantir que _init() completou antes de ler o token
      authToken = await authManager.getValidToken();
    } catch { /* sem token */ }

    if (!authToken) {
      throw Object.assign(new Error('Sessão expirada. Inicie sessão novamente.'), { code: 'AUTH_REQUIRED' });
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // ── PASSO 1: Deduzir créditos via /api/deduct-credit ────────────────
    // Feito ANTES da geração para garantir que os créditos são consumidos
    // mesmo que a geração falhe (o servidor de IA pode falhar, o crédito foi usado).
    const deductRes = await fetch('/api/deduct-credit', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ cost }),
    });

    if (deductRes.status === 401) {
      const e = new Error('Sessão inválida. Inicie sessão novamente.'); e.status = 401;
      throw e;
    }
    if (deductRes.status === 402) {
      const e = new Error('INSUFFICIENT_CREDITS'); e.status = 402; throw e;
    }
    if (!deductRes.ok) {
      const d = await deductRes.json().catch(() => ({}));
      throw new Error(d.error || 'Erro ao verificar créditos. Tente novamente.');
    }

    const { credits: creditsAfterDeduct } = await deductRes.json();

    // ── PASSO 2: Gerar documento ─────────────────────────────────────────
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        serviceType,
        prompt,
        userId,
        creditsRemaining: creditsAfterDeduct, // enviado de volta para o cliente via resposta
        cost, // permite ao servidor reembolsar automaticamente este custo se a geração falhar
      }),
    });

    if (res.status === 429) { const e = new Error('RATE_LIMIT'); e.status = 429; throw e; }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.error || `HTTP ${res.status}`);
      e.status = res.status;
      // CORRIGIDO (auditoria): se o servidor reembolsou o crédito automaticamente
      // após uma falha total dos providers de IA, propagar essa informação para
      // que o DocumentController possa actualizar o saldo local e avisar o utilizador.
      if (data.refunded) {
        e.refunded = true;
        e.creditsRemaining = data.creditsRemaining;
      }
      throw e;
    }

    const result = await res.json();
    // Garantir que creditsRemaining está sempre presente (vem do /api/deduct-credit)
    if (typeof result.creditsRemaining !== 'number') {
      result.creditsRemaining = creditsAfterDeduct;
    }
    return result;
  }

  async _buildPrompt(type, data, ocr, templateData = null, pickerTemplate = null) {
    // ── Bloco de template próprio (se o utilizador carregou um modelo) ─────
    // CORRIGIDO: tratamento separado para imagem vs texto extraído (PDF/Word).
    // Antes, quando o utilizador carregava uma IMAGEM, templateData.text era vazio
    // e o bloco retornava '' silenciosamente — a IA ignorava o modelo e gerava
    // o documento no layout padrão MzDocs. Agora a instrução de estrutura é sempre
    // injectada, seja com texto extraído (PDF/Word) ou com descrição estrutural (imagem).
    const templateBlock = (() => {
      if (!templateData) return '';
      const src = templateData.text || '';

      // Caso 1: Imagem carregada (base64 disponível, sem texto extraível)
      // A IA não pode "ver" a imagem directamente neste fluxo, mas consegue
      // reproduzir a estrutura visual se descrevermos o tipo de layout pretendido.
      if (!src && templateData.base64) {
        return `

MODELO DO UTILIZADOR (imagem de layout carregada):
O utilizador carregou uma imagem com o layout visual que pretende reproduzir. Siga rigorosamente as seguintes regras de estrutura:

REGRAS OBRIGATÓRIAS DE ESTRUTURA:
1. Mantenha EXACTAMENTE as mesmas secções na mesma ordem que aparecem num documento deste tipo
2. Se for um CV/Curriculo: reproduza layout com barra lateral (contactos, competencias, linguas) e area principal (experiencia, formacao, realizacoes) — nao use layout de coluna simples
3. Se for um documento formal (contrato, requerimento, acta): mantenha cabecalhos formais no topo, corpo estruturado e espacos para assinaturas no rodape
4. Se for um orcamento/factura/recibo: mantenha tabelas com colunas alinhadas e totais no rodape
5. NAO use o layout padrao generico — reproduza a estrutura visual do tipo de documento mostrado na imagem
6. Mantenha hierarquia visual: titulos de seccao em destaque, subseccoes indentadas, bullets onde aplicavel

INSTRUCAO CRITICA: O documento gerado DEVE ter a estrutura visual do tipo de documento da imagem. NAO gere um documento com layout diferente do modelo fornecido.
`;
      }

      // Caso 2: PDF ou Word carregado (texto extraido disponivel)
      if (!src) return '';
      return `

MODELO DO UTILIZADOR (estrutura/layout a respeitar):
O utilizador forneceu o seguinte modelo. Mantenha a estrutura, cabecalhos, seccoes e estilo exactamente como estao. Substitua apenas os marcadores de conteudo com os dados reais fornecidos abaixo.

--- INICIO DO MODELO ---
${src.slice(0, 6000)}
--- FIM DO MODELO ---

INSTRUCAO CRITICA: Preencha o modelo acima com os dados reais. NAO gere um documento diferente. Mantenha o layout, a sequencia e o estilo do modelo. Se o modelo tiver marcadores como [NOME], [DATA], [VALOR], substitua-os pelos dados reais fornecidos.
`;
    })();

    // Utilitário: número por extenso em MZN (mantido tal como estava no ficheiro
    // original — não é invocado por nenhum gerador de prompt actualmente, mas é
    // preservado aqui sem alterações para garantir comportamento idêntico ao
    // ficheiro pré-refactor; ver nota "achados" no relatório de refactor).
    const _numPorExtenso = (val) => {
      const n = parseInt(val || 0);
      if (n === 0) return 'zero';
      const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez',
        'onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
      const d = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
      const c = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
      if (n < 20) return u[n];
      if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' e ' + u[n%10] : '');
      if (n < 1000) return (n===100?'cem':c[Math.floor(n/100)]) + (n%100 ? ' e ' + _numPorExtenso(n%100) : '');
      if (n < 1000000) {
        const m = Math.floor(n/1000);
        const r = n%1000;
        return (m===1?'mil':_numPorExtenso(m)+' mil') + (r ? ' e ' + _numPorExtenso(r) : '');
      }
      return n.toLocaleString('pt-MZ') + ' (por extenso)';
    };

    // CORRIGIDO: para "Trabalho Escolar", o rascunho OCR (texto extraído de
    // PDF/Word com pdf.js/mammoth, ou de imagem via IA visual — ver
    // SmartOCRService._extractPdfText/_extractWordText) é tratado de forma
    // diferente dos restantes serviços. Antes, qualquer conteúdo extraído
    // recebia a mesma instrução genérica e fraca ("use como base, corrija
    // erros"), o que deixava a IA livre para ignorá-lo e gerar um trabalho
    // do zero mesmo quando o aluno já tinha enviado o apontamento/rascunho
    // real. Agora, para 'trabalho', a instrução é explícita: extrair e
    // reorganizar o conteúdo fornecido, citando-o como base real, e só
    // recorrer à geração livre (IA pura) se o texto vier ilegível/vazio ou
    // não tiver relação alguma com o tema indicado pelo aluno. Não substitui
    // o prompt de trabalho.js — apenas o bloco de contexto OCR que ele já
    // recebia como 2º parâmetro permanece intocado para os outros tipos.
    //
    // Adicionalmente, se o aluno já adicionou fontes bibliográficas reais no
    // botão "📚 Referências (APA 7)" do formulário (antes de gerar — ver
    // DocumentController.open/btnAcademicPre), essas fontes são incluídas
    // aqui em formato APA 7 já calculado, para a IA citá-las directamente
    // em vez de depender só da regra estática do prompt-base.
    const academicRefsBlock = (() => {
      if (type !== 'trabalho') return '';
      const refs = AcademicEngine.getReferences();
      if (!refs.length) return '';
      const lista = refs.map((r, i) => `${i + 1}. ${r.apa}`).join('\n');
      return `\n\nFONTES BIBLIOGRÁFICAS REAIS FORNECIDAS PELO ALUNO (use citações in-text APA 7 ao longo do texto, ex.: (Autor, Ano), e inclua TODAS estas na secção de Referências Bibliográficas — substituem, não complementam, a regra de "mínimo 2 referências" do prompt acima):\n${lista}`;
    })();

    const ocrBlock = (() => {
      const academicSuffix = academicRefsBlock;
      if (!ocr) return academicSuffix;
      if (type === 'trabalho') {
        return `\n\nMATERIAL ENVIADO PELO ALUNO (extraído do ficheiro/imagem carregado — apontamentos, rascunho ou enunciado):\n--- INÍCIO DO MATERIAL ---\n${ocr.slice(0, 9000)}\n--- FIM DO MATERIAL ---\n\nINSTRUÇÃO CRÍTICA SOBRE O MATERIAL ACIMA:\n1. Antes de escrever qualquer secção, leia e avalie o material: ele está legível (não é ruído/lixo de OCR) E tem relação directa com o tema "${data.tema || ''}"?\n2. SE SIM: utilize o conteúdo do material como BASE REAL do trabalho — extraia os factos, dados, argumentos, citações e estrutura que ele já contém, reorganize-os de forma académica e desenvolva-os com mais profundidade. NÃO ignore o material para escrever algo genérico diferente do que o aluno trouxe. O resultado deve reflectir o que está no material, apenas mais completo, melhor estruturado e com linguagem académica corrigida.\n3. SE NÃO (material ilegível, corrompido, vazio de conteúdo útil, ou claramente sobre outro tema sem nenhuma relação com "${data.tema || ''}"): ignore o material e gere o trabalho inteiramente a partir do tema, disciplina e nível indicados — sem mencionar que o material foi descartado.\n4. Nunca invente que o material disse algo que não está nele — se faltar informação para uma secção, desenvolva-a com conhecimento académico geral em vez de atribuir conteúdo inexistente ao material do aluno.${academicSuffix}`;
      }
      return `\n\nRascunho OCR (use como base, corrija erros):\n${ocr}`;
    })();

    // ── Picker template: quando um template do marketplace com htmlTemplate está activo ──
    // O modelo tem um layout HTML estruturado (duas colunas, sidebar, etc.)
    // Geramos o documento como HTML directamente para fidelidade máxima ao template.
    if (pickerTemplate?.htmlTemplate) {
      return this._buildHTMLStructuredPrompt(type, data, ocr, pickerTemplate);
    }

    // Antes: objecto `builders` de 1700+ linhas definido inline aqui.
    // Agora: registo importado de ./prompts/index.js — mesma forma, mesmo
    // comportamento (builders[type] || builders.trabalho), apenas relocado.
    const builder = PROMPT_BUILDERS[type] || PROMPT_BUILDERS.trabalho;

    // ── FASE 2 (Motor Jurídico/RAG) ─────────────────────────────────────
    // Para os 5 serviços jurídicos, tentar obter artigos de lei REAIS da
    // base vectorial antes de montar o prompt — ver
    // assets/js/services/LegalContext.js e docs/legal/VERIFICACAO-LEGAL.md.
    // Builders não-jurídicos não são afectados: LEGAL_QUERY_BUILDERS não
    // os contém, então legalContext fica null e o 3º argumento do builder
    // continua a ser ignorado exactamente como antes desta mudança.
    let legalContext = null;
    const queryBuilder = LEGAL_QUERY_BUILDERS[type];
    if (queryBuilder) {
      try {
        const { buscarContextoJuridico } = await import('./LegalContext.js');
        legalContext = await buscarContextoJuridico(queryBuilder(data), type);
      } catch (_) {
        // Falha ao importar/chamar o módulo de contexto jurídico — seguir
        // sem ele. O builder usa o seu texto estático de fallback (já
        // corrigido na Fase 1) quando legalContext é null.
      }
    }

    const basePrompt = builder(data, ocrBlock, legalContext);
    // Injectar bloco de template no início do prompt (antes das instruções)
    return templateBlock ? templateBlock + '\n\n' + basePrompt : basePrompt;
  }

  // ── Dados específicos por tipo de documento para prompt HTML ─────────────
  // Antes: objecto `blocks` de ~300 linhas definido inline aqui.
  // Agora: registo importado de ./prompts/index.js — mesmo comportamento
  // (blocks[type] || blocks.carta), apenas relocado por tipo de documento.
  _buildDataBlock(type, data) {
    const builder = DATA_BLOCK_BUILDERS[type] || DATA_BLOCK_BUILDERS.carta;
    return builder(data);
  }

  _buildHTMLStructuredPrompt(type, data, ocr, pickerTemplate) {
    const ocrBlock = ocr ? `\n\nRascunho OCR (use como base):\n${ocr}` : '';
    const htmlStructure = pickerTemplate.htmlTemplate;
    const templateName  = pickerTemplate.name || 'modelo seleccionado';
    const templateCss   = (pickerTemplate.css || '').slice(0, 2000);

    const dataBlock = this._buildDataBlock(type, data);

    return `Você é especialista em documentos profissionais moçambicanos. Crie um documento em HTML ESTRUTURADO usando EXACTAMENTE as classes CSS do template "${templateName}".

TIPO DE DOCUMENTO: ${type}

DADOS DO DOCUMENTO:
${dataBlock}${ocrBlock}

ESTRUTURA HTML OBRIGATÓRIA DO TEMPLATE (substitua os placeholders {{...}} pelos dados reais):
${htmlStructure}

CSS DO TEMPLATE (referência das classes disponíveis):
${templateCss}

REGRAS ABSOLUTAS:
1. Substitua TODOS os placeholders {{...}} pelos dados reais fornecidos acima
2. Use EXACTAMENTE as classes CSS do template — NÃO invente classes novas
3. Para listas (experiências, cláusulas, itens de tabela) gere múltiplos elementos HTML com as classes do template
4. Conteúdo REAL e COMPLETO — NUNCA deixe placeholders por substituir
5. Português formal de Moçambique
6. VERBOS DE ACÇÃO com resultados mensuráveis nas experiências profissionais
7. NÃO adicione estilos inline excepto width:% em barras de progresso

FORMATO ENTRADA GENÉRICA (cv-entry, doc-entry):
<div class="cv-entry">
  <p class="cv-entry-date">PERÍODO</p>
  <p class="cv-entry-title">TÍTULO/CARGO</p>
  <p class="cv-entry-company">ORGANIZAÇÃO | LOCAL</p>
  <ul class="cv-entry-bullets"><li>Realização concreta</li></ul>
</div>

RESPOSTA: Devolva APENAS o HTML, começando com a tag raiz do template e terminando com </div>. SEM markdown, SEM explicações, SEM \`\`\`html.`;
  }

  // ── Dados específicos por tipo de documento para prompt HTML ─────────────
  // ── Dados específicos por tipo de documento para prompt HTML ─────────────

}

// services/MPesaService.js — Integração M-Pesa com detecção de ambiente

export class MPesaService {
  constructor() {
    this.endpoint = '/api/process-payment';
    this.env = this._detectEnv();
  }

  _detectEnv() {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'sandbox';
    if (hostname.includes('netlify.app') && new URLSearchParams(location.search).has('debug')) return 'sandbox';
    return 'production';
  }

  isSandbox() { return this.env === 'sandbox'; }

  validatePhone(raw) {
    if (!Validator.phone(raw)) throw new Error('Número inválido. Use formato: 84 XXX XXXX');
  }

  async processPayment(phone, amount, packageId) {
    this.validatePhone(phone);
    if (!Validator.amount(amount)) throw new Error('Valor inválido para o pacote');

    const body = {
      phoneNumber: Formatter.phone(phone),
      amount: parseInt(amount),
      packageId,
      environment: this.env,
      timestamp: Date.now(),
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Erro no pagamento');
    return data;
  }
}

// services/SupabaseService.js — Persistência de créditos
export class SupabaseService {
  constructor() {
    this._client = null;
    this._ready = false;
  }

  async init() {
    // CORRIGIDO: reutilizar o cliente do authManager se disponível
    try {
      const { authManager } = await import('../auth/AuthManager.js');
      await authManager.ready();
      if (authManager.supabase) {
        this._client = authManager.supabase;
        this._ready = true;
        return true;
      }
    } catch { /* fallback abaixo */ }

    // Fallback: tentar /api/config directamente
    try {
      const r = await fetch('/api/config');
      if (!r.ok) return false;
      const config = await r.json();
      if (!config.configured) return false;
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      this._client = createClient(config.supabaseUrl, config.supabaseAnonKey);
      this._ready = true;
      return true;
    } catch (e) {
      console.warn('[Supabase] Falha ao inicializar:', e);
      return false;
    }
  }

  async syncUser(userId) {
    // NOTA: não aceita localCredits — o Supabase é sempre a fonte de verdade.
    // Nunca fazer Math.max com localStorage para não repor créditos já gastos.
    if (!this._ready) return null;
    try {
      const { data, error } = await this._client
        .from('profiles')
        .select('credits, plan, plan_expires_at, monthly_renewal_at')
        .eq('id', userId)
        .single();

      if (error?.code === 'PGRST116') {
        // Perfil não existe ainda (raro — o trigger devia criá-lo)
        return null;
      }
      if (error) throw error;

      // Verificar e atribuir créditos mensais se aplicável
      const plan = data.plan || 'free';
      const expires = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
      const planActive = plan !== 'free' && (!expires || expires > new Date());

      if (planActive) {
        const lastRenewal = data.monthly_renewal_at ? new Date(data.monthly_renewal_at) : null;
        const now = new Date();
        const sameMonth = lastRenewal &&
          lastRenewal.getFullYear() === now.getFullYear() &&
          lastRenewal.getMonth()    === now.getMonth();

        if (!sameMonth) {
          // Chamar RPC para atribuir créditos mensais (idempotente no servidor)
          try {
            const { data: newCredits } = await this._client
              .rpc('grant_monthly_credits', { target_user_id: userId });
            if (typeof newCredits === 'number') {
              return { credits: newCredits, plan };
            }
          } catch (e) {
            console.warn('[Supabase] grant_monthly_credits falhou:', e);
          }
        }
      }

      return { credits: data.credits, plan };
    } catch (e) {
      console.warn('[Supabase] syncUser falhou:', e);
      return null;
    }
  }

  async deductCredit(userId) {
    if (!this._ready) return null;
    try {
      const { data } = await this._client.rpc('deduct_credit', { user_id: userId });
      return typeof data === 'number' ? data : null;
    } catch { return null; }
  }

  async updateCredits(userId, credits) {
    if (!this._ready) return;
    try {
      // CORRIGIDO: tabela 'profiles', campo updated_at
      await this._client.from('profiles').upsert({
        id: userId,
        credits,
        updated_at: new Date().toISOString()
      });
    } catch (e) { console.warn('[Supabase] updateCredits falhou:', e); }
  }
}
