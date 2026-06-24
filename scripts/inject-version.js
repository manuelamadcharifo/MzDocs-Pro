#!/usr/bin/env node
// scripts/legal-ingest.js
// ──────────────────────────────────────────────────────────────────────────
// FASE 2 — Motor Jurídico (RAG): script de ingestão.
//
// Lê os textos em docs/legal/textos-fonte/<slug>.txt, segmenta por artigo,
// limpa ruído de extracção (cabeçalhos de Boletim, título duplicado,
// artefactos de OCR), gera um embedding por artigo via Gemini API, e
// insere tudo em legal_chunks (Supabase).
//
// NÃO é uma Serverless Function — corre-se manualmente, uma vez por
// diploma (ou para todos), a partir da máquina local de quem administra
// o projecto. Não conta para o limite de functions do Vercel.
//
// Pré-requisitos:
//   - migration_v17_legal_rag.sql já corrido no Supabase (tabelas +
//     extensão vector + os 12 registos de legal_diplomas já existem)
//   - variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//     GEMINI_API_KEY (as mesmas já usadas pelo resto do projecto)
//
// Uso:
//   node scripts/legal-ingest.js                  → ingere todos os diplomas
//   node scripts/legal-ingest.js codigo-civil      → ingere só este diploma
//   node scripts/legal-ingest.js --dry-run         → segmenta e mostra
//                                                     contagens, mas não
//                                                     chama a API nem escreve
//                                                     na base de dados
//
// Custo: gemini-embedding-001 tem tier gratuito generoso; ainda assim,
// o script espaça os pedidos (ver RATE_LIMIT_DELAY_MS) para não estourar
// o limite de pedidos/minuto da chave gratuita.
// ──────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;

const TEXTOS_DIR = path.join(__dirname, '..', 'docs', 'legal', 'textos-fonte');
const RATE_LIMIT_DELAY_MS = 1200; // ~50 pedidos/min — confortável para o tier gratuito
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlySlug = args.find(a => !a.startsWith('--'));

// ── Validação de ambiente ───────────────────────────────────────────────
if (!DRY_RUN) {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY)  missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!GEMINI_KEY)   missing.push('GEMINI_API_KEY');
  if (missing.length) {
    console.error(`Faltam variáveis de ambiente: ${missing.join(', ')}`);
    console.error('Defina-as (ex: export SUPABASE_URL=...) ou use --dry-run para testar sem elas.');
    process.exit(1);
  }
}

// ── 1. Limpeza de texto bruto ───────────────────────────────────────────
// Remove ruído comum dos PDFs/OCR de Boletim da República:
//  - cabeçalhos repetidos ("BOLETIM DA REPÚBLICA", "I SÉRIE — Número N")
//  - títulos de artigo duplicados pelo extractor
//    (ex: "Artigo 1.º Noção Artigo 1.º Noção" → "Artigo 1.º Noção")
function limparTextoBruto(txt) {
  let out = txt;

  // Cabeçalhos repetidos de Boletim — comuns em quase todos os PDFs do governo
  out = out.replace(/BOLETIM\s+DA\s+REP[ÚU]BLICA/gi, ' ');
  out = out.replace(/PUBLICA[ÇC][ÃA]O\s+OFICIAL\s+DA\s+REP[ÚU]BLICA\s+DE\s+MO[ÇC]AMBIQUE/gi, ' ');
  out = out.replace(/IMPRENSA\s+NACIONAL\s+DE\s+MO[ÇC]AMBIQUE/gi, ' ');
  out = out.replace(/I\s+S[ÉE]RIE\s*[-—]\s*N[úu]mero\s*\d+/gi, ' ');

  // Marcas de água de plataformas de partilha de documentos (confirmado no
  // PDF do Código Civil, proveniente de material académico via StudoCu)
  out = out.replace(/messages\.\w+/gi, ' ');
  out = out.replace(/lOMoARcPSD\|?\d*/gi, ' ');
  out = out.replace(/Todos\s+os\s+direitos\s+reservados\s*©?\s*LexLink\s*(?:www\.[\w.\-]*\s*\n?\s*\w*)?/gi, ' ');

  // Bloco de índice/sumário (ex: "ÍNDICE\nARTIGO 1 – (Âmbito) ... 3\n...").
  // Confirmado no Código do IVA: o índice lista todos os artigos com
  // títulos e pontos de preenchimento, por vezes estendendo-se por várias
  // linhas reais por entrada — um filtro linha-a-linha não chega a
  // remover tudo. Em diplomas com várias versões consolidadas (ex: o
  // Código do IVA já alterado por 5 leis sucessivas), pode haver MAIS DE
  // UM bloco "ÍNDICE"/"PREÂMBULO" repetido antes do articulado real
  // começar de facto. Por isso cortamos tudo entre a PRIMEIRA ocorrência
  // de "ÍNDICE" e a ÚLTIMA ocorrência de "ÍNDICE" ou "PREÂMBULO" que
  // apareça antes do primeiro "ARTIGO 1" seguido de texto substantivo —
  // na prática, a forma mais segura de identificar isso é: a última
  // ocorrência de qualquer um dos dois marcadores dentro dos primeiros
  // ~15000 caracteres do documento (o índice nunca é maior do que isso
  // nestes diplomas).
  const JANELA_INDICE = 15000;
  const idxIndice = out.search(/ÍNDICE\b/i);
  if (idxIndice !== -1 && idxIndice < JANELA_INDICE) {
    const janela = out.slice(0, JANELA_INDICE);
    const marcadores = [...janela.matchAll(/(?:ÍNDICE|PRE[ÂA]MBULO)\b/gi)];
    if (marcadores.length > 1) {
      const ultimoMarcador = marcadores[marcadores.length - 1];
      out = out.slice(0, idxIndice) + out.slice(ultimoMarcador.index);
    }
  }

  // Linhas de índice residuais que sobrevivam ao corte de bloco acima
  // (ex: diplomas sem "PREÂMBULO" explícito, ou índice fora da janela
  // considerada acima) — heurística adicional por linha, como segunda
  // camada de defesa.
  out = out.split('\n')
    .filter(linha => !/\.{8,}/.test(linha))
    .join('\n');

  // Espaços/quebras de linha excessivos
  out = out.replace(/[ \t]+/g, ' ');
  out = out.replace(/\n{2,}/g, '\n');

  return out;
}

