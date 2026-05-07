// services/ServiceDefinitions.js — Definição de todos os serviços
export const SERVICES = {

  trabalho: {
    icon:'📚', bg:'#EFF6FF', title:'Trabalho Escolar',
    sub:'Texto académico completo com estrutura profissional', hasAI:true,
    fields:[
      { id:'tema',       label:'Tema / Título', type:'text', required:true, ph:'Ex: O Papel da Mulher na Independência de Moçambique' },
      { id:'nivel',      label:'Nível de Ensino', type:'select', required:true,
        opts:['Ensino Primário','Ensino Secundário (1º Ciclo)','Ensino Secundário (2º Ciclo)','Pré-Universitário','Licenciatura','Mestrado/Doutoramento'] },
      { id:'disciplina', label:'Disciplina', type:'text', required:true, ph:'Ex: História, Português, Biologia…' },
      { id:'paginas',    label:'Páginas pretendidas', type:'number', val:'5', min:'2', max:'30' },
      { id:'requisitos', label:'Instruções do professor', type:'textarea', ph:'Cole o enunciado ou descreva o que o professor pediu…' },
    ],
    buildWA: null,
  },

  cv: {
    icon:'📋', bg:'#ECFDF5', title:'Currículo (CV)',
    sub:'CV profissional formatado para destacar o seu perfil', hasAI:true,
    fields:[
      { id:'nome',       label:'Nome Completo', type:'text', required:true, ph:'Ana Sofia Machava' },
      { id:'cargo',      label:'Cargo / Vaga pretendida', type:'text', required:true, ph:'Assistente Administrativo…' },
      { row:true, items:[
        { id:'nascimento', label:'Data de Nascimento', type:'text', ph:'15/03/1998' },
        { id:'contacto',   label:'Telefone', type:'tel', ph:'84 XXX XXXX' },
      ]},
      { id:'email',      label:'Email (opcional)', type:'email', ph:'email@exemplo.com' },
      { id:'formacao',   label:'Formação Académica', type:'textarea', required:true, ph:'Licenciatura em Gestão – UEM, 2022' },
      { id:'experiencia',label:'Experiência Profissional', type:'textarea', ph:'Descreva o seu histórico profissional…' },
      { id:'habilidades',label:'Habilidades / Competências', type:'textarea', ph:'Excel, inglês, AutoCAD…' },
      { id:'objectivo',  label:'Objectivo Profissional', type:'text', ph:'Área de finanças empresariais' },
    ],
    buildWA: null,
  },

  carta: {
    icon:'✉️', bg:'#FFFBEB', title:'Carta Formal',
    sub:'Carta profissional bem estruturada', hasAI:true,
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
    ],
    buildWA: null,
  },

  orcamento: {
    icon:'🏗️', bg:'#F5F3FF', title:'Orçamento de Obra',
    sub:'Orçamento detalhado com todos os custos', hasAI:true,
    fields:[
      { id:'tipoObra',   label:'Tipo de Obra', type:'text', required:true, ph:'Casa T2, Vedação 50m, Remodelação de sala…' },
      { row:true, items:[
        { id:'area',  label:'Área (m²)', type:'number', ph:'120', min:'1' },
        { id:'local', label:'Localização', type:'text', required:true, ph:'Maputo, Matola…' },
      ]},
      { id:'acabamento', label:'Tipo de Acabamento', type:'select',
        opts:['Simples / Económico','Médio / Padrão','Alto Padrão'] },
      { id:'fase',       label:'Fase do Projecto', type:'select',
        opts:['Construção do zero','Apenas estrutura e alvenaria','Apenas acabamentos','Instalações hidráulicas/eléctricas','Renovação parcial'] },
      { id:'prazo',      label:'Prazo desejado (dias)', type:'number', val:'60', min:'7' },
      { id:'extra',      label:'Detalhes adicionais', type:'textarea', ph:'Outras informações que queira incluir…' },
    ],
    buildWA: null,
  },


  arrendamento: {
    icon:'🏠', bg:'#FEF3C7', title:'Contrato de Arrendamento',
    sub:'Contrato legal para aluguer de casa ou loja conforme lei moçambicana', hasAI:true,
    fields:[
      { id:'tipoImovel', label:'Tipo de Imóvel', type:'select', required:true,
        opts:['Casa Residencial','Apartamento','Loja Comercial','Escritório','Terreno'] },
      { row:true, items:[
        { id:'proprietario', label:'Nome do Proprietário', type:'text', required:true, ph:'António Matola' },
        { id:'locatario',    label:'Nome do Locatário',    type:'text', required:true, ph:'Maria Tembe' },
      ]},
      { row:true, items:[
        { id:'local', label:'Localização do Imóvel',  type:'text',   required:true, ph:'Bairro Polana Caniço, Maputo' },
        { id:'valor', label:'Valor Mensal (MZN)',      type:'number', required:true, ph:'15000', min:'1' },
      ]},
      { id:'duracao',   label:'Duração do Contrato', type:'select', required:true,
        opts:['6 meses','12 meses','24 meses','36 meses','Indeterminado'] },
      { id:'caucao',    label:'Caução / Depósito',    type:'text', required:true, ph:'2 meses de renda adiantada' },
      { id:'condicoes', label:'Condições Especiais',  type:'textarea', ph:'Quem paga água e luz? Animais permitidos? Reformas?' },
    ],
    buildWA: null,
  },

  procuracao: {
    icon:'📜', bg:'#E0E7FF', title:'Procuração / Mandato',
    sub:'Documento para representar outra pessoa em repartições, bancos ou negócios', hasAI:true,
    fields:[
      { id:'tipoProc', label:'Tipo de Procuração', type:'select', required:true,
        opts:['Geral (todos os actos)','Especial (acto específico)','Judicial','Bancária','Venda de Imóvel','Herança','Matrícula Escolar'] },
      { row:true, items:[
        { id:'outorgante',   label:'Nome do Outorgante (quem dá poder)',    type:'text', required:true, ph:'Carlos Mabunda' },
        { id:'biOutorgante', label:'BI do Outorgante',                      type:'text', required:true, ph:'110100123456A' },
      ]},
      { row:true, items:[
        { id:'procurador',   label:'Nome do Procurador (quem recebe poder)', type:'text', required:true, ph:'Ana Rafael' },
        { id:'biProcurador', label:'BI do Procurador',                       type:'text', required:true, ph:'110100654321B' },
      ]},
      { id:'acto',     label:'Acto / Finalidade Específica', type:'textarea', required:true, ph:'Retirar documentos do INSS, levantar dinheiro no BCI...' },
      { id:'validade', label:'Validade', type:'select', required:true,
        opts:['30 dias','90 dias','6 meses','1 ano','Até revogação','Indeterminada'] },
      { id:'local',    label:'Local e Data', type:'text', required:true, ph:'Maputo, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  requerimento: {
    icon:'📄', bg:'#DBEAFE', title:'Requerimento Oficial',
    sub:'Pedidos formais para repartições, escolas, hospitais e serviços públicos', hasAI:true,
    fields:[
      { id:'entidade', label:'Entidade Destinatária', type:'select', required:true,
        opts:['Conservatória dos Registos','Direcção Provincial de Educação','Hospital Provincial','INSS','Direcção de Migração','Câmara Municipal','Repartição de Finanças','Outra'] },
      { id:'assunto',    label:'Assunto / Pedido',     type:'text',     required:true, ph:'Pedido de certidão de nascimento' },
      { id:'remetente',  label:'O seu Nome Completo',  type:'text',     required:true, ph:'Josina Machel' },
      { row:true, items:[
        { id:'bi',       label:'N.º do BI',  type:'text', required:true, ph:'110100789012C' },
        { id:'contacto', label:'Telefone',   type:'tel',  required:true, ph:'84 XXX XXXX' },
      ]},
      { id:'endereco',    label:'Endereço Completo',        type:'textarea', required:true, ph:'Bairro Mafalala, Avenida 25 de Setembro, Casa n.º 45, Maputo' },
      { id:'fundamento',  label:'Fundamento / Justificação',type:'textarea', required:true, ph:'Explique por que precisa deste documento/serviço...' },
      { id:'anexos',      label:'Documentos Anexos',        type:'textarea', ph:'BI, certidão anterior, comprovativo de residência...' },
    ],
    buildWA: null,
  },

  residencia: {
    icon:'🏡', bg:'#D1FAE5', title:'Declaração de Residência',
    sub:'Modelo pronto para junta de bairro ou chefe de quarteirão', hasAI:true,
    fields:[
      { id:'declarante',   label:'Nome do Declarante', type:'text', required:true, ph:'Mateus Chissano' },
      { row:true, items:[
        { id:'bi',          label:'N.º do BI',          type:'text', required:true, ph:'110100345678D' },
        { id:'nascimento',  label:'Data de Nascimento',  type:'text', required:true, ph:'10/05/1990' },
      ]},
      { id:'naturalidade', label:'Naturalidade',                type:'text',     required:true, ph:'Inhambane' },
      { id:'endereco',     label:'Endereço Actual Completo',    type:'textarea', required:true, ph:'Bairro Urbanização, Rua dos Heróis, Casa n.º 23, Matola' },
      { id:'tempo',        label:'Tempo de Residência',         type:'select',   required:true,
        opts:['Menos de 1 ano','1-3 anos','3-5 anos','Mais de 5 anos'] },
      { id:'finalidade',   label:'Finalidade da Declaração',    type:'select',   required:true,
        opts:['Abertura de conta bancária','Candidatura a emprego','Matrícula escolar','Processo de passaporte','Contrato de serviço','Outro'] },
      { id:'chefe',        label:'Nome do Chefe de Quarteirão / Presidente', type:'text', ph:'Sebastião Mabunda' },
    ],
    buildWA: null,
  },

  prestacao: {
    icon:'🤝', bg:'#FCE7F3', title:'Contrato de Prestação de Serviços',
    sub:'Para freelancers, técnicos e pequenos prestadores', hasAI:true,
    fields:[
      { id:'servico', label:'Tipo de Serviço', type:'text', required:true, ph:'Instalação de painéis solares, consultoria contábil...' },
      { row:true, items:[
        { id:'prestador',     label:'Nome do Prestador',  type:'text', required:true, ph:'Empresa Solar Moçambique Lda' },
        { id:'nuitPrestador', label:'NUIT do Prestador',  type:'text', ph:'400123456' },
      ]},
      { row:true, items:[
        { id:'cliente',   label:'Nome do Cliente', type:'text', required:true, ph:'Manuel Guebuza Jr.' },
        { id:'biCliente', label:'BI do Cliente',   type:'text', ph:'110100987654E' },
      ]},
      { row:true, items:[
        { id:'valorTotal', label:'Valor Total (MZN)',         type:'number', required:true, ph:'45000', min:'1' },
        { id:'prazo',      label:'Prazo de Execução (dias)',  type:'number', required:true, ph:'30',    min:'1' },
      ]},
      { id:'pagamento',   label:'Condições de Pagamento', type:'select', required:true,
        opts:['50% adiantado + 50% na entrega','30% + 40% + 30%','100% adiantado','Pagamento por etapas','A combinar'] },
      { id:'descricao',   label:'Descrição Detalhada do Serviço', type:'textarea', required:true, ph:'O que será feito, materiais incluídos, garantia...' },
      { id:'penalidades', label:'Penalidades por Atraso',          type:'text', ph:'1% do valor por dia de atraso' },
    ],
    buildWA: null,
  },

  recibo: {
    icon:'🧾', bg:'#FFEDD5', title:'Recibo / Factura',
    sub:'Documento de venda para pequenos negócios e prestadores', hasAI:true,
    fields:[
      { id:'tipoDoc', label:'Tipo de Documento', type:'select', required:true,
        opts:['Recibo Simples','Factura','Factura Proforma','Nota de Débito'] },
      { row:true, items:[
        { id:'emitente',     label:'Nome do Vendedor / Empresa', type:'text', required:true, ph:'Loja Tudo Bom' },
        { id:'nuitEmitente', label:'NUIT',                       type:'text', ph:'400789123' },
      ]},
      { row:true, items:[
        { id:'cliente',   label:'Nome do Cliente', type:'text', required:true, ph:'Fernando Nhaca' },
        { id:'biCliente', label:'BI do Cliente',   type:'text', ph:'110100456789F' },
      ]},
      { id:'descricao', label:'Descrição dos Bens / Serviços', type:'textarea', required:true, ph:'2 sacos de cimento, 50 tijolos, mão-de-obra de 2 dias...' },
      { row:true, items:[
        { id:'valor', label:'Valor Total (MZN)', type:'number', required:true, ph:'12500', min:'1' },
        { id:'iva',   label:'IVA (16%)?',        type:'select', opts:['Sim','Não (exempto)','Não (regime simplificado)'] },
      ]},
      { id:'pagamento', label:'Forma de Pagamento', type:'select', required:true,
        opts:['Dinheiro','M-Pesa','Transferência Bancária','Depósito','A prazo'] },
      { id:'local',     label:'Local e Data', type:'text', required:true, ph:'Nampula, 6 de Maio de 2026' },
    ],
    buildWA: null,
  },

  recomendacao: {
    icon:'✍️', bg:'#EDE9FE', title:'Carta de Recomendação',
    sub:'Para emprego, bolsas de estudo ou candidaturas', hasAI:true,
    fields:[
      { id:'tipoRec', label:'Tipo', type:'select', required:true,
        opts:['Recomendação Profissional','Recomendação Académica','Recomendação Pessoal','Carta de Apresentação'] },
      { row:true, items:[
        { id:'recomendador', label:'Nome de quem recomenda',        type:'text', required:true, ph:'Dr. Paulo Zacarias' },
        { id:'cargoRec',     label:'Cargo / Função do Recomendador',type:'text', required:true, ph:'Director de Recursos Humanos' },
      ]},
      { id:'entidadeRec', label:'Entidade do Recomendador', type:'text', required:true, ph:'Banco Standard Bank Moçambique' },
      { row:true, items:[
        { id:'recomendado', label:'Nome de quem é recomendado', type:'text', required:true, ph:'Lucia Machel' },
        { id:'cargoRecm',   label:'Cargo / Função pretendida',  type:'text', required:true, ph:'Analista de Crédito' },
      ]},
      { id:'relacao',      label:'Relação entre ambos',    type:'textarea', required:true, ph:'Trabalhou sob minha supervisão durante 2 anos como...' },
      { id:'qualidades',   label:'Qualidades a destacar',  type:'textarea', required:true, ph:'Pontualidade, liderança, conhecimento técnico...' },
      { id:'destinatario', label:'Destinatário (se souber)',type:'text', ph:'Comissão de Selecção da Vaga X' },
    ],
    buildWA: null,
  },

  planonegocio: {
    icon:'📊', bg:'#DBEAFE', title:'Plano de Negócios',
    sub:'Para candidaturas a financiamento, bancos ou incubadoras', hasAI:true, cost:2,
    fields:[
      { id:'nomeNegocio', label:'Nome do Negócio', type:'text', required:true, ph:'Mazaia Fresh' },
      { id:'sector',      label:'Sector de Actividade', type:'select', required:true,
        opts:['Agricultura','Comércio','Serviços','Tecnologia','Construção','Restauração','Transporte','Outro'] },
      { row:true, items:[
        { id:'proprietario', label:'Nome do Proprietário', type:'text',   required:true, ph:'Amélia Nhangumbe' },
        { id:'local',        label:'Localização',          type:'text',   required:true, ph:'Chokwe, Gaza' },
      ]},
      { id:'descricao',    label:'Descrição do Negócio',                  type:'textarea', required:true, ph:'Venda de produtos hortícolas frescos directo do produtor...' },
      { id:'investimento', label:'Investimento Inicial Necessário (MZN)',  type:'number',   required:true, ph:'50000', min:'1' },
      { id:'clientes',     label:'Público-Alvo / Clientes',               type:'textarea', required:true, ph:'Restaurantes em Maputo, mercados locais, famílias...' },
      { id:'concorrencia', label:'Concorrência e Diferencial',            type:'textarea', ph:'O que o diferencia dos concorrentes...' },
      { id:'retorno',      label:'Prazo de Retorno Esperado',             type:'select',   required:true,
        opts:['6 meses','1 ano','2 anos','3 anos','Indeterminado'] },
    ],
    buildWA: null,
  },

  licenca: {
    icon:'📋', bg:'#FEF9C3', title:'Pedido de Licença',
    sub:'Para abertura de negócio, eventos ou autorizações municipais', hasAI:true,
    fields:[
      { id:'tipoLicenca', label:'Tipo de Licença', type:'select', required:true,
        opts:['Licença Comercial (Alvará)','Licença de Construção','Autorização de Evento','Licença de Transporte','Licença Ambiental','Outra'] },
      { id:'requerente', label:'Nome do Requerente', type:'text', required:true, ph:'Empresa Construtora X Lda' },
      { row:true, items:[
        { id:'nuit',     label:'NUIT',     type:'text', required:true, ph:'400987654' },
        { id:'contacto', label:'Telefone', type:'tel',  required:true, ph:'84 XXX XXXX' },
      ]},
      { id:'entidade',   label:'Entidade Destinatária',  type:'text',     required:true, ph:'Câmara Municipal da Cidade de Maputo' },
      { id:'objecto',    label:'Objecto do Pedido',       type:'textarea', required:true, ph:'Abertura de restaurante no bairro Polana Caniço...' },
      { id:'local',      label:'Local Exacto',            type:'textarea', required:true, ph:'Avenida 24 de Julho, edifício Y, loja n.º 3' },
      { id:'documentos', label:'Documentos Anexos',       type:'textarea', ph:'Certidão comercial, mapa de localização, parecer técnico...' },
    ],
    buildWA: null,
  },

  acta: {
    icon:'📑', bg:'#E5E7EB', title:'Acta de Reunião',
    sub:'Para associações, cooperativas, bairros e organizações', hasAI:true,
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
      { id:'presentes',     label:'Membros Presentes',   type:'textarea', required:true, ph:'Liste os nomes dos presentes...' },
      { id:'pauta',         label:'Pontos da Pauta',     type:'textarea', required:true, ph:'1. Aprovação da acta anterior\n2. Relatório financeiro\n3. Novo projecto...' },
      { id:'deliberacoes',  label:'Deliberações / Decisões', type:'textarea', required:true, ph:'O que foi decidido em cada ponto...' },
    ],
    buildWA: null,
  },

  impressao: {
    icon:'🖨️', bg:'#FDF2F8', title:'Impressão de Documentos',
    sub:'Impressão de qualidade via WhatsApp', hasAI:false,
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
    sub:'Converta os seus ficheiros para o formato que precisar', hasAI:false,
    fields:[
      { id:'nome', label:'O seu Nome', type:'text', required:true, ph:'Fátima Cuna' },
      { id:'conv', label:'Tipo de Conversão', type:'select', required:true,
        opts:['PDF → Word (.docx)','Word → PDF','PDF → Excel','Excel → PDF','Imagem → PDF','PDF → Imagem (JPG)','PowerPoint → PDF'] },
      { row:true, items:[
        { id:'nfich', label:'Nº de Ficheiros', type:'number', val:'1', min:'1' },
        { id:'urg',   label:'Urgência', type:'select', opts:['Normal (até 2h)','Urgente (até 30min) +taxa','Imediato +taxa'] },
      ]},
    ],
    buildWA(d) {
      return `🔄 *CONVERSÃO – MzDocs Pro*\n\n👤 Nome: ${d.nome}\n↔️ Tipo: ${d.conv}\n📂 Ficheiros: ${d.nfich||'1'}\n⚡ Urgência: ${d.urg}\n\n✅ _Envio o ficheiro nesta conversa._`;
    },
  },
};
