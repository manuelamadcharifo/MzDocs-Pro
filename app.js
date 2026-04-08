/* ══════════════════════════════════════════════
   MZDOCS PRO v2 — app.js
   Frontend principal: formulários, OCR, IA, M-Pesa, WhatsApp
══════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════
// CONFIGURAÇÃO GLOBAL
// ════════════════════════════════════
const CFG = {
  WA_NUMBER:    '258858695506',        // ← ALTERE PARA O SEU NÚMERO
  API_ENDPOINT: '/.netlify/functions/generate-document',
  PAY_ENDPOINT: '/.netlify/functions/process-payment',
  VERIFY_EP:    '/.netlify/functions/verify-credits',
  FREE_MONTHLY: 3,
  DOC_COST:     1,
};

// ════════════════════════════════════
// ESTADO DA APLICAÇÃO
// ════════════════════════════════════
const STATE = {
  service:      null,
  credits:      0,
  userId:       null,
  generatedDoc: null,
  ocrText:      null,
  selectedPkg:  null,
  generating:   false,
};

// ════════════════════════════════════
// DEFINIÇÃO DE SERVIÇOS
// ════════════════════════════════════
const SERVICES = {

  trabalho: {
    icon:'📚', bg:'#EFF6FF', title:'Trabalho Escolar', sub:'IA redige texto académico completo',
    hasAI: true,
    fields: [
      { id:'tema',       label:'Tema / Título', type:'text',     required:true,  placeholder:'Ex: O Papel das Mulheres na Independência de Moçambique' },
      { id:'nivel',      label:'Nível de Ensino', type:'select', required:true,
        opts:['Ensino Primário','Ensino Secundário (1º Ciclo)','Ensino Secundário (2º Ciclo)','Pré-Universitário','Licenciatura','Mestrado/Doutoramento'] },
      { id:'disciplina', label:'Disciplina', type:'text',        required:true,  placeholder:'Ex: História, Português, Biologia…' },
      { id:'paginas',    label:'Páginas pretendidas', type:'number', value:'5',  min:'2', max:'50' },
      { id:'requisitos', label:'Instruções / Enunciado do professor', type:'textarea', placeholder:'Cole ou descreva os requisitos específicos…' },
    ],
    buildPrompt(d, ocr) {
      return `Gere um trabalho académico COMPLETO E PRONTO sobre "${d.tema}".

Contexto:
- Nível: ${d.nivel}
- Disciplina: ${d.disciplina}
- Extensão pretendida: ${d.paginas} páginas
- Requisitos especiais: ${d.requisitos || 'Nenhum'}
${ocr ? `\nRascunho OCR (use como base de conteúdo, corrija erros de reconhecimento):\n${ocr}` : ''}

Estrutura OBRIGATÓRIA com Markdown:
# [TÍTULO COMPLETO DO TRABALHO]
(Capa: aluno, instituição, disciplina, data)

## Índice
(listar capítulos com páginas estimadas)

## 1. Introdução
(contextualização, problema, objectivos geral e específicos, justificativa, metodologia)

## 2. Desenvolvimento — Capítulo 1: [Nome relevante]
...

## 3. Desenvolvimento — Capítulo 2: [Nome relevante]
...

## 4. Conclusão
(síntese dos resultados, limitações, recomendações)

## 5. Referências Bibliográficas
(mínimo 5 fontes, formato ABNT simplificado)

Tom: ${d.nivel.includes('Licenciatura') || d.nivel.includes('Mestrado') ? 'Académico rigoroso, linguagem impessoal, citações' : 'Académico acessível, claro, adequado à faixa etária'}
IMPORTANTE: Gere conteúdo REAL e COMPLETO. NÃO use placeholders genéricos no corpo do texto.`;
    },
  },

  cv: {
    icon:'📋', bg:'#ECFDF5', title:'Currículo (CV)', sub:'CV profissional formato Europass moçambicano',
    hasAI: true,
    fields: [
      { id:'nome',        label:'Nome Completo', type:'text',     required:true, placeholder:'Ex: Ana Sofia Machava' },
      { id:'cargo',       label:'Cargo / Vaga pretendida', type:'text', required:true, placeholder:'Ex: Assistente Administrativo, Engenheiro Civil…' },
      { row: true, items: [
        { id:'nascimento', label:'Data de Nascimento', type:'text', placeholder:'Ex: 15/03/1998' },
        { id:'contacto',   label:'Telefone', type:'tel', placeholder:'84 XXX XXXX' },
      ]},
      { id:'email',       label:'Email (opcional)', type:'email', placeholder:'ex@email.com' },
      { id:'formacao',    label:'Formação Académica', type:'textarea', required:true, placeholder:'Ex: Licenciatura em Gestão de Empresas – UEM, 2022 (14 valores)' },
      { id:'experiencia', label:'Experiência Profissional', type:'textarea', placeholder:'Cargo – Empresa (ano-ano): responsabilidades principais…' },
      { id:'habilidades', label:'Habilidades / Competências', type:'textarea', placeholder:'Ex: Microsoft Office, Inglês (B2), AutoCAD, liderança de equipes…' },
      { id:'objectivo',   label:'Objectivo Profissional (opcional)', type:'text', placeholder:'Ex: Área de finanças ou gestão empresarial' },
    ],
    buildPrompt(d, ocr) {
      return `Crie um CURRÍCULO VITAE PROFISSIONAL E COMPLETO para o mercado moçambicano.

Dados:
- Nome: ${d.nome}
- Cargo pretendido: ${d.cargo}
- Data de Nascimento: ${d.nascimento || '[DATA]'}
- Contacto: ${d.contacto || '[CONTACTO]'}
- Email: ${d.email || '[EMAIL]'}
- Formação: ${d.formacao}
- Experiência: ${d.experiencia || 'Recém-formado / Sem experiência formal'}
- Habilidades: ${d.habilidades || 'Não especificadas'}
- Objectivo: ${d.objectivo || 'Não especificado'}
${ocr ? `\nDados extraídos de CV anterior (OCR):\n${ocr}` : ''}

Formato Markdown estruturado:
# CURRICULUM VITAE
## [NOME EM MAIÚSCULAS]

**Cargo Pretendido:** [cargo]  
**Data de Nascimento:** | **Nacionalidade:** Moçambicana | **Contacto:** | **Email:**

---

## Objectivo Profissional
(2-3 linhas alinhadas ao cargo, confiante e específico)

## Formação Académica
(cronológica inversa, incluir instituição, grau, ano, nota se relevante)

## Experiência Profissional
(cronológica inversa; para cada função: **Cargo** | Empresa | Período
- Responsabilidade 1 com verbo de acção
- Responsabilidade 2 quantificada se possível)

## Competências Técnicas
(tabela ou lista: software, idiomas com nível, ferramentas)

## Competências Comportamentais
(5-6 soft skills relevantes ao cargo)

## Certificações / Formação Complementar
(cursos, workshops, certificados relevantes)

## Referências
Disponíveis mediante solicitação.

ATS-friendly: use verbos de acção, quantifique conquistas, sem fotos ou elementos gráficos.
Se dados insuficientes: preencher com [PREENCHER] nos campos críticos.`;
    },
  },

  carta: {
    icon:'✉️', bg:'#FFFBEB', title:'Carta Formal', sub:'Redigida pela IA com estrutura profissional',
    hasAI: true,
    fields: [
      { id:'tipo',              label:'Tipo de Carta', type:'select', required:true,
        opts:['Candidatura a Emprego','Carta de Motivação (bolsa/admissão)','Pedido Formal','Reclamação','Demissão / Rescisão','Agradecimento','Apresentação Comercial'] },
      { row:true, items:[
        { id:'remetenteNome',  label:'O seu Nome', type:'text', required:true, placeholder:'O seu nome completo' },
        { id:'remetenteLocal', label:'Localidade / Data', type:'text', placeholder:'Ex: Maputo, Janeiro 2025' },
      ]},
      { id:'destinatarioNome',  label:'Nome do Destinatário', type:'text', required:true, placeholder:'Ex: Director de RH, Dr. João Moreira' },
      { id:'destinatarioEnti',  label:'Entidade / Empresa', type:'text', required:true, placeholder:'Ex: BCI – Banco Comercial e de Investimentos' },
      { id:'assunto',           label:'Assunto da Carta', type:'text', required:true, placeholder:'Ex: Candidatura ao cargo de Técnico de Vendas – Ref. 2025/01' },
      { id:'pontos',            label:'Pontos principais a abordar', type:'textarea', required:true,
        placeholder:'Descreva: o seu perfil, motivação, o que pede/propõe, como quer ser contactado…' },
    ],
    buildPrompt(d, ocr) {
      return `Redija uma CARTA FORMAL COMPLETA E PROFISSIONAL do tipo "${d.tipo}".

Dados:
- Remetente: ${d.remetenteNome}, ${d.remetenteLocal || 'Maputo'}
- Destinatário: ${d.destinatarioNome} — ${d.destinatarioEnti}
- Assunto: ${d.assunto}
- Pontos a abordar: ${d.pontos}
${ocr ? `\nRascunho OCR da carta (use como base):\n${ocr}` : ''}

Estrutura OBRIGATÓRIA em Markdown:

[Localidade], [Data]

**[Nome do Remetente]**
[Morada, se disponível]
[Contacto]

---

**Exmo.(a) Senhor(a) [Nome do Destinatário]**
**[Cargo], [Entidade]**
[Endereço]

---

**Assunto: ${d.assunto}**

[Saudação formal adequada ao tipo de carta]

[1º § — Apresentação e motivo do contacto]

[2º § — Desenvolvimento principal: argumentos, contexto, justificativa]

[3º § — Informação complementar ou reforço de argumentos]

[§ Final — Pedido específico, disponibilidade, call-to-action]

[Fecho formal adequado ao tipo]

[Nome completo do Remetente]
[Cargo/Qualificação, se relevante]

---

Tom: Formal, respeitoso, claro, persuasivo mas sem exageros.
Para "${d.tipo}": ${getTomCarta(d.tipo)}`;

      function getTomCarta(t) {
        if (t.includes('Candidatura') || t.includes('Motivação')) return 'Destacar alinhamento entre perfil e requisitos. Confiante sem arrogância.';
        if (t.includes('Reclamação')) return 'Firme mas educado. Apresentar situação factual, dano sofrido e solução desejada.';
        if (t.includes('Demissão')) return 'Profissional, grato pelas oportunidades, oferecer período de transição.';
        return 'Claro, directo, objectivo. Justificar o pedido e facilitar a resposta afirmativa.';
      }
    },
  },

  orcamento: {
    icon:'🏗️', bg:'#F5F3FF', title:'Orçamento de Construção', sub:'IA gera tabela detalhada em MZN',
    hasAI: true,
    fields: [
      { id:'tipoObra',    label:'Tipo de Obra', type:'text',     required:true, placeholder:'Ex: Casa T2, Vedação 50m, Remodelação de sala…' },
      { row:true, items:[
        { id:'area',      label:'Área (m²)', type:'number', placeholder:'Ex: 120', min:'1' },
        { id:'local',     label:'Localização', type:'text', required:true, placeholder:'Ex: Maputo, Matola…' },
      ]},
      { id:'acabamento',  label:'Tipo de Acabamento', type:'select',
        opts:['Simples / Económico','Médio / Padrão','Alto Padrão / Luxo'] },
      { id:'fase',        label:'Fase do Projecto', type:'select',
        opts:['Construção do zero (fundação até tecto)','Apenas estrutura e alvenaria','Apenas acabamentos / revestimentos','Instalações (hidráulica + eléctrica)','Renovação / Remodelação parcial'] },
      { id:'prazo',       label:'Prazo desejado (dias)', type:'number', value:'60', min:'7' },
      { id:'extra',       label:'Detalhes adicionais (opcional)', type:'textarea',
        placeholder:'Número de divisões, materiais preferidos, características especiais…' },
    ],
    buildPrompt(d, ocr) {
      return `Elabora um ORÇAMENTO DE CONSTRUÇÃO DETALHADO E PROFISSIONAL para o mercado moçambicano de ${new Date().getFullYear()}.

Projecto:
- Obra: ${d.tipoObra}
- Área: ${d.area ? d.area + ' m²' : 'a definir'}
- Local: ${d.local}
- Acabamento: ${d.acabamento || 'Médio'}
- Fase: ${d.fase || 'Construção do zero'}
- Prazo: ${d.prazo || '60'} dias
- Detalhes: ${d.extra || 'Construção padrão'}
${ocr ? `\nLista de materiais extraída (OCR, use como base):\n${ocr}` : ''}

Estrutura em Markdown com tabelas:

# ORÇAMENTO DE CONSTRUÇÃO
**Projecto:** [descrição]  **Local:** [local]  **Data:** [data]  **Válido até:** [30 dias]

---

## 1. Resumo do Projecto
(descrição da obra, dimensões, fases cobertas)

## 2. Materiais de Construção

### 2.1 Fundação e Estrutura
| Nº | Material | Unid. | Qtd. | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|---|---|

### 2.2 Alvenaria
| Nº | Material | Unid. | Qtd. | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|---|---|

### 2.3 Cobertura
| Nº | Material | Unid. | Qtd. | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|---|---|

### 2.4 Acabamentos e Revestimentos
| Nº | Material | Unid. | Qtd. | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|---|---|

### 2.5 Instalações (Hidráulica + Eléctrica)
| Nº | Material | Unid. | Qtd. | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|---|---|

**Subtotal Materiais:** MZN [valor]
*(Incluída margem de contingência de 12% para perdas e quebras)*

## 3. Mão de Obra
| Especialidade | Nº Trab. | Dias | Custo/Dia (MZN) | Total (MZN) |
|---|---|---|---|---|

**Subtotal Mão de Obra:** MZN [valor]

## 4. Equipamentos e Transporte
| Item | Quantidade / Dias | Custo (MZN) |
|---|---|---|

## 5. Resumo Financeiro
| Categoria | Valor (MZN) |
|---|---|
| Materiais | |
| Mão de obra | |
| Equipamentos/transporte | |
| Imprevistos (10%) | |
| **TOTAL GLOBAL** | |

## 6. Condições Comerciais
- **Prazo de execução:** ${d.prazo || '60'} dias úteis
- **Validade do orçamento:** 30 dias
- **Pagamento:** 30% entrada, 40% estrutura, 30% conclusão
- **Garantia:** 12 meses em defeitos de construção

## 7. Observações
(notas técnicas relevantes, exclusões, recomendações)

IMPORTANTE: Usar preços actuais do mercado moçambicano (${new Date().getFullYear()}). Se incerto, marcar com [VERIFICAR PREÇO]. Incluir todos os materiais necessários para cada fase indicada.`;
    },
  },

  impressao: {
    icon:'🖨️', bg:'#FDF2F8', title:'Impressão de Documentos', sub:'Pedido por WhatsApp sem créditos',
    hasAI: false,
    fields: [
      { id:'nome',   label:'O seu Nome', type:'text', required:true, placeholder:'Ex: Maria Nhantumbo' },
      { id:'tipo',   label:'Tipo de Impressão', type:'select', required:true,
        opts:['Preto e Branco','Colorido','Frente e Verso P&B','Frente e Verso Colorido'] },
      { row:true, items:[
        { id:'paginas', label:'N.º de Páginas', type:'number', placeholder:'Ex: 10', min:'1' },
        { id:'copias',  label:'N.º de Cópias',  type:'number', value:'1',  min:'1' },
      ]},
      { id:'papel',   label:'Tamanho do Papel', type:'select', opts:['A4 (padrão)','A3','A5','Carta'] },
      { id:'obs',     label:'Observações', type:'text', placeholder:'Ex: Urgente, encadernar, plastificar…' },
    ],
    buildWA(d) {
      return `🖨️ *PEDIDO DE IMPRESSÃO – MzDocs Pro*\n\n👤 Nome: ${d.nome}\n🎨 Tipo: ${d.tipo}\n📄 Páginas: ${d.paginas||'?'} | Cópias: ${d.copias||'1'}\n📐 Papel: ${d.papel}\n📌 Obs: ${d.obs||'Nenhuma'}\n\n✅ _Envio o ficheiro nesta conversa. Obrigado!_`;
    },
  },

  foto: {
    icon:'📷', bg:'#ECFEFF', title:'Foto para Documentos', sub:'BI, passaporte, CV — formato correcto',
    hasAI: false,
    fields: [
      { id:'nome',      label:'O seu Nome', type:'text', required:true, placeholder:'Ex: Pedro Cossa' },
      { id:'finalidade',label:'Finalidade', type:'select', required:true,
        opts:['BI / Cartão de Identidade','Passaporte','Visto','Currículo (CV)','Matrícula Escolar','Outro'] },
      { row:true, items:[
        { id:'qtd',   label:'Quantidade (impressas)', type:'number', value:'6', min:'1' },
        { id:'fundo', label:'Cor do Fundo', type:'select', opts:['Branco','Azul claro','Cinzento'] },
      ]},
    ],
    buildWA(d) {
      return `📷 *FOTO PARA DOCUMENTOS – MzDocs Pro*\n\n👤 Nome: ${d.nome}\n🎯 Finalidade: ${d.finalidade}\n🖼 Quantidade: ${d.qtd||'6'} fotos impressas\n🎨 Fundo: ${d.fundo}\n\n✅ _Envio a minha foto nesta conversa._`;
    },
  },

  conversao: {
    icon:'🔄', bg:'#FEF2F2', title:'Conversão de Ficheiros', sub:'PDF ↔ Word, Excel, Imagem…',
    hasAI: false,
    fields: [
      { id:'nome', label:'O seu Nome', type:'text', required:true, placeholder:'Ex: Fátima Cuna' },
      { id:'conv', label:'Tipo de Conversão', type:'select', required:true,
        opts:['PDF → Word (.docx)','Word → PDF','PDF → Excel','Excel → PDF','Imagem → PDF','PDF → Imagem (JPG/PNG)','PowerPoint → PDF'] },
      { row:true, items:[
        { id:'nfich', label:'Nº de Ficheiros', type:'number', value:'1', min:'1' },
        { id:'urg',   label:'Urgência', type:'select',
          opts:['Normal (até 2h)','Urgente (até 30min) +taxa','Imediato +taxa'] },
      ]},
    ],
    buildWA(d) {
      return `🔄 *CONVERSÃO DE FICHEIROS – MzDocs Pro*\n\n👤 Nome: ${d.nome}\n↔️ Tipo: ${d.conv}\n📂 Ficheiros: ${d.nfich||'1'}\n⚡ Urgência: ${d.urg}\n\n✅ _Envio o ficheiro nesta conversa._`;
    },
  },
};

// ════════════════════════════════════
// UTILITÁRIOS
// ════════════════════════════════════
const $ = id => document.getElementById(id);
const toast = (msg, ms=3000) => {
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), ms);
};
const openOverlay = id => { $(id).classList.add('open'); document.body.style.overflow='hidden'; };
const closeOverlay = id => { $(id).classList.remove('open'); document.body.style.overflow=''; };

// ════════════════════════════════════
// SISTEMA DE CRÉDITOS
// ════════════════════════════════════
function getUserId() {
  let id = localStorage.getItem('mz_uid');
  if (!id) { id='mz_'+Math.random().toString(36).slice(2,11); localStorage.setItem('mz_uid',id); }
  return id;
}

async function loadCredits() {
  STATE.userId = getUserId();

  // Créditos gratuitos mensais
  const freeKey = 'mz_free_' + new Date().toISOString().slice(0,7); // mês corrente
  let freeUsed = parseInt(localStorage.getItem(freeKey)||'0');
  let freeLeft = Math.max(0, CFG.FREE_MONTHLY - freeUsed);

  // Créditos comprados
  let paid = parseInt(localStorage.getItem('mz_credits')||'0');

  STATE.credits = freeLeft + paid;

  // Sincronizar com servidor em background (não bloqueia UI)
  syncCreditsServer().catch(()=>{});

  updateCreditUI();
  $('freeCreditsLeft').textContent = freeLeft;
}

async function syncCreditsServer() {
  try {
    const r = await fetch(CFG.VERIFY_EP, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({userId: STATE.userId})
    });
    if (!r.ok) return;
    const d = await r.json();
    if (typeof d.credits === 'number') {
      STATE.credits = d.credits;
      localStorage.setItem('mz_credits', d.paidCredits||0);
      updateCreditUI();
    }
  } catch(_) {}
}

function updateCreditUI() {
  $('creditDisplay').textContent = STATE.credits;
  $('creditChip').style.borderColor = STATE.credits===0 ? '#EF4444' : '';
}

function consumeFreeCredit() {
  const freeKey = 'mz_free_' + new Date().toISOString().slice(0,7);
  const used = parseInt(localStorage.getItem(freeKey)||'0') + 1;
  localStorage.setItem(freeKey, used);
}

// ════════════════════════════════════
// ABRIR SERVIÇO — FORMULÁRIO
// ════════════════════════════════════
const APP = {};

APP.openService = function(key) {
  const svc = SERVICES[key];
  if (!svc) return;

  // Verificar créditos para serviços IA
  if (svc.hasAI && STATE.credits < CFG.DOC_COST) {
    APP.showPricing();
    toast('⚠️ Créditos insuficientes. Compre mais para continuar.');
    return;
  }

  STATE.service = key;
  STATE.ocrText = null;
  STATE.generatedDoc = null;

  // Cabeçalho
  $('shIco').textContent = svc.icon;
  $('shIco').style.background = svc.bg;
  $('shTitle').textContent = svc.title;
  $('shSub').textContent = svc.sub;

  // Mostrar / esconder OCR
  $('ocrZone').style.display = svc.hasAI ? 'block' : 'none';
  resetOCRUI();

  // Renderizar campos do formulário
  $('formBody').innerHTML = buildFormHTML(svc.fields);

  // Botões de acção
  if (svc.hasAI) {
    $('formActions').innerHTML = `
      <div class="loader-block" id="loaderBlock">
        <div class="loader-spinner"></div>
        <div class="loader-steps" id="loaderSteps"></div>
      </div>
      <button class="btn-gen" id="btnGen" onclick="APP.generate()">
        <span class="btn-gen-ico">✦</span>
        Gerar Documento com IA &nbsp;<small style="opacity:.7;font-weight:500">(1 crédito)</small>
      </button>`;
  } else {
    $('formActions').innerHTML = `
      <button class="btn-wa-form" onclick="APP.sendDirectWA()">
        💬 Enviar Pedido pelo WhatsApp
      </button>`;
  }

  openOverlay('formOverlay');
};

// ════════════════════════════════════
// CONSTRUIR HTML DO FORMULÁRIO
// ════════════════════════════════════
function buildFormHTML(fields) {
  return fields.map(f => {
    if (f.row) {
      return `<div class="fg-row">${f.items.map(fi => renderField(fi)).join('')}</div>`;
    }
    return renderField(f);
  }).join('');
}

function renderField(f) {
  const req = f.required ? 'required' : '';
  let input = '';

  if (f.type === 'select') {
    const opts = f.opts.map(o => `<option value="${o}">${o}</option>`).join('');
    input = `<select class="fs" id="${f.id}" name="${f.id}" ${req}><option value="">Seleccione…</option>${opts}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea class="fta" id="${f.id}" name="${f.id}" placeholder="${f.placeholder||''}" ${req}></textarea>`;
  } else {
    const extras = [
      f.min   ? `min="${f.min}"`         : '',
      f.max   ? `max="${f.max}"`         : '',
      f.value ? `value="${f.value}"`     : '',
    ].filter(Boolean).join(' ');
    input = `<input class="fi" id="${f.id}" name="${f.id}" type="${f.type}" placeholder="${f.placeholder||''}" ${extras} ${req}/>`;
  }

  return `<div class="fg"><label class="fl">${f.label}${f.required?' *':''}</label>${input}</div>`;
}

// ════════════════════════════════════
// FECHAR FORMULÁRIO
// ════════════════════════════════════
APP.closeForm = function(e) { if (e.target===$('formOverlay')) APP.closeFormBtn(); };
APP.closeFormBtn = function() {
  closeOverlay('formOverlay');
  STATE.service = null;
  STATE.ocrText = null;
  STATE.generating = false;
};

// ════════════════════════════════════
// OCR
// ════════════════════════════════════
let tesseractWorker = null;
let tesseractLoaded = false;

APP.triggerOCR = function(mode) {
  const input = $('ocrInput');
  if (mode === 'cam') input.setAttribute('capture','environment');
  else input.removeAttribute('capture');
  input.click();
};

APP.handleOCRFile = async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5*1024*1024) { toast('❌ Imagem muito grande (máx. 5MB)'); return; }

  $('ocrProgress').style.display = 'block';
  $('ocrResult').style.display = 'none';
  $('ocrStatus').textContent = 'A inicializar OCR…';
  $('ocrFill').style.width = '0%';

  try {
    // Carregamento lazy do Tesseract
    if (!tesseractLoaded) {
      await loadScript(window.TESSERACT_URL);
      tesseractLoaded = true;
    }

    if (!tesseractWorker) {
      $('ocrStatus').textContent = 'A carregar modelo de linguagem…';
      tesseractWorker = await Tesseract.createWorker('por', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 100);
            $('ocrFill').style.width = pct + '%';
            $('ocrStatus').textContent = `A reconhecer texto… ${pct}%`;
          } else {
            $('ocrStatus').textContent = m.status;
          }
        }
      });
    }

    const result = await tesseractWorker.recognize(file);
    const text = result.data.text.trim();
    const conf = Math.round(result.data.confidence);

    $('ocrProgress').style.display = 'none';
    $('ocrText').value = text;
    $('ocrConf').textContent = `Confiança: ${conf}%`;
    $('ocrResult').style.display = 'block';

    if (conf < 50) toast('⚠️ Reconhecimento com baixa confiança. Revise o texto.');

  } catch(err) {
    $('ocrProgress').style.display = 'none';
    toast('❌ Erro no OCR: ' + err.message);
    console.error('OCR error:', err);
  }

  e.target.value = ''; // reset input
};

APP.useOCR = function() {
  STATE.ocrText = $('ocrText').value.trim();
  $('ocrResult').style.display = 'none';
  toast('✅ Texto OCR incorporado no documento');
};

APP.discardOCR = function() {
  STATE.ocrText = null;
  resetOCRUI();
};

function resetOCRUI() {
  $('ocrProgress').style.display = 'none';
  $('ocrResult').style.display = 'none';
  $('ocrInput').value = '';
  if ($('ocrText')) $('ocrText').value = '';
  if ($('ocrFill')) $('ocrFill').style.width = '0%';
}

// ════════════════════════════════════
// GERAR DOCUMENTO COM IA
// ════════════════════════════════════
const LOADER_STEPS = [
  'A analisar os dados do formulário…',
  'A consultar a IA (Claude)…',
  'A redigir o documento…',
  'A finalizar e rever…',
];

APP.generate = async function() {
  if (STATE.generating) return;

  const svc = SERVICES[STATE.service];
  const data = collectFormData(svc.fields);

  // Validar campos obrigatórios
  const invalid = validateForm(svc.fields, data);
  if (invalid) { toast(`⚠️ Campo obrigatório: ${invalid}`); return; }

  // Verificar créditos
  if (STATE.credits < CFG.DOC_COST) { APP.showPricing(); return; }

  STATE.generating = true;
  const btn = $('btnGen');
  btn.disabled = true;

  // Mostrar loader
  const lb = $('loaderBlock');
  lb.classList.add('show');
  btn.style.display = 'none';

  // Animar passos
  $('loaderSteps').innerHTML = LOADER_STEPS.map((s,i) =>
    `<div class="ls-item" id="ls${i}"><div class="ls-dot"></div>${s}</div>`
  ).join('');

  let stepIdx = 0;
  const stepIv = setInterval(() => {
    if (stepIdx > 0) $(`ls${stepIdx-1}`)?.classList.replace('active','done');
    if (stepIdx < LOADER_STEPS.length) $(`ls${stepIdx}`)?.classList.add('active');
    stepIdx++;
    if (stepIdx > LOADER_STEPS.length) clearInterval(stepIv);
  }, 700);

  try {
    const prompt = svc.buildPrompt(data, STATE.ocrText);

    const res = await fetch(CFG.API_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        serviceType: STATE.service,
        prompt,
        userId: STATE.userId,
        userCredits: STATE.credits,
      }),
    });

    clearInterval(stepIv);
    lb.classList.remove('show');
    btn.style.display = '';
    btn.disabled = false;
    STATE.generating = false;

    if (res.status === 402) {
      APP.showPricing();
      toast('⚠️ Créditos insuficientes.');
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'Erro desconhecido'}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const result = await res.json();

    if (result.error) throw new Error(result.error);

    STATE.generatedDoc = result.document;
    STATE.credits = result.creditsRemaining ?? Math.max(0, STATE.credits - 1);
    updateCreditUI();

    // Deduzir localmente se crédito gratuito
    consumeFreeCredit();

    closeOverlay('formOverlay');
    showResult(result.document, data, svc);

  } catch(err) {
    clearInterval(stepIv);
    lb.classList.remove('show');
    btn.style.display = '';
    btn.disabled = false;
    STATE.generating = false;
    toast('❌ Erro: ' + err.message);
    console.error('Generate error:', err);
  }
};

// ════════════════════════════════════
// RESULTADO
// ════════════════════════════════════
function showResult(markdown, data, svc) {
  $('resultMeta').innerHTML = `
    <span>📄 ${svc.title}</span>
    <span>⚡ ${STATE.credits} créditos restantes</span>
    <span>🕐 ${new Date().toLocaleTimeString('pt')}</span>
  `;
  $('resultPreview').innerHTML = markdownToHTML(markdown);
  openOverlay('resultOverlay');
}

APP.closeResult = function(e) { if (e.target===$('resultOverlay')) APP.closeResultBtn(); };
APP.closeResultBtn = function() {
  closeOverlay('resultOverlay');
  STATE.generatedDoc = null;
};

APP.copyDoc = function() {
  if (!STATE.generatedDoc) return;
  navigator.clipboard?.writeText(STATE.generatedDoc)
    .then(()=>toast('📋 Copiado!'))
    .catch(()=>toast('Não foi possível copiar'));
};

APP.downloadDoc = function() {
  if (!STATE.generatedDoc) return;
  const blob = new Blob([STATE.generatedDoc], {type:'text/markdown;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `mzdocs-${STATE.service||'doc'}-${Date.now()}.md`;
  a.click(); URL.revokeObjectURL(url);
};

APP.sendWA = function() {
  if (!STATE.generatedDoc) return;
  const svc = SERVICES[STATE.service];
  const preview = STATE.generatedDoc.slice(0, 1200).replace(/#{1,3} /g,'*').replace(/\*\*/g,'*');
  const msg = `📄 *${svc.title} – MzDocs Pro*\n\n${preview}\n\n[...documento completo disponível. Verifique o WhatsApp.]\n\n_Gerado por MzDocs Pro com IA_`;
  sendToWhatsApp(msg);
};