// Remove a duplicação "Artigo N.º Título Artigo N.º Título" → "Artigo N.º Título"
// (artefacto do extractor de PDF em alguns diplomas — confirmado no Código
// Civil). A duplicação ocorre sempre na mesma linha (antes da primeira
// quebra de linha real do corpo do artigo), por isso comparamos a porção
// da primeira linha com ela própria em vez de tentar adivinhar onde o
// título acaba por capitalização — essa abordagem falhava sempre que o
// título tinha mais de uma palavra com inicial maiúscula (ex: "Aprovação
// do Código Civil").
function removerTituloDuplicado(textoArtigo, numero) {
  const quebraIdx = textoArtigo.indexOf('\n');
  const primeiraLinha = quebraIdx === -1 ? textoArtigo : textoArtigo.slice(0, quebraIdx);
  const resto = quebraIdx === -1 ? '' : textoArtigo.slice(quebraIdx);

  const meio = Math.floor(primeiraLinha.length / 2);
  // Procurar um ponto de corte próximo do meio onde a 1ª metade == 2ª metade
  for (let offset = 0; offset <= 10; offset++) {
    for (const corte of [meio - offset, meio + offset]) {
      if (corte <= 0 || corte >= primeiraLinha.length) continue;
      const parte1 = primeiraLinha.slice(0, corte).trim();
      const parte2 = primeiraLinha.slice(corte).trim();
      if (parte1.length > 5 && parte1 === parte2) {
        return parte1 + resto;
      }
    }
  }
  // Sem duplicação detectada — devolver tal como veio
  return textoArtigo;
}

// ── 2. Segmentação por artigo ────────────────────────────────────────────
// Cobre as 3 variações encontradas nos diplomas confirmados na auditoria:
//   "Artigo 271.º (Título)"   — Código Civil, Código Penal (alguns)
//   "ARTIGO 120 (Título)"     — Código do Notariado, maioria dos Boletins
//   "Artigo 4 (Título)"       — Estatuto da OAM (sem "º")
const ARTIGO_RE = /\b(?:Artigo|ARTIGO)\s+(\d+(?:[\-‑]?[A-Za-zºo]){0,3})\b\.?º?/g;

