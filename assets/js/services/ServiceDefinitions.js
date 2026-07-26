// services/ServiceDefinitions.js — Definição de todos os serviços

// Categorias disponíveis
export const CATEGORIES = [
  { id: 'populares',  label: '🔥 Mais Buscados'   },
  { id: 'pessoal',    label: '👤 Pessoal'          },
  { id: 'academico',  label: '📚 Académico'        },
  { id: 'juridico',   label: '⚖️ Jurídico'         },
  { id: 'negocio',    label: '💼 Negócio'          },
  { id: 'servicos',   label: '🛠️ Serviços'         },
  { id: 'todos',      label: '✦ Todos'             },
];

export const SERVICES = {

  cv: {
    icon:'📋', bg:'#ECFDF5', title:'Currículo (CV)',
    sub:'CV profissional formatado para destacar o seu perfil', hasAI:true,
    category:'pessoal', popularity:1,
    fields:[
      { id:'nome',        label:'Nome Completo', type:'text', required:true, ph:'Ana Sofia Machava' },
      { id:'cargo',       label:'Cargo / Vaga pretendida', type:'text', required:true, ph:'Assistente Administrativo…' },
      { id:'perfilCV',    label:'Perfil do Candidato', type:'select', required:true,
        opts:['Primeiro Emprego (sem experiência)','Com Experiência Profissional','Mudança de Carreira','Regresso ao mercado de trabalho'] },
      { row:true, items:[
        { id:'nascimento', label:'Data de Nascimento', type:'text', ph:'15/03/1998' },
        { id:'contacto',   label:'Telefone', type:'tel', required:true, ph:'84 XXX XXXX', pattern:'8[2-7][0-9]{7}', maxlength:'9', inputmode:'tel' },
      ]},
      { id:'email',       label:'Email (opcional)', type:'email', ph:'email@exemplo.com' },
      { id:'localizacao', label:'Cidade / Bairro', type:'text', ph:'Maputo, Bairro Central' },
      { id:'formacao',    label:'Formação Académica', type:'textarea', required:true, ph:'Licenciatura em Gestão – UEM, 2022\nEnsino Secundário – Escola Secundária da Polana, 2018' },
      { id:'experiencia', label:'Experiência Profissional', type:'textarea', ph:'Cargo | Empresa | Período\nO que fez e que resultados obteve…' },
      { id:'linguas',     label:'Línguas', type:'text', required:true, ph:'Português (nativo), Inglês (intermédio), Changana (fluente)' },
      { id:'habilidades', label:'Habilidades / Competências Técnicas', type:'textarea', ph:'Excel avançado, AutoCAD, condução (carta B), contabilidade…' },
      { id:'exemplo',     label:'Realização ou Projecto que se destaca', type:'textarea', ph:'Ex: Organizei stock de 500+ produtos e reduzi perdas em 20%… (seja concreto)' },
      { id:'objectivo',   label:'Objectivo Profissional', type:'text', ph:'Área de finanças empresariais em empresa de grande porte' },
    ],
    buildWA: null,
  },

  trabalho: {
    icon:'📚', bg:'#EFF6FF', title:'Trabalho Escolar',
    sub:'Texto académico completo com estrutura profissional', hasAI:true,
    category:'academico', popularity:2,
    fields:[
      { id:'tema',       label:'Tema / Título', type:'text', required:true, ph:'Ex: O Papel da Mulher na Independência de Moçambique' },
      { id:'nivel',      label:'Nível de Ensino', type:'select', required:true,
        opts:['Ensino Primário','Ensino Secundário (1º Ciclo)','Ensino Secundário (2º Ciclo)','Pré-Universitário','Licenciatura','Mestrado/Doutoramento'] },
      { id:'disciplina', label:'Disciplina', type:'text', required:true, ph:'Ex: História, Português, Biologia…' },
      // CORRIGIDO: a capa do documento (exportador PDF/Word — ver
      // PDFExporter.js "Estudante:"/"Docente:" — e o template "Académico
      // Clássico" do marketplace, que já tem os placeholders {{AUTORES}},
      // {{INSTITUICAO}}, {{CURSO}}, {{LOCAL_ANO}}) sempre esperou estes
      // dados, mas o formulário nunca os coletava — ficavam sempre em
      // branco ou inventados pela IA. Todos opcionais: um aluno pode gerar
      // o trabalho sem preencher tudo, mas quem preencher vê os dados
      // reais na capa em vez de marcadores de lugar.
      { id:'aluno',      label:'Nome do Aluno/Estudante (opcional)', type:'text', ph:'Ex: Maria José Cossa' },
      { id:'turma',      label:'Turma / Classe (opcional)', type:'text', ph:'Ex: 10ª Classe, Turma B' },
      { id:'docente',    label:'Nome do Professor/Docente (opcional)', type:'text', ph:'Ex: Prof. João Sitoe' },
      { id:'instituicao',label:'Escola / Instituição (opcional)', type:'text', ph:'Ex: Escola Secundária Josina Machel' },
      { id:'paginas',    label:'Páginas pretendidas', type:'number', val:'5', min:'2', max:'30' },
      { id:'requisitos', label:'Instruções do professor', type:'textarea', ph:'Cole o enunciado ou descreva o que o professor pediu…' },
    ],
    buildWA: null,
  },

  carta: {
    icon:'✉️', bg:'#FFFBEB', title:'Carta Formal',
    sub:'Carta profissional bem estruturada', hasAI:true,
    category:'pessoal', popularity:3,
    fields:[
      { id:'tipo',          label:'Tipo de Carta', type:'select', required:true,
        opts:['Candidatura a Emprego','Carta de Motivação','Pedido Formal','Reclamação','Demissão','Agradecimento','Apresentação Comercial'] },
      { row:true, items:[
        { id:'remetenteNome',  label:'O seu Nome', type:'text', required:true, ph:'Carlos Bila' },
        { id:'remetenteLocal', label:'Localidade / Data', type:'text', ph:'Maputo, Janeiro 2025' },
      ]},
      { id:'destinatarioNome', label:'Nome do Destinatário', type:'text', required:true, ph:'Dr. João Moreira' },
      { id:'destinatarioEnti', label:'Entidade / Empresa', type:'text', required:true, ph:'BCI – Banco Comercial' },
      { id:'assunto',          label:'Assunto da Carta', type:'text', required:true, ph:'Candidatura ao cargo de Técnico de Vendas' },
      { id:'pontos',           label:'O que pretende comunicar', type:'textarea', required:true, ph:'Descreva os pontos principais que quer incluir…' },
      { id:'refReclamacao',    label:'N.º de referência / encomenda (Reclamação)', type:'text', ph:'REF-2025-001', conditional:'tipo', condValue:'Reclamação' },
      { id:'dataSaida',        label:'Data de saída pretendida (Demissão)', type:'text', ph:'30 de Junho de 2025', conditional:'tipo', condValue:'Demissão' },
      { id:'avisoPrevio',      label:'Aviso prévio cumprido?', type:'select', opts:['Sim (30 dias)','Sim (15 dias)','Não — justificar nos pontos'], conditional:'tipo', condValue:'Demissão' },
    ],
    buildWA: null,
  },

  arrendamento: {
    icon:'🏠', bg:'#FEF3C7', title:'Contrato de Arrendamento',
    sub:'Contrato legal para aluguer de casa ou loja conforme lei moçambicana', hasAI:true,
    category:'juridico', popularity:4,
    fields:[
      // NOVO (correcção 2.5): mesmo padrão requiredIf/dynamicHint do Recibo/
      // Factura, agora aplicado ao Arrendamento — pedido explícito na
      // auditoria ("reutilizar o mecanismo em arrendamento, procuração,
      // orçamento"). Um terreno normalmente não tem água/electricidade
      // ligadas, por isso 'quemPagaServicos' abaixo deixa de ser obrigatório
      // quando este campo tiver o valor 'Terreno'.
      { id:'tipoImovel', label:'Tipo de Imóvel', type:'select', required:true,
        opts:['Casa Residencial','Apartamento','Loja Comercial','Escritório','Terreno'],
        dynamicHint:{
          'Terreno':'🌍 Terreno: o campo "Água e Electricidade" abaixo torna-se opcional — normalmente um terreno não tem serviços ligados.',
        } },
      { row:true, items:[
        { id:'proprietario', label:'Nome do Proprietário', type:'text', required:true, ph:'António Matola' },
        { id:'locatario',    label:'Nome do Locatário',    type:'text', required:true, ph:'Maria Tembe' },
      ]},
      { row:true, items:[
        { id:'biProprietario', label:'BI do Proprietário', type:'text', required:true, ph:'110100111222A' },
        { id:'biLocatario',    label:'BI do Locatário',    type:'text', required:true, ph:'110100333444B' },
      ]},
      { row:true, items:[
        { id:'local', label:'Localização do Imóvel',  type:'text',   required:true, ph:'Bairro Polana Caniço, Maputo' },
        { id:'valor', label:'Valor Mensal (MZN)',      type:'number', required:true, ph:'15000', min:'1' },
      ]},
      { id:'metodoPagamento', label:'Método de Pagamento da Renda', type:'select', required:true,
        opts:['M-Pesa','Transferência Bancária','Depósito Bancário','Dinheiro (numerário)','A acordar entre as partes'] },
      { id:'duracao',   label:'Duração do Contrato', type:'select', required:true,
        opts:['6 meses','12 meses','24 meses','36 meses','Indeterminado'] },
      { id:'caucao',    label:'Caução / Depósito',    type:'text', required:true, ph:'2 meses de renda adiantada' },
      { id:'quemPagaServicos', label:'Água e Electricidade pagas por', type:'select',
        opts:['Inquilino (separado da renda)','Incluídas na renda','Proprietário','A acordar'],
        requiredIf:{ field:'tipoImovel', in:['Casa Residencial','Apartamento','Loja Comercial','Escritório'] },
        hint:'Não aplicável a Terreno — torna-se opcional quando não há serviços ligados.' },
      { id:'condicoes', label:'Condições Especiais',  type:'textarea', ph:'Animais permitidos? Reformas? Uso de espaço exterior?' },
    ],
    buildWA: null,
  },

  requerimento: {
    icon:'📄', bg:'#DBEAFE', title:'Requerimento Oficial',
    sub:'Pedidos formais para repartições, escolas, hospitais e serviços públicos', hasAI:true,
    category:'juridico', popularity:5,
    fields:[
      { id:'tipo',        label:'Tipo de Requerimento', type:'select', required:true,
        opts:['Pedido de Certidão','Pedido de Declaração','Transferência Escolar','Matrícula','Isenção de Propinas','Levantamento de Documentos','Outro'] },
      { row:true, items:[
        { id:'requerente', label:'Nome do Requerente', type:'text', required:true, ph:'Fátima Cossa' },
        { id:'bi',         label:'N.º BI',             type:'text', required:true, ph:'110100123456A' },
      ]},
      { id:'entidade',    label:'Entidade a que se dirige', type:'text', required:true, ph:'Escola Secundária da Polana' },
      { id:'assunto',     label:'Assunto do Pedido',        type:'text', required:true, ph:'Certidão de frequência escolar' },
      { id:'justificacao',label:'Justificação / Motivo',    type:'textarea', required:true, ph:'Explique de forma clara o motivo e o que precisa…' },
      { id:'contacto',    label:'Contacto (telemóvel)',      type:'tel',  required:true, ph:'84 XXX XXXX', pattern:'8[2-7][0-9]{7}', maxlength:'9', inputmode:'tel' },
      { id:'local',       label:'Local e Data',              type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  recibo: {
    icon:'🧾', bg:'#FFEDD5', title:'Recibo / Factura',
    sub:'Documento de venda para pequenos negócios e prestadores — os campos ajustam-se ao tipo escolhido', hasAI:true,
    category:'negocio', popularity:6,
    // NOVO (correcção 2.4): os ids dos campos abaixo foram alinhados com as
    // variáveis já usadas em services/prompts/recibo.js (data.nuitEmitente,
    // data.enderecoEmitente, data.biCliente, data.valor, data.iva,
    // data.contaBancaria, data.validadeProforma, data.numDoc). Antes os ids
    // eram 'nuit' e 'total', que NUNCA batiam com o que o prompt lia —
    // por isso o NUIT, endereço, BI do cliente e IVA nunca chegavam à IA,
    // mesmo quando preenchidos. Também foram adicionados campos que a
    // legislação fiscal moçambicana exige consoante o tipo de documento
    // (NUIT obrigatório em Factura/Proforma/Factura-Recibo/Nota de Débito,
    // validade em Factura Proforma, etc.) usando 'requiredIf' para tornar
    // o formulário dinâmico — sem esconder o campo, apenas ajustando se é
    // obrigatório ou não consoante o 'Tipo de Documento' seleccionado.
    fields:[
      // NOVO (correcção 2.5 — bug "formulário não muda dinamicamente"):
      // 1) 'val' pré-selecciona 'Recibo Simples' em vez de deixar o select
      //    em branco ("Selecione…") — o utilizador via sempre o MESMO
      //    estado "nada seleccionado" ao abrir o formulário, que é visual-
      //    mente idêntico ao estado de Recibo Simples, dando a impressão de
      //    que nada muda. Agora o formulário já abre no estado de Recibo
      //    Simples, e cada mudança de tipo dispara logo o 'change' inicial.
      // 2) 'dynamicHint' mostra uma caixa azul, logo abaixo do select, com
      //    um resumo em português do que aquele tipo de documento exige —
      //    é a mudança mais visível de todas (ver Views.js → _field() /
      //    bindDynamicHints()), pensada para o utilizador ver imediatamente
      //    "algo mudou" mesmo que não repare no asterisco do NUIT.
      { id:'tipoDoc',    label:'Tipo de Documento', type:'select', required:true,
        opts:['Recibo Simples','Factura','Factura Proforma','Factura-Recibo','Nota de Encomenda','Nota de Débito'],
        val:'Recibo Simples',
        hint:'Os campos abaixo (NUIT, IVA, validade…) ajustam-se automaticamente ao tipo escolhido.',
        dynamicHint:{
          'Recibo Simples':   '🧾 Recibo Simples: documento informal de venda. NUIT e IVA são opcionais — ideal para pequenos negócios e vendedores informais.',
          'Factura':          '🏢 Factura: exige NUIT do emitente (Lei n.º 32/2007). Indicada para empresas registadas que vendem produtos ou serviços.',
          'Factura Proforma': '📝 Factura Proforma: um orçamento formal antes da venda — indique a validade da proposta abaixo. Exige NUIT do emitente.',
          'Factura-Recibo':   '✅ Factura-Recibo: comprova a venda e o pagamento no mesmo documento. Exige NUIT do emitente.',
          'Nota de Encomenda':'📦 Nota de Encomenda: regista um pedido/reserva antes da entrega — ainda não é comprovativo de pagamento. NUIT e forma de pagamento opcionais.',
          'Nota de Débito':   '⚠️ Nota de Débito: usada para cobrar um valor adicional numa factura já emitida. Exige NUIT do emitente.',
        } },
      { row:true, items:[
        { id:'emitente',      label:'Nome / Empresa Emitente', type:'text', required:true, ph:'João Comerciante / Charifo Tech Solutions' },
        // NOVO (correcção 2.7): antes o NUIT ficava sempre visível e só o
        // asterisco/obrigatoriedade mudava (requiredIf) — mudança demasiado
        // subtil, o utilizador via o formulário "sempre igual". Agora o
        // campo fica mesmo ESCONDIDO para Recibo Simples/Nota de Encomenda
        // (onde é opcional e raramente usado) e só aparece para os 4 tipos
        // fiscais que o exigem — é uma diferença real e óbvia entre tipos.
        { id:'nuitEmitente',  label:'NUIT do Emitente', type:'text', ph:'400123456', pattern:'[0-9]{9}', maxlength:'9', inputmode:'numeric', required:true,
          conditional:'tipoDoc', condValue:['Factura','Factura Proforma','Factura-Recibo','Nota de Débito'],
          hint:'Obrigatório por lei para este tipo de documento (Lei n.º 32/2007 — IVA).' },
      ]},
      { id:'enderecoEmitente', label:'Endereço / Contacto do Emitente (opcional)', type:'text',
        ph:'Rua da Sé, n.º 123, Maputo · Tel: 84 211 2233' },
      { row:true, items:[
        { id:'cliente',    label:'Nome do Cliente', type:'text', required:true, ph:'Maria Silva' },
        { id:'biCliente',  label:'BI / NUIT do Cliente (opcional)', type:'text', ph:'110100123456A ou 400987654', maxlength:'13' },
      ]},
      // NOVO (correcção 2.6 — "sistema de cálculos automáticos", sugestão 2
      // da auditoria): a "Descrição" em texto livre (uma linha por item, sem
      // qtd/preço estruturados) foi substituída por uma tabela de itens real
      // — cada linha tem descrição, quantidade e preço unitário; o subtotal
      // de cada linha e o "Valor Total" abaixo calculam-se sozinhos. Ver
      // Views.js → _field()/bindItemTables()/_itemTableRecalc().
      { id:'itens', label:'Itens / Serviços', type:'itemtable', syncTotalTo:'valor',
        hint:'Adicione uma linha por artigo ou serviço — o subtotal de cada linha e o "Valor Total" abaixo calculam-se automaticamente.' },
      { id:'obs', label:'Observações adicionais (opcional)', type:'textarea',
        ph:'Ex: garantia de 30 dias, entrega inclui instalação, desconto já aplicado…' },
      { row:true, items:[
        // 'valor' deixou de ser digitado à mão — é a soma automática dos
        // subtotais da tabela de itens acima (campo só-de-leitura).
        { id:'valor',    label:'Valor Total (MZN)', type:'number', required:true, readonly:true, ph:'Calculado automaticamente pelos itens acima' },
        // NOVO (correcção 2.5): 'Forma de Pagamento' deixou de ser sempre
        // obrigatória — uma Nota de Encomenda regista um pedido, ainda sem
        // pagamento associado, por isso usa o mesmo mecanismo requiredIf
        // já usado no NUIT (reutilização pedida na auditoria).
        { id:'pagamento',label:'Forma de Pagamento', type:'select',
          opts:['M-Pesa','Dinheiro','Transferência Bancária','E-mola','Mkesh','A definir'],
          requiredIf:{ field:'tipoDoc', in:['Recibo Simples','Factura','Factura Proforma','Factura-Recibo','Nota de Débito'] },
          hint:'Não aplicável à Nota de Encomenda (é um pedido, ainda sem pagamento).' },
      ]},
      { row:true, items:[
        // NOVO (correcção 2.7): "Aplicar IVA" fica escondido para Factura
        // Proforma e Nota de Encomenda — nestes dois tipos o documento
        // gerado já ignora esta escolha (não têm valor fiscal), por isso
        // perguntá-la só confundia o utilizador.
        { id:'iva', label:'Aplicar IVA (16%)?', type:'select', required:true,
          opts:['Não (isento / regime simplificado)','Sim (regime normal — 16%)'],
          conditional:'tipoDoc', condValue:['Recibo Simples','Factura','Factura-Recibo','Nota de Débito'],
          hint:'Micro/pequenos negócios no regime simplificado geralmente não cobram IVA (Lei n.º 5/2009). Não aplicável a Proforma nem Nota de Encomenda.' },
        // NOVO (correcção 2.5): só faz sentido pedir a conta/referência de
        // pagamento quando a forma de pagamento escolhida realmente usa
        // uma conta (M-Pesa, banco, E-mola, Mkesh) — fica escondido para
        // 'Dinheiro' e 'A definir'. Mesmo mecanismo 'conditional' já usado
        // em 'validadeProforma', agora disparado por 'pagamento' em vez de
        // 'tipoDoc' — prova de que o padrão é mesmo reutilizável por
        // qualquer campo-gatilho, não só pelo tipo de documento.
        { id:'contaBancaria', label:'Conta / Referência de Pagamento (opcional)', type:'text', ph:'84 XXX XXXX ou NIB',
          conditional:'pagamento', condValue:['M-Pesa','Transferência Bancária','E-mola','Mkesh'] },
      ]},
      { id:'validadeProforma', label:'Validade da Proforma (dias)', type:'number', val:'30', min:'1', max:'180',
        conditional:'tipoDoc', condValue:['Factura Proforma'],
        hint:'Período durante o qual os preços apresentados na proforma se mantêm válidos.' },
      { row:true, items:[
        { id:'numDoc', label:'N.º do Documento (opcional)', type:'text', ph:'Ex: 001/2026 — em branco gera numeração automática' },
        { id:'local',  label:'Local e Data', type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
      ]},
    ],
    buildWA: null,
  },

  procuracao: {
    icon:'📜', bg:'#E0E7FF', title:'Procuração / Mandato',
    sub:'Documento para representar outra pessoa em repartições, bancos ou negócios', hasAI:true,
    category:'juridico', popularity:7,
    fields:[
      { id:'tipoProc', label:'Tipo de Procuração', type:'select', required:true,
        opts:['Geral (todos os actos)','Especial (acto específico)','Judicial','Bancária','Venda de Imóvel','Herança','Matrícula Escolar'] },
      { row:true, items:[
        { id:'outorgante',     label:'Nome do Outorgante (quem dá poder)',    type:'text', required:true, ph:'Carlos Mabunda' },
        { id:'biOutorgante',   label:'BI do Outorgante',                      type:'text', required:true, ph:'110100123456A' },
      ]},
      { id:'moradaOutorgante', label:'Morada completa do Outorgante', type:'textarea', required:true, ph:'Bairro Sommerschield, Rua das Acácias n.º 12, Maputo' },
      { row:true, items:[
        { id:'procurador',     label:'Nome do Procurador (quem recebe poder)', type:'text', required:true, ph:'Ana Rafael' },
        { id:'biProcurador',   label:'BI do Procurador',                       type:'text', required:true, ph:'110100654321B' },
      ]},
      { id:'moradaProcurador', label:'Morada completa do Procurador', type:'textarea', required:true, ph:'Bairro Maxaquene, Avenida de Angola n.º 45, Maputo' },
      { id:'tipoDocIdent',     label:'Tipo de documento de identidade', type:'select', required:true,
        opts:['Bilhete de Identidade (BI)','Passaporte','DIRE (Residência)','Outro'] },
      { id:'acto',     label:'Acto / Finalidade Específica', type:'textarea', required:true, ph:'Retirar documentos do INSS, levantar dinheiro no BCI...' },
      { id:'subMandato', label:'Pode substabelecer (nomear sub-procurador)?', type:'select', required:true,
        opts:['Não (poderes intransmissíveis)','Sim, no todo','Sim, em parte'] },
      { id:'validade', label:'Validade', type:'select', required:true,
        opts:['30 dias','90 dias','6 meses','1 ano','Até revogação','Indeterminada'] },
      { id:'local',    label:'Local e Data', type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  orcamento: {
    icon:'🏗️', bg:'#F5F3FF', title:'Orçamento de Obra',
    sub:'Orçamento detalhado com todos os custos', hasAI:true,
    category:'negocio', popularity:8,
    fields:[
      { id:'tipoObra',   label:'Tipo de Obra', type:'text', required:true, ph:'Casa T2, Vedação 50m, Remodelação de sala…' },
      { row:true, items:[
        { id:'area',    label:'Área (m²)', type:'number', ph:'120', min:'1' },
        { id:'nPisos',  label:'N.º de Pisos', type:'select', opts:['Térreo (R/C)','2 pisos','3 pisos','Outro'] },
      ]},
      { row:true, items:[
        { id:'local',     label:'Localização', type:'text', required:true, ph:'Maputo, Matola…' },
        { id:'acabamento',label:'Tipo de Acabamento', type:'select', opts:['Simples / Económico','Médio / Padrão','Alto Padrão'] },
      ]},
      { id:'fase',       label:'Fase do Projecto', type:'select', required:true,
        opts:['Construção do zero','Apenas estrutura e alvenaria','Apenas acabamentos','Instalações hidráulicas/eléctricas','Renovação parcial'] },
      { id:'cobertura',  label:'Tipo de Cobertura', type:'select',
        opts:['Laje de betão','Zinco / Chapa metálica','Telha cerâmica','Não aplicável / já existe'] },
      { id:'infraestrutura', label:'Infraestrutura disponível', type:'select',
        opts:['Água e electricidade ligadas','Só electricidade','Só água','Nenhuma — a instalar','Não aplicável'] },
      { id:'prazo',      label:'Prazo desejado (dias)', type:'number', val:'60', min:'7' },
      { id:'extra',      label:'Detalhes adicionais', type:'textarea', ph:'Número de quartos, casa de banho, alpendre, portão, etc.' },
    ],
    buildWA: null,
  },

  residencia: {
    icon:'🏡', bg:'#D1FAE5', title:'Declaração de Residência',
    sub:'Modelo pronto para junta de bairro ou chefe de quarteirão', hasAI:true,
    category:'juridico', popularity:9,
    fields:[
      { id:'requerente',  label:'Nome do Requerente', type:'text', required:true, ph:'João Machel' },
      { id:'bi',          label:'Número do BI',        type:'text', required:true, ph:'110100123456A' },
      { id:'bairro',      label:'Nome do Bairro',       type:'text', required:true, ph:'Bairro Polana Caniço' },
      { id:'rua',         label:'Rua / Avenida',        type:'text', required:true, ph:'Rua das Acácias, n.º 12' },
      { id:'cidade',      label:'Cidade / Distrito',    type:'text', required:true, ph:'Maputo' },
      { id:'tempoCasas',  label:'Há quanto tempo reside no local', type:'select', required:true,
        opts:['Menos de 1 ano','1 a 2 anos','3 a 5 anos','Mais de 5 anos','Mais de 10 anos'] },
      { id:'finalidade',  label:'Finalidade da Declaração', type:'text', required:true, ph:'Processo de crédito bancário / matrícula escolar…' },
      { id:'chefeBairro', label:'Nome do Chefe de Quarteirão / Secretário', type:'text', required:true, ph:'Sr. Manuel Tembe' },
      { id:'local',       label:'Local e Data', type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  prestacao: {
    icon:'🤝', bg:'#FCE7F3', title:'Contrato de Prestação de Serviços',
    sub:'Para freelancers, técnicos e pequenos prestadores', hasAI:true,
    category:'negocio', popularity:10,
    fields:[
      { row:true, items:[
        { id:'prestador', label:'Nome do Prestador', type:'text', required:true, ph:'Técnico Pedro Cossa' },
        { id:'biPrest',   label:'BI do Prestador',   type:'text', required:true, ph:'110100111222A' },
      ]},
      { row:true, items:[
        { id:'cliente',   label:'Nome do Cliente',   type:'text', required:true, ph:'Empresa ABC Lda' },
        { id:'biCliente', label:'BI / NUIT do Cliente', type:'text', required:true, ph:'400987654321' },
      ]},
      { id:'servico',    label:'Descrição dos Serviços a Prestar', type:'textarea', required:true,
        ph:'Manutenção de computadores e impressoras no escritório…' },
      { row:true, items:[
        { id:'valor',    label:'Valor Total (MZN)', type:'number', required:true, ph:'5000', min:'1' },
        { id:'pagamento',label:'Forma de Pagamento', type:'select', required:true,
          opts:['M-Pesa','Transferência Bancária','Dinheiro','A acordar'] },
      ]},
      { row:true, items:[
        { id:'inicio', label:'Data de Início',    type:'text', required:true, ph:'01/06/2026' },
        { id:'prazo',  label:'Prazo / Duração',   type:'text', required:true, ph:'30 dias' },
      ]},
      { id:'penalidades', label:'Penalidades por incumprimento (opcional)', type:'textarea',
        ph:'Ex: multa de 10% do valor por cada semana de atraso…' },
      { id:'local',       label:'Local e Data', type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  recomendacao: {
    icon:'✍️', bg:'#EDE9FE', title:'Carta de Recomendação',
    sub:'Para emprego, bolsas de estudo ou candidaturas', hasAI:true,
    category:'pessoal', popularity:11,
    fields:[
      { id:'candidato',     label:'Nome do Candidato',          type:'text',     required:true, ph:'Ana Sofia Machava' },
      { id:'recomendador',  label:'Nome de quem recomenda',     type:'text',     required:true, ph:'Dr. Carlos Moreira' },
      { id:'cargoRec',      label:'Cargo / Função (recomendador)', type:'text',  required:true, ph:'Director de RH, BCI' },
      { id:'relacao',       label:'Relação com o candidato',    type:'select',   required:true,
        opts:['Supervisor / Chefe directo','Professor / Orientador','Colega de trabalho','Parceiro de negócio','Outro'] },
      { id:'periodo',       label:'Período de convivência',     type:'text',     required:true, ph:'2 anos (2023–2025)' },
      { id:'pontos',        label:'Qualidades a destacar',      type:'textarea', required:true,
        ph:'Responsabilidade, liderança, pontualidade, capacidade técnica…' },
      { id:'finalidade',    label:'Finalidade da carta',        type:'text',     required:true, ph:'Candidatura a bolsa de estudos na UEM' },
      { id:'contactoRec',   label:'Contacto do recomendador (opcional)', type:'tel', ph:'84 XXX XXXX', pattern:'8[2-7][0-9]{7}', maxlength:'9', inputmode:'tel' },
      { id:'local',         label:'Local e Data', type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  planonegocio: {
    icon:'📊', bg:'#DBEAFE', title:'Plano de Negócios',
    sub:'Para candidaturas a financiamento, bancos ou incubadoras', hasAI:true,
    category:'negocio', popularity:12,
    fields:[
      { id:'nomeNegocio',  label:'Nome do Negócio / Empresa',    type:'text',     required:true, ph:'Moz Tech Solutions Lda' },
      { id:'setor',        label:'Sector de Actividade',          type:'select',   required:true,
        opts:['Comércio','Serviços','Tecnologia','Agricultura','Construção','Saúde','Educação','Turismo','Indústria','Outro'] },
      { id:'descricao',    label:'Descrição do Negócio',          type:'textarea', required:true,
        ph:'O que faz, que problema resolve, para quem…' },
      { id:'mercadoAlvo',  label:'Mercado-Alvo / Clientes',       type:'textarea', required:true,
        ph:'Jovens universitários, PMEs de Maputo, governo…' },
      { id:'concorrentes', label:'Principais Concorrentes',       type:'textarea', ph:'Quem já faz o mesmo, em que é diferente…' },
      { id:'modelo',       label:'Como ganha dinheiro (modelo de receita)', type:'textarea', required:true,
        ph:'Venda directa, subscrição mensal, comissão…' },
      { row:true, items:[
        { id:'investimento', label:'Investimento Inicial (MZN)', type:'number', required:true, ph:'500000', min:'0' },
        { id:'previsaoRec',  label:'Previsão de Receita Mensal (MZN)', type:'number', ph:'80000', min:'0' },
      ]},
      { id:'equipa',       label:'Equipa / Promotores',           type:'textarea', ph:'Nomes, funções e experiência…' },
      { id:'finalidade',   label:'Finalidade do Plano',           type:'select', required:true,
        opts:['Candidatura a crédito bancário','Concurso de empreendedorismo','Incubadora / aceleradora','Uso interno','Outro'] },
    ],
    buildWA: null,
  },

  licenca: {
    icon:'📋', bg:'#FEF9C3', title:'Pedido de Licença',
    sub:'Para abertura de negócio, eventos ou autorizações municipais', hasAI:true,
    category:'negocio', popularity:13,
    fields:[
      { id:'tipoLicenca', label:'Tipo de Licença', type:'select', required:true,
        opts:['Licença Comercial (Alvará)','Licença de Construção','Autorização de Evento','Licença de Transporte','Licença Ambiental','Outra'] },
      { id:'requerente', label:'Nome do Requerente', type:'text', required:true, ph:'Empresa Construtora X Lda' },
      { row:true, items:[
        { id:'nuit',     label:'NUIT',     type:'text', required:true, ph:'400987654', pattern:'[0-9]{9}', maxlength:'9', inputmode:'numeric' },
        { id:'contacto', label:'Telefone', type:'tel',  required:true, ph:'84 XXX XXXX', pattern:'8[2-7][0-9]{7}', maxlength:'9', inputmode:'tel' },
      ]},
      { id:'entidade',       label:'Entidade Destinatária',    type:'text',     required:true, ph:'Câmara Municipal da Cidade de Maputo' },
      { id:'objecto',        label:'Objecto do Pedido',        type:'textarea', required:true, ph:'Abertura de restaurante no bairro Polana Caniço...' },
      { id:'tipoEstabelec',  label:'Tipo de estabelecimento',  type:'select',   required:true,
        opts:['Permanente (estrutura fixa)','Temporário (evento / obra)','Ambulante / Móvel'] },
      { id:'areaM2',         label:'Área do estabelecimento (m²)', type:'number', ph:'80', min:'1' },
      { id:'horario',        label:'Horário de funcionamento',  type:'text',     ph:'Seg–Sex 08h–18h, Sáb 08h–13h' },
      { id:'nPostosTrabalho',label:'N.º de postos de trabalho previstos', type:'number', ph:'5', min:'1' },
      { id:'local',          label:'Local Exacto',              type:'textarea', required:true, ph:'Avenida 24 de Julho, edifício Y, loja n.º 3' },
      { id:'documentos',     label:'Documentos Anexos',         type:'textarea', ph:'Certidão comercial, mapa de localização, parecer técnico...' },
    ],
    buildWA: null,
  },

  acta: {
    icon:'📑', bg:'#E5E7EB', title:'Acta de Reunião',
    sub:'Para associações, cooperativas, bairros e organizações', hasAI:true,
    category:'juridico', popularity:14,
    fields:[
      { id:'organizacao',  label:'Nome da Organização', type:'text', required:true, ph:'Associação de Moradores do Bairro X' },
      { id:'tipoReuniao',  label:'Tipo de Reunião', type:'select', required:true,
        opts:['Assembleia Geral','Reunião Ordinária','Reunião Extraordinária','Conselho Directivo','Comissão de Trabalho'] },
      { row:true, items:[
        { id:'data', label:'Data', type:'text', required:true, ph:'6 de Maio de 2026' },
        { id:'hora', label:'Hora', type:'text', required:true, ph:'14:00' },
      ]},
      { id:'local',         label:'Local',               type:'text',     required:true, ph:'Sede da Associação, Rua dos Combatentes' },
      { row:true, items:[
        { id:'presidente',  label:'Presidente da Mesa', type:'text', required:true, ph:'José Machel' },
        { id:'secretario',  label:'Secretário',          type:'text', required:true, ph:'Maria da Conceição' },
      ]},
      { row:true, items:[
        { id:'totalMembros', label:'Total de membros da organização', type:'number', required:true, ph:'20', min:'1' },
        { id:'quorumMinimo', label:'Quórum mínimo estatutário (%)',   type:'number', required:true, ph:'50', min:'1', max:'100' },
      ]},
      { id:'presentes',     label:'Membros Presentes',   type:'textarea', required:true, ph:'Liste os nomes dos presentes...' },
      { id:'pauta',         label:'Pontos da Pauta',     type:'textarea', required:true, ph:'1. Aprovação da acta anterior\n2. Relatório financeiro\n3. Novo projecto...' },
      { id:'deliberacoes',  label:'Deliberações / Decisões', type:'textarea', required:true, ph:'O que foi decidido em cada ponto...' },
    ],
    buildWA: null,
  },

  impressao: {
    icon:'🖨️', bg:'#FDF2F8', title:'Impressão de Documentos',
    sub:'Pedido de impressão — entrega coordenada via WhatsApp', hasAI:false,
    category:'servicos', popularity:16,
    fields:[
      { id:'nome',   label:'O seu Nome', type:'text', required:true, ph:'Maria Nhantumbo' },
      { id:'tipo',   label:'Tipo de Impressão', type:'select', required:true,
        opts:['Preto e Branco','Colorido','Frente e Verso P&B','Frente e Verso Colorido'] },
      { row:true, items:[
        { id:'paginas', label:'N.º de Páginas', type:'number', ph:'10', min:'1' },
        { id:'copias',  label:'N.º de Cópias',  type:'number', val:'1',  min:'1' },
      ]},
      { id:'papel', label:'Tamanho do Papel', type:'select', opts:['A4 (padrão)','A3','A5','Carta'] },
      { id:'obs',   label:'Observações', type:'text', ph:'Ex: urgente, encadernar, plastificar…' },
    ],
    buildWA(d) {
      return `🖨️ *PEDIDO DE IMPRESSÃO – MzDocs Pro*\n\n👤 Nome: ${d.nome}\n🎨 Tipo: ${d.tipo}\n📄 Páginas: ${d.paginas||'?'} | Cópias: ${d.copias||'1'}\n📐 Papel: ${d.papel}\n📌 Obs: ${d.obs||'Nenhuma'}\n\n✅ _Envio o ficheiro nesta conversa. Obrigado!_`;
    },
  },

  foto: {
    icon:'📷', bg:'#ECFEFF', title:'Foto para Documentos',
    sub:'Fotos com formato correcto para documentos oficiais', hasAI:false,
    category:'servicos', popularity:17,
    fields:[
      { id:'nome',      label:'O seu Nome', type:'text', required:true, ph:'Pedro Cossa' },
      { id:'finalidade',label:'Finalidade', type:'select', required:true,
        opts:['BI / Cartão de Identidade','Passaporte','Visto','Currículo (CV)','Matrícula Escolar','Outro'] },
      { row:true, items:[
        { id:'qtd',   label:'Quantidade', type:'number', val:'6', min:'1' },
        { id:'fundo', label:'Cor do Fundo', type:'select', opts:['Branco','Azul claro','Cinzento'] },
      ]},
    ],
    buildWA(d) {
      return `📷 *FOTO PARA DOCUMENTOS – MzDocs Pro*\n\n👤 Nome: ${d.nome}\n🎯 Finalidade: ${d.finalidade}\n🖼 Quantidade: ${d.qtd||'6'} fotos\n🎨 Fundo: ${d.fundo}\n\n✅ _Envio a minha foto nesta conversa._`;
    },
  },

  conversao: {
    icon:'🔄', bg:'#FEF2F2', title:'Conversão de Ficheiros',
    sub:'Converta os seus ficheiros para o formato que precisar — rápido e fácil',
    hasAI:true,       // consome 1 crédito
    isConverter:true, // flag especial: substitui o modal por UI de upload
    category:'servicos', popularity:15,
    fields:[], buildWA: null,
  },
};
