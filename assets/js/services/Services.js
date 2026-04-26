// services/OpenRouterService.js — IA gratuita com fallback automático
export class OpenRouterService {
  constructor() {
    this.endpoint = '/api/generate-document';
    this.models = {
      primary:   'meta-llama/llama-3.3-70b-instruct:free',
      fallback:  'google/gemma-3-27b-it:free',
      emergency: 'mistralai/mistral-7b-instruct:free',
    };
    this.currentModel = this.models.primary;
  }

  async generate(serviceType, formData, ocrText = null) {
    const prompt = this._buildPrompt(serviceType, formData, ocrText);
    return await this._callBackend(serviceType, prompt);
  }

  // Para reedição via Editor
  async generateRaw(prompt, reeditData = null) {
    const userId = localStorage.getItem('mz_uid') || 'anon';
    const credits = JSON.parse(localStorage.getItem('mz_credits') ?? '0') || 0;

    const body = reeditData 
      ? { 
          serviceType: 'reedit', 
          prompt: prompt, // Prompt original (não usado na reedição)
          userId, 
          userCredits: credits,
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

  async _callBackend(serviceType, prompt) {
    const userId = localStorage.getItem('mz_uid') || 'anon';
    const credits = JSON.parse(localStorage.getItem('mz_credits') ?? '0') || 0;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType, prompt, userId, userCredits: credits }),
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
      trabalho: () =>
        `Gere um TRABALHO ACADÉMICO COMPLETO sobre "${data.tema}".
Nível: ${data.nivel}. Disciplina: ${data.disciplina}. Extensão: ${data.paginas||5} páginas.
Requisitos: ${data.requisitos||'nenhum'}.${ocrBlock}
Estrutura obrigatória em Markdown:
# [TÍTULO]
(Capa completa)
## Índice
## 1. Introdução
## 2. Desenvolvimento — [capítulo relevante]
## 3. Desenvolvimento — [capítulo relevante]
## 4. Conclusão
## 5. Referências Bibliográficas (mín. 5 fontes)`,

      cv: () =>
        `Crie um CURRÍCULO VITAE PROFISSIONAL em Markdown para o mercado moçambicano.
Nome: ${data.nome}. Cargo: ${data.cargo}. Nascimento: ${data.nascimento||'-'}.
Contacto: ${data.contacto||'-'}. Email: ${data.email||'-'}.
Formação: ${data.formacao}. Experiência: ${data.experiencia||'Recém-formado'}.
Habilidades: ${data.habilidades||'-'}. Objectivo: ${data.objectivo||'-'}.${ocrBlock}
Formato Europass: Dados Pessoais → Objectivo → Formação → Experiência (verbos de acção) → Competências → Referências.`,

      carta: () =>
        `Redija uma CARTA FORMAL COMPLETA do tipo "${data.tipo}".
Remetente: ${data.remetenteNome}, ${data.remetenteLocal||'Maputo'}.
Destinatário: ${data.destinatarioNome} — ${data.destinatarioEnti}.
Assunto: ${data.assunto}. Pontos: ${data.pontos}.${ocrBlock}
Estrutura: cabeçalho com data/local → dados de remetente e destinatário → assunto → saudação formal → 3-4 parágrafos → fecho → assinatura.`,

      orcamento: () =>
        `Elabore um ORÇAMENTO DE CONSTRUÇÃO DETALHADO em Markdown com tabelas.
Obra: ${data.tipoObra}. Área: ${data.area||'?'} m². Local: ${data.local}.
Acabamento: ${data.acabamento||'médio'}. Fase: ${data.fase}. Prazo: ${data.prazo||60} dias.
Detalhes: ${data.extra||'padrão'}.${ocrBlock}
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

  showSandboxWarning() {
    if (this.isSandbox()) {
      const el = document.getElementById('sandboxBar');
      if (el) el.style.display = 'flex';
    }
  }

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
    // Verificar se as env vars existem (injectadas via meta tag pelo netlify function)
    const url  = window.__SUPABASE_URL__;
    const key  = window.__SUPABASE_ANON_KEY__;
    if (!url || !key) { console.info('[Supabase] Não configurado — modo localStorage'); return false; }

    try {
      // Importação dinâmica (evita bundle desnecessário se não configurado)
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      this._client = createClient(url, key);
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
      const { data, error } = await this._client
        .from('users').select('credits').eq('id', userId).single();

      if (error?.code === 'PGRST116') {
        // Novo utilizador
        await this._client.from('users').insert({ id: userId, credits: localCredits });
        return { credits: localCredits };
      }
      if (error) throw error;

      // Resolver conflito: maior valor vence (evita perda de compras)
      const resolved = Math.max(data.credits, localCredits);
      if (resolved !== data.credits) {
        await this._client.from('users').update({ credits: resolved }).eq('id', userId);
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
      await this._client.from('users').upsert({ id: userId, credits, last_sync: new Date().toISOString() });
    } catch (e) { console.warn('[Supabase] updateCredits falhou:', e); }
  }
}
