# Golden dataset de OCR (P1-04 / P2-03)

> Auditoria Ago/2026: *"o histórico do GitHub mostra uma sequência muito
> intensa de commits no OCR... quanto mais mudanças consecutivas num
> componente crítico, menor a confiança de que ele está estabilizado sem
> testes de regressão extensivos."*

Esta pasta é o "banco de provas" recomendado: um conjunto de documentos
reais (anonimizados) com o resultado esperado da transcrição, para que
qualquer mudança em `api/_services/ocr.js` — trocar de modelo (Gemini
2.5 → 2.6, por exemplo), mudar a compressão de imagem, mudar o prompt —
possa ser medida em vez de avaliada só "a olho".

## Por que isto não pode ser um teste Jest normal

`handleOcrAnalyze` chama APIs de IA de visão reais (Gemini/Groq/OpenRouter)
— um teste automático em CI que corresse isto em cada PR (a) custaria
dinheiro real a cada execução, (b) precisaria de chaves de API secretas
expostas ao CI, e (c) teria resultados não-determinísticos (a IA não
devolve sempre exactamente o mesmo texto). Por isso o "golden dataset" é
avaliado por um **script manual** (`npm run ocr:golden`), corrido
deliberadamente pelo developer antes/depois de mexer no OCR — não em cada
commit.

## Estrutura de cada fixture

```
tests/fixtures/ocr/
  <nome-do-fixture>/
    image.jpg           ← o documento (JPEG/PNG), anonimizado
    meta.json           ← serviceType, descrição, categoria
    expected.json        ← campos esperados + o texto de transcrição esperado
```

`meta.json`:
```json
{
  "serviceType": "transcricao",
  "category": "manuscrito",
  "description": "Carta manuscrita, 1 página, letra cursiva clara",
  "wallet": null
}
```

`expected.json` — mesmo formato de `fields` que `handleOcrAnalyze`
devolve, mais um campo `transcript` quando aplicável:
```json
{
  "fields": { "titulo": "Carta ao Director" },
  "transcript_contains": [
    "Venho por este meio solicitar",
    "Sem outro assunto de momento"
  ]
}
```

`transcript_contains` é uma lista de frases-chave que DEVEM aparecer na
transcrição — comparação exacta de todo o texto seria frágil (a IA nunca
transcreve palavra-por-palavra de forma 100% idêntica entre execuções);
frases-âncora são um sinal de qualidade muito mais estável.

## As 12 categorias recomendadas pela auditoria

Crie pelo menos um fixture para cada uma, à medida que documentos reais
(anonimizados, com consentimento) forem ficando disponíveis:

1. `texto_impresso` — documento datilografado/impresso simples
2. `manuscrito` — letra cursiva à mão
3. `inclinado` — foto tirada em ângulo, não perfeitamente alinhada
4. `fotografia_ambiente` — foto de telemóvel normal, não scanner
5. `baixa_luz` — foto tirada com pouca luz
6. `multipagina` — 3+ páginas do mesmo documento
7. `pagina_ilegivel` — pelo menos uma página parcialmente ilegível
8. `portugues_acentuacao` — texto com acentuação/cedilha densa
9. `numeros_nuit` — documento com NUIT/números de identificação
10. `tabelas` — documento com tabela(s)
11. `assinaturas` — documento com assinatura manuscrita
12. `carimbos` — documento com carimbo(s) oficiais

## Anonimização — obrigatório antes de commitar qualquer fixture real

Nunca commitar um documento real sem primeiro:
- Substituir nomes reais por nomes fictícios (ex.: "João Alfredo Machel"),
- Substituir números de telefone/NUIT reais por válidos-mas-fictícios,
- Confirmar que a pessoa/entidade autorizou o uso do documento para testes.

As duas pastas `_example_*` neste repositório são apenas **esqueletos**
(sem imagem real) — servem para mostrar o formato esperado de
`meta.json`/`expected.json`. Substitua `image.jpg` por um documento real
anonimizado antes de correr `npm run ocr:golden` a sério.

## Como correr

```bash
GEMINI_API_KEY=... GROQ_API_KEY=... npm run ocr:golden
```

O script (`scripts/ocr-golden-eval.js`) chama `handleOcrAnalyze`
directamente (sem precisar de deploy), compara com `expected.json`, e
imprime uma pontuação por fixture + uma pontuação agregada. Guarde o
output antes de mudar o OCR e volte a correr depois — a comparação dos
dois números é a "prova de regressão" que a auditoria pede.