function segmentarPorArtigo(textoLimpo) {
  const matchesBrutos = [...textoLimpo.matchAll(ARTIGO_RE)];

  // CORRIGIDO: quando o extractor duplica o título do artigo (ex: "Artigo
  // 1143.º Forma Artigo 1143.º Forma\nO contrato..."), a regex encontra
  // DOIS matches separados com o MESMO número de artigo, um a seguir ao
  // outro. Isto tem de ser tratado com cuidado em ambas as pontas:
  //   - como INÍCIO do chunk: queremos o ÚLTIMO match da dupla (mais
  //     próximo do corpo real do artigo, evita o chunk ficar vazio)
  //   - como FIM do chunk anterior: queremos o PRIMEIRO match da dupla
  //     (senão o título duplicado do artigo seguinte "vaza" para dentro
  //     do texto do artigo anterior)
  // Por isso guardamos os dois índices por número de artigo.
  const grupos = []; // [{ numero, inicioCorpo (último match), inicioCorte (primeiro match) }]
  for (let i = 0; i < matchesBrutos.length; i++) {
    const numeroAtual = matchesBrutos[i][1].replace(/[ºo.]/g, '');
    const proximoMesmoNumero = matchesBrutos[i + 1] &&
      matchesBrutos[i + 1][1].replace(/[ºo.]/g, '') === numeroAtual;
    if (proximoMesmoNumero) continue; // salta o primeiro da dupla aqui; tratado abaixo
    const ehSegundoDeDupla = i > 0 &&
      matchesBrutos[i - 1][1].replace(/[ºo.]/g, '') === numeroAtual;
    const inicioCorte = ehSegundoDeDupla ? matchesBrutos[i - 1].index : matchesBrutos[i].index;
    grupos.push({ numero: numeroAtual, inicioCorpo: matchesBrutos[i].index, inicioCorte });
  }

  const chunks = [];

  for (let i = 0; i < grupos.length; i++) {
    const atual    = grupos[i];
    const proximo  = grupos[i + 1];
    const numero   = atual.numero;
    const inicio   = atual.inicioCorpo;
    // Corta no início do PRIMEIRO match do próximo artigo (inicioCorte),
    // não no último — evita incluir o título duplicado do próximo artigo.
    const fim      = proximo ? proximo.inicioCorte : Math.min(textoLimpo.length, inicio + 4000);

    let bruto = textoLimpo.slice(inicio, fim).trim();
    bruto = removerTituloDuplicado(bruto, numero);

    // Título: texto entre parênteses logo após o número, se existir
    // (Código Penal, Notariado, Estatuto OAM); senão, primeira "palavra
    // de título" antes da quebra de linha (Código Civil: "Artigo 1143.º
    // Forma\nO contrato..." → título = "Forma").
    let titulo = null;
    const tituloComParenteses = bruto.match(/^\S+\s+\S+\.?º?\s*[\-–—]?\s*\(([^)]+)\)/);
    if (tituloComParenteses) {
      titulo = tituloComParenteses[1].trim();
    } else {
      const primeiraLinha = bruto.split('\n')[0] || '';
      // remove "Artigo N.º " do início, o que resta (se curto) é o título
      const semPrefixo = primeiraLinha.replace(/^(?:Artigo|ARTIGO)\s+\d+[A-Za-zºo]{0,3}\.?º?\s*/i, '').trim();
      if (semPrefixo && semPrefixo.length <= 60) titulo = semPrefixo;
    }

    // Ignorar chunks suspeitos: muito curtos (provável falso positivo da
    // regex, ex: "Artigo" a meio de uma palavra) ou absurdamente longos
    // (provável falha de segmentação — não vai caber no orçamento do prompt
    // de qualquer forma, e é sinal de que o diploma precisa de revisão manual)
    if (bruto.length < 15 || bruto.length > 4000) continue;

    // Ignorar referências cruzadas a artigos de OUTROS diplomas, citadas
    // dentro do preâmbulo (ex: "...ao abrigo do disposto no artigo 135 da
    // Constituição, a Assembleia da República determina:"). Padrão: logo
    // após o número, em vez de "(Título)" ou quebra de linha + corpo,
    // aparece "da"/"do"/"n.º" — sinal de que é uma referência, não um
    // cabeçalho de artigo do próprio texto.
    if (/^(?:Artigo|ARTIGO)\s+\d+[A-Za-zºo]{0,3}\.?º?\s+(?:da|do|n\.?º)\b/i.test(bruto)) continue;

    chunks.push({ numero, titulo, texto: bruto });
  }

  return chunks;
}

