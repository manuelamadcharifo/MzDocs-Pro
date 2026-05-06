// assets/js/services/OpenRouterService.js — IA gratuita com fallback automático
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

  async generate(serviceType, formData, ocrText = null, credits = null) {
    const prompt = this._buildPrompt(serviceType, formData, ocrText);
    return await this._callBackend(serviceType, prompt, credits);
}


  async generateRaw(prompt, reeditData = null, credits = null) {
    const userId      = localStorage.getItem('mz_uid') || 'anon';
    const userCredits = credits !== null ? credits : 0;

    const body = reeditData
      ? {
          serviceType: reeditData.serviceType || 'reedit',
          prompt: prompt,
          userId,
          userCredits: userCredits,
          _reedit: true,
          _currentContent: reeditData.currentContent,
          _instruction: reeditData.instruction,
        }
      : {
          serviceType: 'reedit',
          prompt,
          userId,
          userCredits: credits
        };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  async _callBackend(serviceType, prompt, credits = null) {
    const userId       = localStorage.getItem('mz_uid') || 'anon';
    const userCredits  = credits !== null ? credits : 0;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType, prompt, userId, userCredits: userCredits }),
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

  _buildPrompt(type, data, ocr) {
    const ocrBlock = ocr ? `\n\nRascunho OCR (use como base, corrija erros):\n${ocr}` : '';

    const builders = {
      trabalho: () => {
        const pags    = parseInt(data.paginas) || 5;
        const devPags = Math.max(2, pags - 3);
        const numCaps = Math.max(2, Math.round(devPags / 1.5));
        const palavras = pags * 420;
        const ano = new Date().getFullYear();

        const capsEstrutura = Array.from({ length: numCaps }, (_, i) => {
          const capNum = i + 2;
          return [
            '',
            '---PAGE_BREAK---',
            `## ${capNum}. [Título do Capítulo ${i + 1} — específico ao tema "${data.tema}"]`,
            '',
            `### ${capNum}.1 [Subtítulo A — aspecto principal]`,
            `[ESCREVA AGORA: mínimo 4 parágrafos completos de 6-8 linhas cada. Conteúdo académico real com dados, datas, nomes, exemplos concretos do contexto moçambicano/africano. PROIBIDO usar marcadores de lugar.]`,
            '',
            `### ${capNum}.2 [Subtítulo B — aspecto complementar]`,
            `[ESCREVA AGORA: mínimo 3 parágrafos completos de 6-8 linhas cada. Análise crítica, comparações, implicações práticas para Moçambique.]`,
            '',
            `### ${capNum}.3 [Subtítulo C — síntese do capítulo]`,
            `[ESCREVA AGORA: mínimo 2 parágrafos de 5-6 linhas resumindo os pontos-chave do capítulo e ligando ao próximo.]`,
          ].join('\n');
        }).join('\n');

        const indice = Array.from({ length: numCaps }, (_, i) =>
          `   ${i + 2}. [Capítulo ${i + 1}] .................................................. ${i + 4}`
        ).join('\n');

        return `Você é um docente universitário experiente. Redija um TRABALHO ACADÉMICO COMPLETO, EXTENSO E DETALHADO seguindo exactamente a estrutura abaixo.

DADOS DO TRABALHO:
- Tema: "${data.tema}"
- Disciplina: ${data.disciplina}
- Nível: ${data.nivel}
- Extensão: ${pags} folhas A4 = MÍNIMO ${palavras} palavras de conteúdo real
- Requisitos do docente: ${data.requisitos || 'seguir normas académicas padrão APA'}

REGRAS ABSOLUTAS DE CONTEÚDO:
1. O marcador ---PAGE_BREAK--- separa cada folha A4 — use-o exactamente como indicado
2. Cada parágrafo deve ter 6-8 linhas de texto académico denso e contínuo
3. NUNCA escreva "[PREENCHER]", "[escrever aqui]" ou qualquer marcador de lugar no conteúdo narrativo — escreva o texto real
4. Use exemplos reais, dados históricos verificáveis, contexto moçambicano e africano sempre que possível
5. Corrija ortografia e acentuação em português europeu/moçambicano
6. Títulos e subtítulos em **negrito** e bem hierarquizados

ESTRUTURA OBRIGATÓRIA (copie exactamente incluindo ---PAGE_BREAK---):

---PAGE_BREAK---
# ${data.tema}

| | |
|---|---|
| **Instituição:** | [Nome da Instituição] |
| **Curso/Disciplina:** | ${data.disciplina} |
| **Nível:** | ${data.nivel} |
| **Aluno(a):** | [Nome Completo] |
| **Número de Estudante:** | [Número] |
| **Docente:** | [Nome do Professor] |
| **Cidade e Ano:** | Maputo, ${ano} |

---PAGE_BREAK---
## Índice

   1. Introdução .................................................. 3
${indice}
   ${numCaps + 2}. Conclusão .................................................. ${numCaps + 4}
   ${numCaps + 3}. Referências Bibliográficas ................................ ${numCaps + 5}

---PAGE_BREAK---
## 1. Introdução

[ESCREVA AGORA um texto introdutório com MÍNIMO 5 parágrafos de 6-8 linhas cada:
Parágrafo 1 — Contextualização: apresente o tema com dados históricos, geográficos ou sociais reais que enquadrem o leitor. Cite datas, locais e factos verificáveis.
Parágrafo 2 — Relevância: explique por que este tema é importante para Moçambique, para África e para o mundo actual. Use argumentos sólidos.
Parágrafo 3 — Objectivos: defina claramente o objectivo geral e pelo menos 3 objectivos específicos do trabalho usando verbos de acção (analisar, descrever, comparar, avaliar...).
Parágrafo 4 — Metodologia: descreva o tipo de pesquisa (bibliográfica, qualitativa, descritiva), as fontes consultadas e os critérios de selecção.
Parágrafo 5 — Estrutura do trabalho: apresente brevemente o que o leitor encontrará em cada capítulo.]
${capsEstrutura}
---PAGE_BREAK---
## ${numCaps + 2}. Conclusão

[ESCREVA AGORA uma conclusão com MÍNIMO 4 parágrafos de 6-8 linhas cada:
Parágrafo 1 — Síntese geral: retome os principais achados de cada capítulo de forma integrada, mostrando como se relacionam.
Parágrafo 2 — Resposta aos objectivos: avalie explicitamente se os objectivos propostos na introdução foram atingidos e como.
Parágrafo 3 — Contribuições e limitações: indique o contributo deste trabalho para o conhecimento na área e reconheça as limitações encontradas.
Parágrafo 4 — Recomendações: proponha acções concretas para gestores, políticos, educadores ou investigadores, e indique linhas futuras de pesquisa.]

---PAGE_BREAK---
## ${numCaps + 3}. Referências Bibliográficas

[Liste MÍNIMO 7 referências reais e verificáveis em formato APA 7ª edição, incluindo obrigatoriamente:
- Pelo menos 2 livros académicos publicados sobre o tema
- Pelo menos 1 artigo científico de revista indexada
- Pelo menos 1 relatório de organismo internacional (ONU, Banco Mundial, UA, SADC)
- Pelo menos 1 fonte moçambicana (INE, Governo de Moçambique, universidades moçambicanas)

Exemplo de formato:
Apelido, A. B. (Ano). *Título do livro em itálico*. Editora.
Apelido, A. B., & Apelido, C. D. (Ano). Título do artigo. *Nome da Revista*, Volume(Número), páginas. https://doi.org/xxxxx]
`;
      },


      cv: () =>
        `Crie um CURRÍCULO VITAE PROFISSIONAL em Markdown para o mercado moçambicano.
Nome: ${data.nome}. Cargo: ${data.cargo}. Nascimento: ${data.nascimento || '-'}.
Contacto: ${data.contacto || '-'}. Email: ${data.email || '-'}.
Formação: ${data.formacao}. Experiência: ${data.experiencia || 'Recém-formado'}.
Habilidades: ${data.habilidades || '-'}. Objectivo: ${data.objectivo || '-'}${ocrBlock}
Formato Europass: Dados Pessoais → Objectivo → Formação → Experiência (verbos de acção) → Competências → Referências.`,

      carta: () =>
        `Redija uma CARTA FORMAL COMPLETA do tipo "${data.tipo}".
Remetente: ${data.remetenteNome}, ${data.remetenteLocal || 'Maputo'}.
Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}.
Assunto: ${data.assunto}. Pontos: ${data.pontos}.${ocrBlock}
Estrutura: cabeçalho com data/local → dados de remetente e destinatário → assunto → saudação formal → 3-4 parágrafos → fecho → assinatura.`,

      orcamento: () =>
        `Elabore um ORÇAMENTO DE CONSTRUÇÃO DETALHADO em Markdown com tabelas.
Obra: ${data.tipoObra}. Área: ${data.area || '?'} m². Local: ${data.local}.
Acabamento: ${data.acabamento || 'médio'}. Fase: ${data.fase}. Prazo: ${data.prazo || 60} dias.
Detalhes: ${data.extra || 'padrão'}.${ocrBlock}
Incluir: resumo da obra → tabelas de materiais por fase (cimento, tijolos, ferro, areia, telha etc.) com quantidades e preços MZN → mão-de-obra → equipamentos → resumo financeiro com total → condições comerciais.
Preços de mercado moçambicano ${new Date().getFullYear()}.`,
    };

    return (builders[type] || builders.trabalho)();
  }
}

// services/MPesaService.js — Integração M-Pesa com detecção de ambiente
import { Validator } from '../utils/Formatter.js';
import { Formatter } from '../utils/Formatter.js';

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