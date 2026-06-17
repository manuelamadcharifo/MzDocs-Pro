// assets/js/services/prompts/cv.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const isPrimeiroEmprego = (data.perfilCV || '').includes('Primeiro Emprego');
        const temExperiencia    = !!(data.experiencia && data.experiencia.trim());
        return `Você é especialista sénior em recursos humanos para o mercado moçambicano. Crie um CURRÍCULO VITAE PROFISSIONAL completo e pronto a usar em Markdown.

PERFIL DO CANDIDATO: ${data.perfilCV || 'Com Experiência Profissional'}

DADOS:
- Nome: ${data.nome} | Cargo pretendido: ${data.cargo}
- Nascimento: ${data.nascimento || '[a completar]'} | Telefone: ${data.contacto}
- Email: ${data.email || '[a completar]'} | Localização: ${data.localizacao || 'Moçambique'}
- Línguas: ${data.linguas || 'Português (nativo)'}
- Formação: ${data.formacao}
- Experiência: ${data.experiencia || 'Sem experiência formal prévia'}
- Habilidades técnicas: ${data.habilidades || '[a completar]'}
- Realização de destaque: ${data.exemplo || '[nenhuma fornecida]'}
- Objectivo: ${data.objectivo || '[a completar]'}${ocrBlock}

REGRAS OBRIGATÓRIAS:
1. Use VERBOS DE ACÇÃO no passado com resultados mensuráveis — use os dados de "Realização de destaque" como base real, não invente
2. NUNCA: "profissional dedicado", "trabalho em equipa" sem contexto específico
3. Máximo 2 páginas A4. NUNCA inclua foto, estado civil, religião, filiação política
4. Formação: do mais recente para o mais antigo
5. ${isPrimeiroEmprego ? 'PERFIL PRIMEIRO EMPREGO: enfatize formação, voluntariado, estágios, actividades extra-curriculares e potencial. Use secção "Experiências de Formação / Estágios / Voluntariado"' : 'PERFIL EXPERIENTE: cada cargo com bullets de realizações com impacto mensurável'}
6. Línguas: inclua SEMPRE a secção de línguas com os níveis fornecidos
7. A secção "Realização de destaque" deve ser usada literalmente com os factos concretos fornecidos

ESTRUTURA OBRIGATÓRIA:

# ${data.nome}
**${data.cargo}**
📞 ${data.contacto} | ✉️ ${data.email || '[email]'} | 📍 ${data.localizacao || 'Moçambique'}

---

## Objectivo Profissional
[2-3 frases específicas baseadas em "${data.objectivo || data.cargo}": competência principal + valor concreto que oferece + tipo de organização pretendida]

---

## Formação Académica
[Formate cada entrada: **Grau — Curso** | Instituição | Ano — do mais recente para o mais antigo]

---

## ${isPrimeiroEmprego && !temExperiencia ? 'Experiências de Formação / Estágios / Voluntariado' : 'Experiência Profissional'}
[Para cada cargo/experiência: **Cargo** | Organização | Período — seguido de 2-3 bullets com acções e resultados concretos]

---

## Realização de Destaque
[Expanda e estruture o seguinte exemplo fornecido pelo candidato: "${data.exemplo || 'a preencher'}"]

---

## Competências Técnicas
${data.habilidades || '[ferramentas, software, equipamentos]'}

---

## Línguas
[Formate: Língua — Nível (Nativo / Fluente / Avançado / Intermédio / Básico)]

---

## Referências
Disponíveis mediante solicitação.`;
}

export function buildDataBlock(data) {
  const iniciais = (data.nome || 'CV').split(' ').slice(0,2).map(n => n[0] || '').join('').toUpperCase();
  return `- Nome: ${data.nome || ''}  |  Iniciais: ${iniciais}
- Cargo: ${data.cargo || ''}
- Telefone: ${data.contacto || ''}  |  Email: ${data.email || '[email]'}  |  Localização: ${data.localizacao || 'Moçambique'}
- Nascimento: ${data.nascimento || '[a completar]'}
- Línguas: ${data.linguas || 'Português (nativo)'}
- Formação: ${data.formacao || ''}
- Experiência: ${data.experiencia || 'Sem experiência formal prévia'}
- Habilidades: ${data.habilidades || '[ferramentas, software]'}
- Realização de destaque: ${data.exemplo || '[nenhuma fornecida]'}
- Objectivo: ${data.objectivo || '[a completar]'}
- Perfil: ${data.perfilCV || 'Com Experiência Profissional'}

MAPEAMENTO DE PLACEHOLDERS:
{{INICIAIS}} = ${iniciais}
{{NOME}} = ${data.nome || ''}
{{CARGO}} = ${data.cargo || ''}
{{CONTACTO}} = ${data.contacto || ''}
{{EMAIL}} = ${data.email || '[email]'}
{{LOCALIZACAO}} = ${data.localizacao || 'Moçambique'}
{{OBJECTIVO}} = 2-3 frases baseadas em "${data.objectivo || data.cargo || ''}"
{{FORMACAO}} = elementos <div class="cv-entry"> para cada formação (mais recente primeiro)
{{EXPERIENCIA}} = elementos <div class="cv-entry"> para cada cargo/estágio com bullets de realizações
{{REALIZACAO}} = parágrafo expandindo: "${data.exemplo || 'a completar'}"
{{HABILIDADES}} = texto: ${data.habilidades || ''}
{{HABILIDADES_LIST}} = <li> para cada habilidade de: ${data.habilidades || ''}
{{LINGUAS}} = elementos de língua com barra de progresso (Português nativo=100%, Inglês básico=30%, etc.)
{{EXTRA}} = informação adicional (carta de condução, disponibilidades, publicações)`;
}
