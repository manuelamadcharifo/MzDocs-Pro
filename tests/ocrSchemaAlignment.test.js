// tests/ocrSchemaAlignment.test.js
//
// Formaliza, como teste automatizado, a verificação manual feita ao
// corrigir o bug em que a IA de OCR extraía 95% de confiança de uma
// imagem mas só preenchia 3 dos ~9 campos do formulário (Carta de
// Recomendação e outros 5 serviços tinham ids completamente divergentes
// entre o schema de extracção e o formulário real).
//
// Sem este teste, uma alteração futura a um dos dois ficheiros (adicionar
// um campo ao formulário, ou renomear um id no schema OCR) pode
// reintroduzir o mesmo bug silenciosamente — applyToForm() falha em
// silêncio quando document.getElementById(id) não encontra nada, sem
// nenhum erro visível ao desenvolvedor.
//
// Os módulos reais (ServiceDefinitions.js, SmartOCRService.js) são
// ficheiros ES module (`export class`/`export const`) que este projecto
// não consegue importar directamente no Jest sem configuração adicional
// de Babel — em vez disso, extraem-se os ids por parsing de texto, a
// mesma técnica usada manualmente durante a investigação original.

const fs = require('fs');
const path = require('path');

const SERVICE_DEFINITIONS_PATH = path.join(__dirname, '../assets/js/services/ServiceDefinitions.js');
const SMART_OCR_PATH           = path.join(__dirname, '../assets/js/services/SmartOCRService.js');

function extractFormFieldIds(content) {
  const services = {};
  const serviceRegex = /^  (\w+): \{/gm;
  const positions = [];
  let match;
  while ((match = serviceRegex.exec(content)) !== null) {
    positions.push({ name: match[1], start: match.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const { name, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : content.length;
    const block = content.slice(start, end);
    const fieldsMatch = block.match(/fields:\s*\[([\s\S]*?)\n    \],/);
    if (!fieldsMatch) continue;
    const ids = [...fieldsMatch[1].matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);
    services[name] = ids;
  }
  return services;
}

function extractOcrSchemaIds(content) {
  const services = {};
  const sMatch = content.match(/_getFieldSchema\(serviceType\) \{\s*const S = \{([\s\S]*?)\n    \};\s*\n    return S\[serviceType\]/);
  if (!sMatch) throw new Error('Não foi possível localizar _getFieldSchema em SmartOCRService.js — o ficheiro pode ter sido reestruturado; actualize o regex deste teste.');
  const serviceRegex = /(\w+):\s*\[([\s\S]*?)\n      \],/g;
  let match;
  while ((match = serviceRegex.exec(sMatch[1])) !== null) {
    const ids = [...match[2].matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);
    services[match[1]] = ids;
  }
  return services;
}

describe('Alinhamento entre formulário real e schema de extracção OCR', () => {
  const formFields = extractFormFieldIds(fs.readFileSync(SERVICE_DEFINITIONS_PATH, 'utf-8'));
  const ocrFields  = extractOcrSchemaIds(fs.readFileSync(SMART_OCR_PATH, 'utf-8'));

  // Serviços sem formulário com IA (impressão, foto, conversão) não têm
  // schema OCR — isso é esperado, não testado aqui.
  const servicesWithOcr = Object.keys(ocrFields);

  test('todos os serviços com schema OCR existem em ServiceDefinitions.js', () => {
    for (const service of servicesWithOcr) {
      expect(formFields).toHaveProperty(service);
    }
  });

  test.each(servicesWithOcr)('%s: todo id usado no schema OCR existe no formulário real', (service) => {
    const realIds = formFields[service] || [];
    const idsOnlyInOcr = ocrFields[service].filter(id => !realIds.includes(id));
    expect(idsOnlyInOcr).toEqual([]);
  });

  test.each(servicesWithOcr)('%s: nenhum campo do formulário ficou de fora do schema OCR', (service) => {
    const realIds = formFields[service] || [];
    const missingFromOcr = realIds.filter(id => !ocrFields[service].includes(id));
    expect(missingFromOcr).toEqual([]);
  });
});