// ════════════════════════════════════
// ENVIO DIRECTO WA (sem IA)
// ════════════════════════════════════
APP.sendDirectWA = function() {
  const svc = SERVICES[STATE.service];
  if (!svc || !svc.buildWA) return;
  const data = collectFormData(svc.fields);
  const invalid = validateForm(svc.fields, data);
  if (invalid) { toast(`⚠️ Campo obrigatório: ${invalid}`); return; }
  sendToWhatsApp(svc.buildWA(data));
  APP.closeFormBtn();
};

function sendToWhatsApp(msg) {
  const url = `https://wa.me/${CFG.WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  toast('✅ A abrir WhatsApp…');
}

// ════════════════════════════════════
// PAGAMENTO M-PESA
// ════════════════════════════════════
APP.showPricing = function() { openOverlay('pricingOverlay'); };
APP.closePricing = function(e) { if (e.target===$('pricingOverlay')) APP.closePricingBtn(); };
APP.closePricingBtn = function() {
  closeOverlay('pricingOverlay');
  STATE.selectedPkg = null;
};

APP.selectPkg = function(el, pkg) {
  document.querySelectorAll('.price-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  STATE.selectedPkg = pkg;
  const pkgData = {starter:{amount:150,credits:10},basico:{amount:350,credits:25},pro:{amount:750,credits:60}};
  const p = pkgData[pkg];
  $('mpSummary').innerHTML = `<span>Pacote <strong>${pkg.charAt(0).toUpperCase()+pkg.slice(1)}</strong></span><strong>MZN ${p.amount} → ${p.credits} créditos</strong>`;
  $('mpesaPay').style.display = 'block';
  APP.validatePhone($('mpesaPhone'));
};

APP.validatePhone = function(input) {
  const raw = input.value.replace(/\D/g,'');
  const valid = /^8[4-7]\d{7}$/.test(raw);
  $('btnPay').disabled = !valid || !STATE.selectedPkg;
};

APP.processPayment = async function() {
  const phone = $('mpesaPhone').value.replace(/\D/g,'');
  const pkgData = {starter:{amount:150,credits:10},basico:{amount:350,credits:25},pro:{amount:750,credits:60}};
  const pkg = pkgData[STATE.selectedPkg];

  const btn = $('btnPay');
  btn.disabled = true;
  btn.textContent = '⏳ A processar…';

  try {
    const r = await fetch(CFG.PAY_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        phoneNumber: '258' + phone,
        amount: pkg.amount,
        packageId: STATE.selectedPkg,
        userId: STATE.userId,
      }),
    });

    const data = await r.json();

    if (data.success) {
      STATE.credits += pkg.credits;
      const current = parseInt(localStorage.getItem('mz_credits')||'0');
      localStorage.setItem('mz_credits', current + pkg.credits);
      updateCreditUI();
      toast(`✅ ${pkg.credits} créditos adicionados!`);
      APP.closePricingBtn();
    } else {
      toast('❌ Pagamento falhou: ' + (data.message || 'Tente novamente'));
    }
  } catch(err) {
    toast('❌ Erro de ligação. Tente novamente.');
    console.error('Payment error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Pagamento';
  }
};

// ════════════════════════════════════
// MARKDOWN → HTML (simples)
// ════════════════════════════════════
function markdownToHTML(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // Tabelas
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.slice(1,-1).split('|').map(c=>c.trim());
      return '<tr>' + cells.map(c=>`<td>${c}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n)+/g, m => `<table>${m}</table>`)
    // Separadores
    .replace(/^---+$/gm, '<hr/>')
    // Títulos
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,  '<h1>$1</h1>')
    // Negrito
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    // Itálico
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    // Listas
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m=>`<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
    // Parágrafos
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br/>');

  return `<p>${html}</p>`;
}

// ════════════════════════════════════
// HELPERS DO FORMULÁRIO
// ════════════════════════════════════
function collectFormData(fields) {
  const data = {};
  const collect = (f) => {
    const el = $(f.id);
    if (el) data[f.id] = el.value.trim();
  };
  fields.forEach(f => {
    if (f.row) f.items.forEach(fi => collect(fi));
    else collect(f);
  });
  return data;
}

function validateForm(fields, data) {
  for (const f of fields) {
    if (f.row) {
      for (const fi of f.items) {
        if (fi.required && !data[fi.id]) return fi.label;
      }
    } else {
      if (f.required && !data[f.id]) return f.label;
    }
  }
  return null;
}

// ════════════════════════════════════
// LAZY SCRIPT LOADER
// ════════════════════════════════════
function loadScript(src) {
  return new Promise((res,rej)=>{
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

// ════════════════════════════════════
// SERVICE WORKER
// ════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js')
      .then(()=>console.log('MzDocs Pro SW ✅'))
      .catch(e=>console.warn('SW:', e));
  });
}

// ════════════════════════════════════
// INICIALIZAÇÃO
// ════════════════════════════════════
document.addEventListener('DOMContentLoaded', ()=>{
  STATE.userId = getUserId();
  loadCredits();

  // Actualizar FAB com o número correcto
  $('fabWa').href = `https://wa.me/${CFG.WA_NUMBER}`;
});
