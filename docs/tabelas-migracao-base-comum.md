# Mapeamento de Tabelas e Migração para Base Comum

## Objetivo

Mapear quais telas ainda usam grade própria, quais já usam o componente compartilhado e quais valem migrar para uma base comum.

## Situação Atual

### Já usam `ProductTable`

- `Dashboard`
  - Arquivo: `src/features/almox/screens/dashboard-screen.tsx`
  - Uso atual: lista principal de produtos por hospital/faixa
  - Situação: boa aderência ao componente compartilhado

- `Produtos`
  - Arquivo: `src/features/almox/screens/products-screen.tsx`
  - Uso atual: carteira completa filtrada
  - Situação: boa aderência ao componente compartilhado

### Tabelas próprias ainda ativas

- `Consumo`
  - Arquivo: `src/features/almox/screens/consumo-screen.legacy.tsx`
  - Tem: scroll horizontal sticky, edição de colunas, ordenação por cabeçalho, busca no título
  - Situação: já virou praticamente uma tabela genérica paralela ao `ProductTable`

- `Empréstimos`
  - Arquivo: `src/features/almox/screens/loans-screen.tsx`
  - Tem duas tabelas: `NeedTable` e `LendTable`
  - Situação: usa estrutura manual simples com `ScrollView horizontal`

- `Pedidos`
  - Arquivo: `src/features/almox/screens/orders-screen.tsx`
  - Tem tabela repetida por nível dentro de `LevelSection`
  - Situação: estrutura manual simples e previsível

- `Notas fiscais`
  - Arquivo: `src/features/almox/screens/invoices-screen.tsx`
  - Tem pelo menos duas grades:
    - lista de notas
    - lista de itens da nota selecionada
  - Situação: tabela manual com seleção de linha e detalhe mestre-detalhe

- `Processos`
  - Arquivo: `src/features/almox/screens/processes-screen.tsx`
  - Tem tabela própria com célula rica, timeline de parcelas e ações por linha
  - Situação: altamente especializada

### Estruturas de lista que não valem tratar como `ProductTable`

- `Blacklist`
  - Arquivo: `src/features/almox/screens/blacklist-screen.tsx`
  - Predomina lista/cartão e modal de exceções, não uma grade analítica clássica

- `Configurações`
  - Arquivo: `src/features/almox/screens/settings-screen.tsx`
  - Estrutura de formulário, não tabela operacional

## Avaliação por Tela

### 1. `Consumo`

**Prioridade: muito alta**

Motivo:
- já implementa quase todos os recursos que viraram padrão visual
- hoje duplica muita infraestrutura do `ProductTable`
- é a melhor candidata para extrair uma base comum de verdade

Recomendação:
- não migrar `Consumo` para `ProductTable`
- extrair uma base mais neutra, algo como `DataTableShell` ou `AnalyticalTableBase`
- depois usar essa base tanto em `Consumo` quanto em outras telas tabulares

### 2. `Empréstimos`

**Prioridade: alta**

Motivo:
- estrutura de colunas simples
- duas tabelas muito parecidas
- potencial claro de ganhar:
  - sticky header
  - ordenação por cabeçalho
  - barra horizontal fixa
  - edição de colunas

Recomendação:
- migrar para a futura base comum genérica
- manter schema de colunas separado para `need` e `lend`

### 3. `Pedidos`

**Prioridade: alta**

Motivo:
- tabela simples
- repetição por nível usando o mesmo layout
- baixo risco de migração

Recomendação:
- migrar para base comum genérica
- manter agrupamento por nível fora da tabela
- cada grupo renderiza a mesma tabela base com colunas fixas

### 4. `Notas fiscais`

**Prioridade: média**

Motivo:
- tem ganhos claros de UX com cabeçalho sticky e ordenação
- mas é mais complexa por causa do fluxo mestre-detalhe e linha selecionável

Recomendação:
- migrar só depois de `Consumo`, `Empréstimos` e `Pedidos`
- usar a base comum para:
  - lista principal de notas
  - tabela de itens da nota
- manter seleção e detalhe no screen

### 5. `Processos`

**Prioridade: baixa para migração total**

Motivo:
- linha é muito específica
- timeline de parcelas, badges de situação, ações ricas e comportamento próprio
- o custo de encaixar no mesmo componente tende a ser maior que o ganho

Recomendação:
- não tentar migrar para `ProductTable`
- no máximo reaproveitar uma base leve de infraestrutura:
  - scroll horizontal sticky
  - cabeçalho fixo
  - barra horizontal inferior
  - maybe sorting helper
- manter `ProcessTable` como componente especializado

## Conclusão Arquitetural

Hoje existem dois mundos:

- `ProductTable`
  - bom para listas de produtos com semântica fixa

- tabelas manuais de outras telas
  - cada uma resolveu o problema localmente

O melhor próximo passo não é forçar tudo para `ProductTable`.

O melhor próximo passo é criar uma **base comum mais neutra**, por exemplo:

- `DataTableShell`
  - sticky header
  - scroll horizontal sincronizado
  - barra horizontal fixa
  - layout base de header/body/footer
  - slot para toolbar

- `DataTableHeader`
  - ordenação
  - divisórias
  - ações de coluna

- `useColumnLayout`
  - persistência
  - visíveis/ocultas
  - reorder

Depois disso:

1. `Consumo` vira o primeiro consumidor da base comum
2. `Empréstimos` entra em seguida
3. `Pedidos` entra depois
4. `Notas fiscais` vem na sequência
5. `Processos` só reaproveita infraestrutura, sem migração total

## Ordem Recomendada

1. Extrair base comum a partir de `Consumo`
2. Migrar `Empréstimos`
3. Migrar `Pedidos`
4. Migrar `Notas fiscais`
5. Revisar se `Processos` deve só reaproveitar shell/scroll

## Resumo Executivo

- `Dashboard` e `Produtos`: já estão no caminho certo com `ProductTable`
- `Consumo`: melhor ponto de partida para extrair a base comum
- `Empréstimos` e `Pedidos`: migração com melhor relação ganho/esforço
- `Notas fiscais`: vale, mas depois
- `Processos`: manter especializado
