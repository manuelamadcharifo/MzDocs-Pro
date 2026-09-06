-- ============================================================
-- FIX — Pré-visualização realista dos modelos "Oficiais" na galeria
-- (Marketplace / /templates.html)
-- Executar no SQL Editor do Supabase, DEPOIS da migration_v22.
--
-- PROBLEMA: a migration_v22_seed_official_templates.sql só preencheu a
-- coluna template_html para o 1.º modelo (variante "flagship") de cada
-- categoria (ex.: "Trabalho Académico — Académico Clássico"). As outras
-- 4 variantes de estilo de cada categoria (ex.: "Moderno Minimalista",
-- "Padrão UEM", etc.) ficaram com template_html = '' — só têm CSS.
--
-- Consequência visível: em _buildSampleHtml() (templates.html), quando
-- t.template_html está vazio mas t.template_css existe, a pré-visualização
-- cai no texto genérico de SAMPLE_MARKDOWN.generic ("TÍTULO DO DOCUMENTO
-- DE EXEMPLO... Este é um texto de demonstração...") em vez de mostrar o
-- documento real preenchido com dados de exemplo moçambicanos (nome,
-- BI, valores em MZN, etc.) — exactamente o problema visto nos
-- screenshots de "Requerimento — Finanças / AT" e "Trabalho Académico —
-- Moderno Minimalista".
--
-- CORRECÇÃO: cada categoria já tem uma estrutura HTML "canónica" testada
-- (a do 1.º modelo/flagship, com os mesmos placeholders {{CHAVE}} que
-- SampleData.js já preenche com dados realistas). As variantes de estilo
-- dessa mesma categoria usam sempre os MESMOS campos de dados — só mudam
-- tipografia/cores via CSS (selectores de tag: h1, h2, p, etc., que
-- continuam a aplicar-se seja qual for a estrutura HTML usada). Este
-- script copia o template_html canónico de cada categoria para as suas
-- variantes que ainda estão vazias, para que a galeria mostre sempre um
-- documento realista — nunca o texto genérico de exemplo.
--
-- Nota: a categoria 'procuracao' não é afectada — nunca teve
-- template_html (nem no código-fonte local em templates/procuracao.js),
-- e já mostra um documento realista através do caminho alternativo
-- (SAMPLE_MARKDOWN.procuracao + markdownToHtml), que já contém um texto
-- de procuração fictício mas verosímil.
--
-- Seguro para correr múltiplas vezes: cada UPDATE só actua em linhas
-- oficiais (user_id IS NULL) que ainda tenham template_html vazio/nulo.
-- ============================================================


-- ── Trabalho Académico (trabalho) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div class="ta-page">
  <div class="ta-capa">
    <p class="ta-instituicao">{{INSTITUICAO}}</p>
    <p class="ta-curso">{{CURSO}}</p>
    <h1 class="ta-titulo">{{TEMA}}</h1>
    <p class="ta-autor">{{AUTORES}}</p>
    <p class="ta-local-ano">{{LOCAL_ANO}}</p>
  </div>
  <div class="ta-body">
    <section class="ta-section">
      <h2 class="ta-section-title">Introdução</h2>
      <p class="ta-text">{{INTRODUCAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Desenvolvimento</h2>
      <div class="ta-content">{{DESENVOLVIMENTO}}</div>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Conclusão</h2>
      <p class="ta-text">{{CONCLUSAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Referências Bibliográficas</h2>
      <div class="ta-referencias">{{REFERENCIAS}}</div>
    </section>
  </div>
</div>$tpl$
WHERE service_type = 'trabalho'
  AND template_name = 'Trabalho Académico — Moderno Minimalista'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div class="ta-page">
  <div class="ta-capa">
    <p class="ta-instituicao">{{INSTITUICAO}}</p>
    <p class="ta-curso">{{CURSO}}</p>
    <h1 class="ta-titulo">{{TEMA}}</h1>
    <p class="ta-autor">{{AUTORES}}</p>
    <p class="ta-local-ano">{{LOCAL_ANO}}</p>
  </div>
  <div class="ta-body">
    <section class="ta-section">
      <h2 class="ta-section-title">Introdução</h2>
      <p class="ta-text">{{INTRODUCAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Desenvolvimento</h2>
      <div class="ta-content">{{DESENVOLVIMENTO}}</div>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Conclusão</h2>
      <p class="ta-text">{{CONCLUSAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Referências Bibliográficas</h2>
      <div class="ta-referencias">{{REFERENCIAS}}</div>
    </section>
  </div>
</div>$tpl$
WHERE service_type = 'trabalho'
  AND template_name = 'Trabalho Académico — Padrão UEM'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div class="ta-page">
  <div class="ta-capa">
    <p class="ta-instituicao">{{INSTITUICAO}}</p>
    <p class="ta-curso">{{CURSO}}</p>
    <h1 class="ta-titulo">{{TEMA}}</h1>
    <p class="ta-autor">{{AUTORES}}</p>
    <p class="ta-local-ano">{{LOCAL_ANO}}</p>
  </div>
  <div class="ta-body">
    <section class="ta-section">
      <h2 class="ta-section-title">Introdução</h2>
      <p class="ta-text">{{INTRODUCAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Desenvolvimento</h2>
      <div class="ta-content">{{DESENVOLVIMENTO}}</div>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Conclusão</h2>
      <p class="ta-text">{{CONCLUSAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Referências Bibliográficas</h2>
      <div class="ta-referencias">{{REFERENCIAS}}</div>
    </section>
  </div>
</div>$tpl$
WHERE service_type = 'trabalho'
  AND template_name = 'Trabalho Académico — Relatório Técnico'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div class="ta-page">
  <div class="ta-capa">
    <p class="ta-instituicao">{{INSTITUICAO}}</p>
    <p class="ta-curso">{{CURSO}}</p>
    <h1 class="ta-titulo">{{TEMA}}</h1>
    <p class="ta-autor">{{AUTORES}}</p>
    <p class="ta-local-ano">{{LOCAL_ANO}}</p>
  </div>
  <div class="ta-body">
    <section class="ta-section">
      <h2 class="ta-section-title">Introdução</h2>
      <p class="ta-text">{{INTRODUCAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Desenvolvimento</h2>
      <div class="ta-content">{{DESENVOLVIMENTO}}</div>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Conclusão</h2>
      <p class="ta-text">{{CONCLUSAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Referências Bibliográficas</h2>
      <div class="ta-referencias">{{REFERENCIAS}}</div>
    </section>
  </div>
</div>$tpl$
WHERE service_type = 'trabalho'
  AND template_name = 'Trabalho Académico — Ensaio Criativo'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Contrato de Arrendamento (arrendamento) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE ARRENDAMENTO</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{TIPO_IMOVEL}} — {{IMOVEL_LOCAL}}</p>
  <p>Entre os abaixo assinados:</p>
  <p><strong>SENHORIO:</strong> {{SENHORIO_NOME}}, portador do BI n.º {{SENHORIO_BI}}, residente em {{IMOVEL_LOCAL}}.</p>
  <p><strong>INQUILINO:</strong> {{INQUILINO_NOME}}, portador do BI n.º {{INQUILINO_BI}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Senhorio,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{SENHORIO_NOME}}</p></div>
    <div><p>O Inquilino,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{INQUILINO_NOME}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'arrendamento'
  AND template_name = 'Contrato de Arrendamento — Comercial / Loja'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE ARRENDAMENTO</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{TIPO_IMOVEL}} — {{IMOVEL_LOCAL}}</p>
  <p>Entre os abaixo assinados:</p>
  <p><strong>SENHORIO:</strong> {{SENHORIO_NOME}}, portador do BI n.º {{SENHORIO_BI}}, residente em {{IMOVEL_LOCAL}}.</p>
  <p><strong>INQUILINO:</strong> {{INQUILINO_NOME}}, portador do BI n.º {{INQUILINO_BI}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Senhorio,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{SENHORIO_NOME}}</p></div>
    <div><p>O Inquilino,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{INQUILINO_NOME}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'arrendamento'
  AND template_name = 'Contrato de Arrendamento — Simplificado Popular'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE ARRENDAMENTO</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{TIPO_IMOVEL}} — {{IMOVEL_LOCAL}}</p>
  <p>Entre os abaixo assinados:</p>
  <p><strong>SENHORIO:</strong> {{SENHORIO_NOME}}, portador do BI n.º {{SENHORIO_BI}}, residente em {{IMOVEL_LOCAL}}.</p>
  <p><strong>INQUILINO:</strong> {{INQUILINO_NOME}}, portador do BI n.º {{INQUILINO_BI}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Senhorio,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{SENHORIO_NOME}}</p></div>
    <div><p>O Inquilino,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{INQUILINO_NOME}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'arrendamento'
  AND template_name = 'Contrato de Arrendamento — Bilingue PT/EN'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Prestação de Serviços (prestacao) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{SERVICO}}</p>
  <p>Entre:</p>
  <p><strong>PRESTADOR:</strong> {{PRESTADOR}}, NUIT {{NUIT_PRESTADOR}}, com sede em {{MORADA_PRESTADOR}}.</p>
  <p><strong>CLIENTE:</strong> {{CLIENTE}}, BI/NUIT {{BI_CLIENTE}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Prestador</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{PRESTADOR}}</p></div>
    <div><p>O Cliente</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{CLIENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'prestacao'
  AND template_name = 'Prestação de Serviços — Freelancer Simples'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{SERVICO}}</p>
  <p>Entre:</p>
  <p><strong>PRESTADOR:</strong> {{PRESTADOR}}, NUIT {{NUIT_PRESTADOR}}, com sede em {{MORADA_PRESTADOR}}.</p>
  <p><strong>CLIENTE:</strong> {{CLIENTE}}, BI/NUIT {{BI_CLIENTE}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Prestador</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{PRESTADOR}}</p></div>
    <div><p>O Cliente</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{CLIENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'prestacao'
  AND template_name = 'Prestação de Serviços — Empresa para Empresa'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{SERVICO}}</p>
  <p>Entre:</p>
  <p><strong>PRESTADOR:</strong> {{PRESTADOR}}, NUIT {{NUIT_PRESTADOR}}, com sede em {{MORADA_PRESTADOR}}.</p>
  <p><strong>CLIENTE:</strong> {{CLIENTE}}, BI/NUIT {{BI_CLIENTE}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Prestador</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{PRESTADOR}}</p></div>
    <div><p>O Cliente</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{CLIENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'prestacao'
  AND template_name = 'Prestação de Serviços — Construção e Obra'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{SERVICO}}</p>
  <p>Entre:</p>
  <p><strong>PRESTADOR:</strong> {{PRESTADOR}}, NUIT {{NUIT_PRESTADOR}}, com sede em {{MORADA_PRESTADOR}}.</p>
  <p><strong>CLIENTE:</strong> {{CLIENTE}}, BI/NUIT {{BI_CLIENTE}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Prestador</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{PRESTADOR}}</p></div>
    <div><p>O Cliente</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{CLIENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'prestacao'
  AND template_name = 'Prestação de Serviços — Tecnologia e TI'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Requerimento (requerimento) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <p style="text-align:right;margin-bottom:20pt">{{LOCAL}}, {{DATA}}</p>
  <p><strong>Exmo.(a) Sr.(a) {{ENTIDADE}}</strong></p>
  <h1 style="font-size:12pt;font-weight:700;margin:16pt 0">REQUERIMENTO</h1>
  <p><strong>{{REQUERENTE}}</strong>, portador do BI n.º {{BI}}, residente em {{ENDERECO}}, vem respeitosamente requerer a V. Ex.ª o seguinte:</p>
  <p><strong>Assunto:</strong> {{ASSUNTO}}</p>
  <div>{{FUNDAMENTO}}</div>
  <p style="margin-top:14pt">Nestes termos, pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:160pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'requerimento'
  AND template_name = 'Requerimento — Escolar / Académico'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <p style="text-align:right;margin-bottom:20pt">{{LOCAL}}, {{DATA}}</p>
  <p><strong>Exmo.(a) Sr.(a) {{ENTIDADE}}</strong></p>
  <h1 style="font-size:12pt;font-weight:700;margin:16pt 0">REQUERIMENTO</h1>
  <p><strong>{{REQUERENTE}}</strong>, portador do BI n.º {{BI}}, residente em {{ENDERECO}}, vem respeitosamente requerer a V. Ex.ª o seguinte:</p>
  <p><strong>Assunto:</strong> {{ASSUNTO}}</p>
  <div>{{FUNDAMENTO}}</div>
  <p style="margin-top:14pt">Nestes termos, pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:160pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'requerimento'
  AND template_name = 'Requerimento — Saúde / Hospital'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <p style="text-align:right;margin-bottom:20pt">{{LOCAL}}, {{DATA}}</p>
  <p><strong>Exmo.(a) Sr.(a) {{ENTIDADE}}</strong></p>
  <h1 style="font-size:12pt;font-weight:700;margin:16pt 0">REQUERIMENTO</h1>
  <p><strong>{{REQUERENTE}}</strong>, portador do BI n.º {{BI}}, residente em {{ENDERECO}}, vem respeitosamente requerer a V. Ex.ª o seguinte:</p>
  <p><strong>Assunto:</strong> {{ASSUNTO}}</p>
  <div>{{FUNDAMENTO}}</div>
  <p style="margin-top:14pt">Nestes termos, pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:160pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'requerimento'
  AND template_name = 'Requerimento — Migração / Passaporte'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <p style="text-align:right;margin-bottom:20pt">{{LOCAL}}, {{DATA}}</p>
  <p><strong>Exmo.(a) Sr.(a) {{ENTIDADE}}</strong></p>
  <h1 style="font-size:12pt;font-weight:700;margin:16pt 0">REQUERIMENTO</h1>
  <p><strong>{{REQUERENTE}}</strong>, portador do BI n.º {{BI}}, residente em {{ENDERECO}}, vem respeitosamente requerer a V. Ex.ª o seguinte:</p>
  <p><strong>Assunto:</strong> {{ASSUNTO}}</p>
  <div>{{FUNDAMENTO}}</div>
  <p style="margin-top:14pt">Nestes termos, pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:160pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'requerimento'
  AND template_name = 'Requerimento — Finanças / AT'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Declaração de Residência (residencia) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">Junta de Freguesia / Bairro</p>
    <h1 style="font-size:14pt;font-weight:800">DECLARAÇÃO DE RESIDÊNCIA</h1>
    <div style="width:40pt;height:3pt;background:#1a237e;margin:8pt auto"></div>
  </div>
  <p>O(a) abaixo assinado(a), declara para os devidos efeitos que:</p>
  <p><strong>{{DECLARANTE}}</strong>, portador(a) do BI n.º <strong>{{BI}}</strong>, nascido(a) a {{NASCIMENTO}} em {{NATURALIDADE}}, reside em <strong>{{ENDERECO}}</strong>, há <strong>{{TEMPO}}</strong>.</p>
  <p>A presente declaração é emitida para fins de <strong>{{FINALIDADE}}</strong>.</p>
  <div style="margin-top:36pt;display:flex;justify-content:space-between">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:140pt;margin-bottom:4pt"></div><p>O Responsável</p><p>{{CHEFE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'residencia'
  AND template_name = 'Declaração de Residência — Declaração Formal'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">Junta de Freguesia / Bairro</p>
    <h1 style="font-size:14pt;font-weight:800">DECLARAÇÃO DE RESIDÊNCIA</h1>
    <div style="width:40pt;height:3pt;background:#1a237e;margin:8pt auto"></div>
  </div>
  <p>O(a) abaixo assinado(a), declara para os devidos efeitos que:</p>
  <p><strong>{{DECLARANTE}}</strong>, portador(a) do BI n.º <strong>{{BI}}</strong>, nascido(a) a {{NASCIMENTO}} em {{NATURALIDADE}}, reside em <strong>{{ENDERECO}}</strong>, há <strong>{{TEMPO}}</strong>.</p>
  <p>A presente declaração é emitida para fins de <strong>{{FINALIDADE}}</strong>.</p>
  <div style="margin-top:36pt;display:flex;justify-content:space-between">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:140pt;margin-bottom:4pt"></div><p>O Responsável</p><p>{{CHEFE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'residencia'
  AND template_name = 'Declaração de Residência — Auto-Declaração'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">Junta de Freguesia / Bairro</p>
    <h1 style="font-size:14pt;font-weight:800">DECLARAÇÃO DE RESIDÊNCIA</h1>
    <div style="width:40pt;height:3pt;background:#1a237e;margin:8pt auto"></div>
  </div>
  <p>O(a) abaixo assinado(a), declara para os devidos efeitos que:</p>
  <p><strong>{{DECLARANTE}}</strong>, portador(a) do BI n.º <strong>{{BI}}</strong>, nascido(a) a {{NASCIMENTO}} em {{NATURALIDADE}}, reside em <strong>{{ENDERECO}}</strong>, há <strong>{{TEMPO}}</strong>.</p>
  <p>A presente declaração é emitida para fins de <strong>{{FINALIDADE}}</strong>.</p>
  <div style="margin-top:36pt;display:flex;justify-content:space-between">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:140pt;margin-bottom:4pt"></div><p>O Responsável</p><p>{{CHEFE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'residencia'
  AND template_name = 'Declaração de Residência — Confirmação Empresarial'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">Junta de Freguesia / Bairro</p>
    <h1 style="font-size:14pt;font-weight:800">DECLARAÇÃO DE RESIDÊNCIA</h1>
    <div style="width:40pt;height:3pt;background:#1a237e;margin:8pt auto"></div>
  </div>
  <p>O(a) abaixo assinado(a), declara para os devidos efeitos que:</p>
  <p><strong>{{DECLARANTE}}</strong>, portador(a) do BI n.º <strong>{{BI}}</strong>, nascido(a) a {{NASCIMENTO}} em {{NATURALIDADE}}, reside em <strong>{{ENDERECO}}</strong>, há <strong>{{TEMPO}}</strong>.</p>
  <p>A presente declaração é emitida para fins de <strong>{{FINALIDADE}}</strong>.</p>
  <div style="margin-top:36pt;display:flex;justify-content:space-between">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:140pt;margin-bottom:4pt"></div><p>O Responsável</p><p>{{CHEFE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'residencia'
  AND template_name = 'Declaração de Residência — Cópia Simplificada'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Plano de Negócio (planonegocio) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div class="pln-page">
  <header class="pln-header">
    <h1 class="pln-titulo">{{NOME_NEGOCIO}}</h1>
    <p class="pln-subtitulo">Plano de Negócios — {{SECTOR}}</p>
    <p class="pln-meta">{{PROPRIETARIO}} | {{LOCAL}} | {{ANO}}</p>
  </header>
  <section class="pln-section"><h2 class="pln-section-title">1. Sumário Executivo</h2><div class="pln-content">{{SUMARIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">2. Descrição do Negócio</h2><div class="pln-content">{{DESCRICAO_NEGOCIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">3. Análise de Mercado</h2><div class="pln-content">{{ANALISE_MERCADO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">4. Plano Financeiro</h2>
    <table class="pln-table">
      <thead><tr><th>Componente</th><th>Valor (MZN)</th></tr></thead>
      <tbody>{{ITEMS_FINANCEIROS}}</tbody>
      <tfoot><tr><td><strong>Investimento Total</strong></td><td><strong>{{INVESTIMENTO_TOTAL}}</strong></td></tr></tfoot>
    </table>
  </section>
  <section class="pln-section"><h2 class="pln-section-title">5. Equipa e Recursos Humanos</h2><div class="pln-content">{{EQUIPA}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">6. Projecção de Retorno</h2><div class="pln-content">{{RETORNO}}</div></section>
</div>$tpl$
WHERE service_type = 'planonegocio'
  AND template_name = 'Plano de Negócio — Startup / Incubadora'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div class="pln-page">
  <header class="pln-header">
    <h1 class="pln-titulo">{{NOME_NEGOCIO}}</h1>
    <p class="pln-subtitulo">Plano de Negócios — {{SECTOR}}</p>
    <p class="pln-meta">{{PROPRIETARIO}} | {{LOCAL}} | {{ANO}}</p>
  </header>
  <section class="pln-section"><h2 class="pln-section-title">1. Sumário Executivo</h2><div class="pln-content">{{SUMARIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">2. Descrição do Negócio</h2><div class="pln-content">{{DESCRICAO_NEGOCIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">3. Análise de Mercado</h2><div class="pln-content">{{ANALISE_MERCADO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">4. Plano Financeiro</h2>
    <table class="pln-table">
      <thead><tr><th>Componente</th><th>Valor (MZN)</th></tr></thead>
      <tbody>{{ITEMS_FINANCEIROS}}</tbody>
      <tfoot><tr><td><strong>Investimento Total</strong></td><td><strong>{{INVESTIMENTO_TOTAL}}</strong></td></tr></tfoot>
    </table>
  </section>
  <section class="pln-section"><h2 class="pln-section-title">5. Equipa e Recursos Humanos</h2><div class="pln-content">{{EQUIPA}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">6. Projecção de Retorno</h2><div class="pln-content">{{RETORNO}}</div></section>
</div>$tpl$
WHERE service_type = 'planonegocio'
  AND template_name = 'Plano de Negócio — ONG / Projecto Social'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div class="pln-page">
  <header class="pln-header">
    <h1 class="pln-titulo">{{NOME_NEGOCIO}}</h1>
    <p class="pln-subtitulo">Plano de Negócios — {{SECTOR}}</p>
    <p class="pln-meta">{{PROPRIETARIO}} | {{LOCAL}} | {{ANO}}</p>
  </header>
  <section class="pln-section"><h2 class="pln-section-title">1. Sumário Executivo</h2><div class="pln-content">{{SUMARIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">2. Descrição do Negócio</h2><div class="pln-content">{{DESCRICAO_NEGOCIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">3. Análise de Mercado</h2><div class="pln-content">{{ANALISE_MERCADO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">4. Plano Financeiro</h2>
    <table class="pln-table">
      <thead><tr><th>Componente</th><th>Valor (MZN)</th></tr></thead>
      <tbody>{{ITEMS_FINANCEIROS}}</tbody>
      <tfoot><tr><td><strong>Investimento Total</strong></td><td><strong>{{INVESTIMENTO_TOTAL}}</strong></td></tr></tfoot>
    </table>
  </section>
  <section class="pln-section"><h2 class="pln-section-title">5. Equipa e Recursos Humanos</h2><div class="pln-content">{{EQUIPA}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">6. Projecção de Retorno</h2><div class="pln-content">{{RETORNO}}</div></section>
</div>$tpl$
WHERE service_type = 'planonegocio'
  AND template_name = 'Plano de Negócio — Agronegócio'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div class="pln-page">
  <header class="pln-header">
    <h1 class="pln-titulo">{{NOME_NEGOCIO}}</h1>
    <p class="pln-subtitulo">Plano de Negócios — {{SECTOR}}</p>
    <p class="pln-meta">{{PROPRIETARIO}} | {{LOCAL}} | {{ANO}}</p>
  </header>
  <section class="pln-section"><h2 class="pln-section-title">1. Sumário Executivo</h2><div class="pln-content">{{SUMARIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">2. Descrição do Negócio</h2><div class="pln-content">{{DESCRICAO_NEGOCIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">3. Análise de Mercado</h2><div class="pln-content">{{ANALISE_MERCADO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">4. Plano Financeiro</h2>
    <table class="pln-table">
      <thead><tr><th>Componente</th><th>Valor (MZN)</th></tr></thead>
      <tbody>{{ITEMS_FINANCEIROS}}</tbody>
      <tfoot><tr><td><strong>Investimento Total</strong></td><td><strong>{{INVESTIMENTO_TOTAL}}</strong></td></tr></tfoot>
    </table>
  </section>
  <section class="pln-section"><h2 class="pln-section-title">5. Equipa e Recursos Humanos</h2><div class="pln-content">{{EQUIPA}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">6. Projecção de Retorno</h2><div class="pln-content">{{RETORNO}}</div></section>
</div>$tpl$
WHERE service_type = 'planonegocio'
  AND template_name = 'Plano de Negócio — Sumário Executivo'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Recibo (recibo) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1>RECIBO DE PAGAMENTO</h1>
  <p><strong>Emitido por:</strong> {{EMITENTE}} &nbsp; NUIT: {{NUIT_EMITENTE}}</p>
  <p><strong>Recebido de:</strong> {{CLIENTE}}</p>
  <p><strong>Descrição:</strong> {{DESCRICAO}}</p>
  <p class="valor">{{VALOR_TOTAL}} MZN</p>
  <table>
    <thead><tr><th>Descrição</th><th>Qtd.</th><th>Pr. Unit.</th><th>Total</th></tr></thead>
    <tbody>{{ITEMS_RECIBO}}</tbody>
    <tfoot>
      <tr><td colspan="3" style="text-align:right;font-weight:700">IVA ({{TAXA_IVA}}%)</td><td>{{VALOR_IVA}} MZN</td></tr>
      <tr><td colspan="3" style="text-align:right;font-weight:800">TOTAL</td><td style="font-weight:800">{{VALOR_TOTAL}} MZN</td></tr>
    </tfoot>
  </table>
  <p><strong>Forma de pagamento:</strong> {{FORMA_PAGAMENTO}}</p>
  <div style="margin-top:30pt;display:flex;justify-content:space-between">
    <p>Data: {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:120pt;margin-bottom:4pt"></div><p>{{EMITENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'recibo'
  AND template_name = 'Recibo — Loja / Comércio'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1>RECIBO DE PAGAMENTO</h1>
  <p><strong>Emitido por:</strong> {{EMITENTE}} &nbsp; NUIT: {{NUIT_EMITENTE}}</p>
  <p><strong>Recebido de:</strong> {{CLIENTE}}</p>
  <p><strong>Descrição:</strong> {{DESCRICAO}}</p>
  <p class="valor">{{VALOR_TOTAL}} MZN</p>
  <table>
    <thead><tr><th>Descrição</th><th>Qtd.</th><th>Pr. Unit.</th><th>Total</th></tr></thead>
    <tbody>{{ITEMS_RECIBO}}</tbody>
    <tfoot>
      <tr><td colspan="3" style="text-align:right;font-weight:700">IVA ({{TAXA_IVA}}%)</td><td>{{VALOR_IVA}} MZN</td></tr>
      <tr><td colspan="3" style="text-align:right;font-weight:800">TOTAL</td><td style="font-weight:800">{{VALOR_TOTAL}} MZN</td></tr>
    </tfoot>
  </table>
  <p><strong>Forma de pagamento:</strong> {{FORMA_PAGAMENTO}}</p>
  <div style="margin-top:30pt;display:flex;justify-content:space-between">
    <p>Data: {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:120pt;margin-bottom:4pt"></div><p>{{EMITENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'recibo'
  AND template_name = 'Recibo — Proforma'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1>RECIBO DE PAGAMENTO</h1>
  <p><strong>Emitido por:</strong> {{EMITENTE}} &nbsp; NUIT: {{NUIT_EMITENTE}}</p>
  <p><strong>Recebido de:</strong> {{CLIENTE}}</p>
  <p><strong>Descrição:</strong> {{DESCRICAO}}</p>
  <p class="valor">{{VALOR_TOTAL}} MZN</p>
  <table>
    <thead><tr><th>Descrição</th><th>Qtd.</th><th>Pr. Unit.</th><th>Total</th></tr></thead>
    <tbody>{{ITEMS_RECIBO}}</tbody>
    <tfoot>
      <tr><td colspan="3" style="text-align:right;font-weight:700">IVA ({{TAXA_IVA}}%)</td><td>{{VALOR_IVA}} MZN</td></tr>
      <tr><td colspan="3" style="text-align:right;font-weight:800">TOTAL</td><td style="font-weight:800">{{VALOR_TOTAL}} MZN</td></tr>
    </tfoot>
  </table>
  <p><strong>Forma de pagamento:</strong> {{FORMA_PAGAMENTO}}</p>
  <div style="margin-top:30pt;display:flex;justify-content:space-between">
    <p>Data: {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:120pt;margin-bottom:4pt"></div><p>{{EMITENTE}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'recibo'
  AND template_name = 'Recibo — Recibo de Serviço'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Carta de Recomendação (recomendacao) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:right;margin-bottom:20pt"><p>{{LOCAL}}, {{DATA}}</p></div>
  <h1 style="font-size:14pt;font-weight:700;margin-bottom:16pt">CARTA DE RECOMENDAÇÃO</h1>
  <p>A quem possa interessar,</p>
  <div>{{CORPO}}</div>
  <div style="margin-top:36pt">
    <p>Com os melhores cumprimentos,</p>
    <div style="margin-top:28pt;border-top:1px solid #000;width:160pt"></div>
    <p><strong>{{RECOMENDADOR}}</strong></p>
    <p>{{CARGO_REC}} — {{ENTIDADE_REC}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'recomendacao'
  AND template_name = 'Carta de Recomendação — Recomendação Académica'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:right;margin-bottom:20pt"><p>{{LOCAL}}, {{DATA}}</p></div>
  <h1 style="font-size:14pt;font-weight:700;margin-bottom:16pt">CARTA DE RECOMENDAÇÃO</h1>
  <p>A quem possa interessar,</p>
  <div>{{CORPO}}</div>
  <div style="margin-top:36pt">
    <p>Com os melhores cumprimentos,</p>
    <div style="margin-top:28pt;border-top:1px solid #000;width:160pt"></div>
    <p><strong>{{RECOMENDADOR}}</strong></p>
    <p>{{CARGO_REC}} — {{ENTIDADE_REC}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'recomendacao'
  AND template_name = 'Carta de Recomendação — Institucional'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:right;margin-bottom:20pt"><p>{{LOCAL}}, {{DATA}}</p></div>
  <h1 style="font-size:14pt;font-weight:700;margin-bottom:16pt">CARTA DE RECOMENDAÇÃO</h1>
  <p>A quem possa interessar,</p>
  <div>{{CORPO}}</div>
  <div style="margin-top:36pt">
    <p>Com os melhores cumprimentos,</p>
    <div style="margin-top:28pt;border-top:1px solid #000;width:160pt"></div>
    <p><strong>{{RECOMENDADOR}}</strong></p>
    <p>{{CARGO_REC}} — {{ENTIDADE_REC}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'recomendacao'
  AND template_name = 'Carta de Recomendação — Pessoal / Carácter'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:right;margin-bottom:20pt"><p>{{LOCAL}}, {{DATA}}</p></div>
  <h1 style="font-size:14pt;font-weight:700;margin-bottom:16pt">CARTA DE RECOMENDAÇÃO</h1>
  <p>A quem possa interessar,</p>
  <div>{{CORPO}}</div>
  <div style="margin-top:36pt">
    <p>Com os melhores cumprimentos,</p>
    <div style="margin-top:28pt;border-top:1px solid #000;width:160pt"></div>
    <p><strong>{{RECOMENDADOR}}</strong></p>
    <p>{{CARGO_REC}} — {{ENTIDADE_REC}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'recomendacao'
  AND template_name = 'Carta de Recomendação — Bolsa / Intercâmbio'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Licença (licenca) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">República de Moçambique</p>
    <h1 style="font-size:14pt;font-weight:800">REQUERIMENTO DE LICENÇA COMERCIAL</h1>
  </div>
  <p>Ao(À) {{ENTIDADE}},</p>
  <p><strong>{{REQUERENTE}}</strong>, NUIT <strong>{{NUIT}}</strong>, contacto <strong>{{CONTACTO}}</strong>, vem requerer a V. Ex.ª a emissão de licença para exercício de actividade comercial:</p>
  <p><strong>Actividade:</strong> {{OBJECTO}}</p>
  <p><strong>Área:</strong> {{AREA_M2}} m² | <strong>Horário:</strong> {{HORARIO}}</p>
  <p><strong>Local do estabelecimento:</strong> {{LOCAL}}</p>
  <div>{{FUNDAMENTACAO}}</div>
  <p style="margin-top:14pt">Pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:150pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'licenca'
  AND template_name = 'Licença — Licença de Construção'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">República de Moçambique</p>
    <h1 style="font-size:14pt;font-weight:800">REQUERIMENTO DE LICENÇA COMERCIAL</h1>
  </div>
  <p>Ao(À) {{ENTIDADE}},</p>
  <p><strong>{{REQUERENTE}}</strong>, NUIT <strong>{{NUIT}}</strong>, contacto <strong>{{CONTACTO}}</strong>, vem requerer a V. Ex.ª a emissão de licença para exercício de actividade comercial:</p>
  <p><strong>Actividade:</strong> {{OBJECTO}}</p>
  <p><strong>Área:</strong> {{AREA_M2}} m² | <strong>Horário:</strong> {{HORARIO}}</p>
  <p><strong>Local do estabelecimento:</strong> {{LOCAL}}</p>
  <div>{{FUNDAMENTACAO}}</div>
  <p style="margin-top:14pt">Pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:150pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'licenca'
  AND template_name = 'Licença — Autorização de Evento'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">República de Moçambique</p>
    <h1 style="font-size:14pt;font-weight:800">REQUERIMENTO DE LICENÇA COMERCIAL</h1>
  </div>
  <p>Ao(À) {{ENTIDADE}},</p>
  <p><strong>{{REQUERENTE}}</strong>, NUIT <strong>{{NUIT}}</strong>, contacto <strong>{{CONTACTO}}</strong>, vem requerer a V. Ex.ª a emissão de licença para exercício de actividade comercial:</p>
  <p><strong>Actividade:</strong> {{OBJECTO}}</p>
  <p><strong>Área:</strong> {{AREA_M2}} m² | <strong>Horário:</strong> {{HORARIO}}</p>
  <p><strong>Local do estabelecimento:</strong> {{LOCAL}}</p>
  <div>{{FUNDAMENTACAO}}</div>
  <p style="margin-top:14pt">Pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:150pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'licenca'
  AND template_name = 'Licença — Licença de Transporte'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">República de Moçambique</p>
    <h1 style="font-size:14pt;font-weight:800">REQUERIMENTO DE LICENÇA COMERCIAL</h1>
  </div>
  <p>Ao(À) {{ENTIDADE}},</p>
  <p><strong>{{REQUERENTE}}</strong>, NUIT <strong>{{NUIT}}</strong>, contacto <strong>{{CONTACTO}}</strong>, vem requerer a V. Ex.ª a emissão de licença para exercício de actividade comercial:</p>
  <p><strong>Actividade:</strong> {{OBJECTO}}</p>
  <p><strong>Área:</strong> {{AREA_M2}} m² | <strong>Horário:</strong> {{HORARIO}}</p>
  <p><strong>Local do estabelecimento:</strong> {{LOCAL}}</p>
  <div>{{FUNDAMENTACAO}}</div>
  <p style="margin-top:14pt">Pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:150pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>$tpl$
WHERE service_type = 'licenca'
  AND template_name = 'Licença — Licença Ambiental'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- ── Acta de Reunião (acta) ────────────────────────────────────────
UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">ACTA N.º {{NUM_ACTA}}</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:16pt">{{ORGANIZACAO}} — {{TIPO_REUNIAO}}</p>
  <p><strong>Data:</strong> {{DATA}} | <strong>Hora:</strong> {{HORA}} | <strong>Local:</strong> {{LOCAL}}</p>
  <p><strong>Presidente:</strong> {{PRESIDENTE}} | <strong>Secretário:</strong> {{SECRETARIO}}</p>
  <p><strong>Presentes:</strong> {{PRESENTES}}</p>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Ordem do Dia</h2>
  <div>{{PAUTA}}</div>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Deliberações</h2>
  <div>{{DELIBERACOES}}</div>
  <p style="margin-top:14pt">Nada mais havendo a tratar, foi encerrada a reunião.</p>
  <div style="display:flex;justify-content:space-between;margin-top:36pt">
    <div><p>O Presidente</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{PRESIDENTE}}</p></div>
    <div><p>O Secretário</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{SECRETARIO}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'acta'
  AND template_name = 'Acta de Reunião — Associação / ONG'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">ACTA N.º {{NUM_ACTA}}</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:16pt">{{ORGANIZACAO}} — {{TIPO_REUNIAO}}</p>
  <p><strong>Data:</strong> {{DATA}} | <strong>Hora:</strong> {{HORA}} | <strong>Local:</strong> {{LOCAL}}</p>
  <p><strong>Presidente:</strong> {{PRESIDENTE}} | <strong>Secretário:</strong> {{SECRETARIO}}</p>
  <p><strong>Presentes:</strong> {{PRESENTES}}</p>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Ordem do Dia</h2>
  <div>{{PAUTA}}</div>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Deliberações</h2>
  <div>{{DELIBERACOES}}</div>
  <p style="margin-top:14pt">Nada mais havendo a tratar, foi encerrada a reunião.</p>
  <div style="display:flex;justify-content:space-between;margin-top:36pt">
    <div><p>O Presidente</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{PRESIDENTE}}</p></div>
    <div><p>O Secretário</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{SECRETARIO}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'acta'
  AND template_name = 'Acta de Reunião — Conselho de Administração'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">ACTA N.º {{NUM_ACTA}}</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:16pt">{{ORGANIZACAO}} — {{TIPO_REUNIAO}}</p>
  <p><strong>Data:</strong> {{DATA}} | <strong>Hora:</strong> {{HORA}} | <strong>Local:</strong> {{LOCAL}}</p>
  <p><strong>Presidente:</strong> {{PRESIDENTE}} | <strong>Secretário:</strong> {{SECRETARIO}}</p>
  <p><strong>Presentes:</strong> {{PRESENTES}}</p>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Ordem do Dia</h2>
  <div>{{PAUTA}}</div>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Deliberações</h2>
  <div>{{DELIBERACOES}}</div>
  <p style="margin-top:14pt">Nada mais havendo a tratar, foi encerrada a reunião.</p>
  <div style="display:flex;justify-content:space-between;margin-top:36pt">
    <div><p>O Presidente</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{PRESIDENTE}}</p></div>
    <div><p>O Secretário</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{SECRETARIO}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'acta'
  AND template_name = 'Acta de Reunião — Condomínio / Moradores'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');

UPDATE templates_custom
SET template_html = $tpl$
<div>
  <h1 style="text-align:center">ACTA N.º {{NUM_ACTA}}</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:16pt">{{ORGANIZACAO}} — {{TIPO_REUNIAO}}</p>
  <p><strong>Data:</strong> {{DATA}} | <strong>Hora:</strong> {{HORA}} | <strong>Local:</strong> {{LOCAL}}</p>
  <p><strong>Presidente:</strong> {{PRESIDENTE}} | <strong>Secretário:</strong> {{SECRETARIO}}</p>
  <p><strong>Presentes:</strong> {{PRESENTES}}</p>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Ordem do Dia</h2>
  <div>{{PAUTA}}</div>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Deliberações</h2>
  <div>{{DELIBERACOES}}</div>
  <p style="margin-top:14pt">Nada mais havendo a tratar, foi encerrada a reunião.</p>
  <div style="display:flex;justify-content:space-between;margin-top:36pt">
    <div><p>O Presidente</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{PRESIDENTE}}</p></div>
    <div><p>O Secretário</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{SECRETARIO}}</p></div>
  </div>
</div>$tpl$
WHERE service_type = 'acta'
  AND template_name = 'Acta de Reunião — Conselho Pedagógico'
  AND user_id IS NULL
  AND (template_html IS NULL OR template_html = '');


-- Total de modelos corrigidos por este script: 38


-- ── Verificação rápida (correr a seguir para confirmar) ───────────────
-- SELECT service_type, template_name,
--        (template_html IS NULL OR template_html = '') AS ainda_vazio
-- FROM templates_custom
-- WHERE user_id IS NULL
-- ORDER BY service_type, template_name;
