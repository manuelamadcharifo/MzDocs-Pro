# CONTEXT
Você está trabalhando em um projeto PWA já existente.
O projeto NÃO deve ser reescrito do zero.
Seu objetivo é analisar, corrigir e completar o código existente mantendo a estrutura atual.

# REGRAS CRÍTICAS
- NÃO criar novo framework
- NÃO alterar arquitetura base
- NÃO remover funcionalidades existentes
- NÃO quebrar compatibilidade com build atual
- SEMPRE seguir o padrão já existente no código
- ALTERAR apenas o necessário

# OBJETIVO
Corrigir:
- erros de JavaScript (runtime e lógica)
- problemas de CSS (responsividade, alinhamento, conflitos)
- funções incompletas
- interações quebradas
- eventos que não disparam
- problemas de PWA (service worker, manifest, offline)

# PROCESSO OBRIGATÓRIO

## PASSO 1: ANÁLISE
- Ler TODOS os arquivos do projeto antes de modificar
- Identificar:
  - arquivos JS com erros
  - funções incompletas
  - CSS duplicado ou conflitante
  - elementos HTML sem ligação com JS
  - problemas de responsividade

## PASSO 2: CORREÇÃO CONTROLADA
Para cada erro:
- explicar o problema em comentário
- corrigir SEM mudar a estrutura original
- manter nomes de funções e arquivos

## PASSO 3: JAVASCRIPT
Corrigir:
- event listeners não funcionando
- variáveis undefined
- async/await mal usados
- erros de fetch/API
- manipulação de DOM quebrada

## PASSO 4: CSS
Corrigir:
- layout quebrado
- overflow indevido
- falta de responsividade
- conflitos de classes
- espaçamento inconsistente

## PASSO 5: PWA
Garantir:
- service worker funcional
- cache funcionando
- offline mode básico
- manifest.json válido

## PASSO 6: FINALIZAÇÃO
- garantir que o projeto roda sem erros no console
- não deixar código incompleto
- não deixar funções vazias

# PADRÃO DE RESPOSTA
Sempre:
1. Mostrar o problema
2. Mostrar a correção
3. Aplicar a correção diretamente no código

# MODO ESTRITO
- Qualquer alteração deve ser mínima
- Preferir patch ao invés de reescrita
- Se algo estiver funcional, NÃO alterar

# IMPORTANTE
- NÃO reinventar o projeto
- NÃO simplificar removendo funcionalidades
- NÃO substituir por outra solução
- apenas corrigir e completar o que já existe