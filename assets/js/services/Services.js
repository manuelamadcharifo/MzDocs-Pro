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
    const paginas  = parseInt(data.paginas) || 5;
    // 1 página A4 densa ≈ 450 palavras de corpo de texto
    const palavrasMin = paginas * 420;
    const palavrasMax = paginas * 500;

    const builders = {
      trabalho: () => {
        // Gera subcapítulos de desenvolvimento proporcional ao número de páginas
        const numCaps = Math.max(2, Math.floor((paginas - 2) / 1.5)); // 2 páginas para intro+conclusão+capa
        const caps = Array.from({ length: numCaps }, (_, i) =>
          `### ${i + 1}.${i === 0 ? 1 : 1} [Subtema ${i + 1} — desenvolvido com no mínimo 2 subcapítulos e exemplos concretos]`
        ).join('\n');

        return `Gere um TRABALHO ACADÉMICO COMPLETO, EXTENSO E DENSO sobre "${data.tema}".
Nível: ${data.nivel}. Disciplina: ${data.disciplina}.
Extensão obrigatória: ${paginas} páginas A4 completas = MÍNIMO ${palavrasMin} palavras de conteúdo (MÁXIMO ${palavrasMax} palavras).
NÃO corte o documento. NÃO faça resumo. ESCREVA TODO O CONTEÚDO.
Requisitos do professor: ${data.requisitos || 'nenhum'}.${ocrBlock}

REGRAS DE EXTENSÃO (OBRIGATÓRIAS):
- Cada secção de desenvolvimento deve ter NO MÍNIMO 3 parágrafos longos (5-8 linhas cada)
- Use exemplos, dados, contexto moçambicano e africano sempre que possível
- Não use marcadores de lugar como "[escrever aqui]" — escreva o conteúdo real
- Introdução: pelo menos 2 parágrafos completos
- Cada capítulo de desenvolvimento: pelo menos 4-6 parágrafos com subcapítulos
- Conclusão: pelo menos 2 parágrafos

Estrutura obrigatória em Markdown:
# ${data.tema}
**Disciplina:** ${data.disciplina} | **Nível:** ${data.nivel} | **Data:** ${new Date().toLocaleDateString('pt-MZ')}

---

## Índice
1. Introdução
2. [Capítulos de desenvolvimento — liste todos]
${Array.from({ length: numCaps }, (_, i) => `${i + 3}. [Capítulo ${i + 1}]`).join('\n')}
${numCaps + 3}. Conclusão
${numCaps + 4}. Referências Bibliográficas

---

## 1. Introdução
[Mínimo 350 palavras: contextualização, relevância, objectivos, metodologia]

${Array.from({ length: numCaps }, (_, i) => `
## ${i + 2}. [Título do Capítulo ${i + 1}]

### ${i + 2}.1 [Subtópico A]
[Mínimo 300 palavras com análise aprofundada]

### ${i + 2}.2 [Subtópico B]
[Mínimo 300 palavras com exemplos e dados]
`).join('\n')}

## ${numCaps + 2}. Conclusão
[Mínimo 300 palavras: síntese, contribuições, limitações, perspectivas futuras]

## ${numCaps + 3}. Referências Bibliográficas
[Mínimo 5 fontes em formato APA]`;
      },

      cv: () =>
        `Crie um CURRÍCULO VITAE PROFISSIONAL COMPLETO em Markdown para o mercado moçambicano.
Nome: ${data.nome}. Cargo pretendido: ${data.cargo}.
Nascimento: ${data.nascimento || '-'}. Contacto: ${data.contacto || '-'}. Email: ${data.email || '-'}.
Formação: ${data.formacao}. Experiência: ${data.experiencia || 'Recém-formado sem experiência formal'}.
Habilidades: ${data.habilidades || '-'}. Objectivo: ${data.objectivo || '-'}.${ocrBlock}

Gere um CV PROFISSIONAL COMPLETO com todas as secções preenchidas com detalhe.
Formato Europass adaptado ao mercado moçambicano:
# ${data.nome}
**${data.cargo}**

---
## Dados Pessoais
[tabela ou lista com todos os contactos]

## Objectivo Profissional
[Parágrafo de 3-5 linhas descrevendo perfil e ambições para a vaga]

## Formação Académica
[Cada formação com: Grau | Instituição | Ano | Localidade]

## Experiência Profissional
[Cada cargo com: Empresa | Período | Descrição detalhada com verbos de acção (gerí, coordenei, implementei...)]

## Competências Técnicas
[Lista organizada por categoria]

## Competências Pessoais / Soft Skills
[5-8 competências com breve descrição]

## Línguas
[Cada língua com nível: Nativo / Fluente / Intermédio / Básico]

## Referências
[Formato: Nome, Cargo, Empresa, Contacto — ou "Disponíveis mediante solicitação"]`,

      carta: () =>
        `Redija uma CARTA FORMAL COMPLETA E PROFISSIONAL do tipo "${data.tipo}".
Remetente: ${data.remetenteNome}, ${data.remetenteLocal || 'Maputo'}.
Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}.
Assunto: ${data.assunto}.
Conteúdo a incluir: ${data.pontos}.${ocrBlock}

A carta deve ser COMPLETA, FORMAL e CONVINCENTE. Inclua:
- Cabeçalho com local e data
- Dados completos do remetente (morada, contacto)
- Dados do destinatário
- Linha de assunto em destaque
- Saudação formal adequada ao contexto moçambicano
- Corpo da carta em 4-6 parágrafos bem desenvolvidos (cada um com 4-6 linhas)
- Fecho formal ("Atenciosamente" / "Com os melhores cumprimentos")
- Assinatura com nome e cargo/título
NÃO use marcadores de lugar. Escreva o conteúdo real baseado nos pontos fornecidos.`,

      orcamento: () =>
        `Elabore um ORÇAMENTO DE CONSTRUÇÃO PROFISSIONAL E DETALHADO em Markdown com tabelas completas.
Obra: ${data.tipoObra}. Área: ${data.area || '?'} m². Local: ${data.local}.
Acabamento: ${data.acabamento || 'Médio / Padrão'}. Fase: ${data.fase || 'Construção do zero'}. Prazo: ${data.prazo || 60} dias.
Detalhes adicionais: ${data.extra || 'padrão'}.${ocrBlock}

O orçamento deve ser PROFISSIONAL E COMPLETO com:
# Orçamento de ${data.tipoObra}
**Local:** ${data.local} | **Data:** ${new Date().toLocaleDateString('pt-MZ')} | **Validade:** 30 dias

## 1. Resumo da Obra
[Descrição detalhada: tipo, dimensões, especificações técnicas]

## 2. Materiais de Construção
[Tabela completa: | Item | Unidade | Quantidade | Preço Unit. (MZN) | Total (MZN) |]
[Inclui: cimento, areia, brita, tijolos, ferro, telhado, portas, janelas, azulejos, tintas, canalizações, elétrica, etc.]

## 3. Mão-de-Obra
[Tabela: | Especialidade | Dias | Diária (MZN) | Total (MZN) |]

## 4. Equipamentos e Ferramentas
[Tabela com aluguer/compra]

## 5. Resumo Financeiro
[Tabela com totais por categoria, subtotal, IVA 17%, TOTAL GERAL]

## 6. Cronograma de Obra
[Tabela: fases com duração em semanas]

## 7. Condições Comerciais
[Formas de pagamento, garantia, responsabilidades]

Use preços de mercado moçambicano ${new Date().getFullYear()} realistas em MZN.`,
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

  async syncUser(userId, localCredits) {
    if (!this._ready) return null;
    try {
      // CORRIGIDO: tabela 'profiles' (não 'users')
      const { data, error } = await this._client
        .from('profiles').select('credits').eq('id', userId).single();

      if (error?.code === 'PGRST116') {
        await this._client.from('profiles').insert({ id: userId, credits: localCredits });
        return { credits: localCredits };
      }
      if (error) throw error;

      const resolved = Math.max(data.credits, localCredits);
      if (resolved !== data.credits) {
        await this._client.from('profiles').update({ credits: resolved, updated_at: new Date().toISOString() }).eq('id', userId);
      }
      return { credits: resolved };
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