// ── 3. Embeddings via Gemini ─────────────────────────────────────────────
async function gerarEmbedding(texto) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: texto }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_DOCUMENT',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini embedContent falhou (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Resposta de embedding inesperada: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return values;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── 4. Supabase (REST puro, sem SDK — mesmo padrão de api/_lib/supabaseAdmin.js) ──
async function supabaseRequest(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${pathAndQuery} falhou (${res.status}): ${errText.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function buscarDiplomaPorSlug(slug) {
  const rows = await supabaseRequest(`legal_diplomas?slug=eq.${encodeURIComponent(slug)}&select=id,slug,nome,estado_verificacao`);
  return rows?.[0] || null;
}

async function apagarChunksDoDiploma(diplomaId) {
  await supabaseRequest(`legal_chunks?diploma_id=eq.${diplomaId}`, { method: 'DELETE' });
}

async function inserirChunk(row) {
  await supabaseRequest('legal_chunks', { method: 'POST', body: row, prefer: 'return=minimal' });
}

// ── 5. Orquestração ──────────────────────────────────────────────────────
async function ingerirDiploma(slug) {
  const filePath = path.join(TEXTOS_DIR, `${slug}.txt`);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  ${slug}: ficheiro ${filePath} não encontrado — a saltar.`);
    return { slug, chunks: 0, erro: 'ficheiro não encontrado' };
  }

  const textoBruto  = fs.readFileSync(filePath, 'utf-8');
  const textoLimpo  = limparTextoBruto(textoBruto);
  const chunks      = segmentarPorArtigo(textoLimpo);

  console.log(`📄 ${slug}: ${chunks.length} artigos segmentados (de ${textoBruto.length} caracteres brutos)`);

  if (DRY_RUN) {
    if (chunks.length > 0) {
      console.log(`   exemplo: Artigo ${chunks[0].numero}${chunks[0].titulo ? ' (' + chunks[0].titulo + ')' : ''} — ${chunks[0].texto.length} chars`);
    }
    const debugArg = args.find(a => a.startsWith('--debug-artigo='));
    if (debugArg) {
      const numeroDebug = debugArg.split('=')[1];
      const encontrado = chunks.find(c => c.numero === numeroDebug);
      console.log(`   [debug-artigo=${numeroDebug}]`, encontrado ? JSON.stringify(encontrado, null, 2) : 'não encontrado');
    }
    return { slug, chunks: chunks.length };
  }

  const diploma = await buscarDiplomaPorSlug(slug);
  if (!diploma) {
    console.warn(`⚠️  ${slug}: diploma não encontrado em legal_diplomas (correu a migration_v17?) — a saltar.`);
    return { slug, chunks: 0, erro: 'diploma não encontrado na BD' };
  }
  if (diploma.estado_verificacao === 'nao_usar') {
    console.warn(`⚠️  ${slug}: marcado como "nao_usar" em legal_diplomas — a saltar de propósito.`);
    return { slug, chunks: 0, erro: 'diploma marcado nao_usar' };
  }

  // Reingestão idempotente: apaga chunks antigos deste diploma antes de inserir os novos
  await apagarChunksDoDiploma(diploma.id);

  let inseridos = 0;
  for (const chunk of chunks) {
    try {
      const embedding = await gerarEmbedding(`${diploma.nome} — Artigo ${chunk.numero}${chunk.titulo ? ' (' + chunk.titulo + ')' : ''}\n${chunk.texto}`);
      await inserirChunk({
        diploma_id:    diploma.id,
        artigo_numero: chunk.numero,
        artigo_titulo: chunk.titulo,
        texto:         chunk.texto,
        texto_tokens:  Math.ceil(chunk.texto.length / 4), // aproximação grosseira (~4 chars/token)
        embedding:     `[${embedding.join(',')}]`, // formato literal pgvector
      });
      inseridos++;
    } catch (err) {
      console.error(`   ❌ Artigo ${chunk.numero}: ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log(`   ✅ ${inseridos}/${chunks.length} artigos inseridos com embedding.`);
  return { slug, chunks: inseridos };
}

async function main() {
  const todosSlugs = fs.readdirSync(TEXTOS_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => f.replace(/\.txt$/, ''));

  const slugsAProcessar = onlySlug ? [onlySlug] : todosSlugs;

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}A processar ${slugsAProcessar.length} diploma(s)...\n`);

  const resultados = [];
  for (const slug of slugsAProcessar) {
    resultados.push(await ingerirDiploma(slug));
  }

  console.log('\n── Resumo ──');
  let totalChunks = 0;
  for (const r of resultados) {
    totalChunks += r.chunks;
    console.log(`  ${r.slug}: ${r.chunks} artigos${r.erro ? ` (erro: ${r.erro})` : ''}`);
  }
  console.log(`\nTotal: ${totalChunks} artigos ${DRY_RUN ? 'segmentados' : 'ingeridos com embedding'}.`);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
