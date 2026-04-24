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
