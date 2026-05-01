# Colunas Das Tabelas: Lógica Funcional E Regras De UX

## Objetivo

Este documento descreve a lógica da seção **"Colunas das tabelas"** dentro de `Settings`.

Ela existe para controlar, por tela, duas coisas diferentes:

1. **Quais colunas a tela permite usar**
2. **Quais dessas colunas começam visíveis por padrão**

O objetivo deste texto é servir como base para outra IA ou designer redesenhar a interface sem perder a regra funcional do sistema.

---

## Resumo Rápido

Hoje a seção funciona como uma administração central das colunas da `ProductTable`.

Ela controla três telas:

- `Dashboard`
- `Produtos`
- `Pedidos`

Para cada tela, o administrador define:

- **Colunas liberadas**
- **Padrão visível**

Essas duas camadas não são a mesma coisa.

---

## Modelo Mental Correto

O fluxo lógico da configuração é este:

1. Primeiro a coluna precisa estar **liberada** para a tela.
2. Só depois faz sentido decidir se ela será **visível por padrão**.
3. Se a coluna **não estiver liberada**, ela:
   - não aparece na tabela
   - não aparece no editor de colunas do usuário
   - não pode ser marcada como visível por padrão

Em termos de UX, a interface precisa deixar muito claro que existe:

- uma camada de **permissão**
- uma camada de **estado inicial**

---

## Conceitos

### 1. Coluna liberada

Significa:

- a tela está autorizada a usar essa coluna
- o usuário final pode vê-la na tabela
- o usuário final pode adicioná-la de volta no `Editar colunas`, se ela estiver oculta

Se a coluna não estiver liberada:

- ela fica bloqueada para aquela tela
- desaparece completamente do universo do usuário naquela tela

### 2. Padrão visível

Significa:

- para usuários novos
- ou para usuários sem preferência salva
- essa coluna já começa ligada quando a tela abre

Importante:

- uma coluna pode estar **liberada** e **não** estar no padrão visível
- nesse caso ela continua disponível no editor de colunas do usuário, mas nasce oculta

---

## Telas Administradas Atualmente

Hoje a configuração controla estas chaves de tela:

- `dashboard`
- `products`
- `orders`

Cada uma tem:

- `enabledColumns`
- `defaultVisibleColumns`

Futuramente a mesma estrutura pode receber novas telas, por exemplo:

- `loans`
- outras telas que vierem a usar a `ProductTable`

---

## Colunas Existentes Hoje

Atualmente o catálogo de colunas da `ProductTable` possui:

- `product` → `Produto`
- `code` → `Código`
- `days` → `Dias`
- `level` → `Nível`
- `process` → `Processos`
- `action` → `Ação`
- `hospital` → `Hospital compatível`
- `observation` → `Obs. operacional`

Todas hoje nascem como possíveis candidatas a uso administrativo.

---

## Regra De Coluna Obrigatória

Hoje existe ao menos uma coluna obrigatória:

- `product`

Coluna obrigatória significa:

- não pode ser desabilitada em `Colunas liberadas`
- não pode ser removida de `Padrão visível`
- na prática, ela sempre existe e sempre começa visível

Em UX isso precisa ficar muito explícito:

- o chip pode aparecer marcado e bloqueado
- o texto auxiliar pode dizer `Obrigatória`
- a pessoa precisa entender que aquilo não é um erro, e sim uma restrição do sistema

---

## Estrutura De Dados

### Estrutura global

O sistema guarda uma configuração global assim:

```json
{
  "dashboard": {
    "enabledColumns": ["product", "code", "days", "level"],
    "defaultVisibleColumns": ["product", "days", "level"]
  },
  "products": {
    "enabledColumns": ["product", "code", "days", "level", "observation"],
    "defaultVisibleColumns": ["product", "code", "days", "level"]
  },
  "orders": {
    "enabledColumns": ["product", "code", "days", "level", "action"],
    "defaultVisibleColumns": ["product", "days", "action"]
  }
}
```

### Interpretação

- `enabledColumns` = universo permitido daquela tela
- `defaultVisibleColumns` = subconjunto inicial visível

Regra obrigatória:

- `defaultVisibleColumns` sempre precisa ser subconjunto de `enabledColumns`

---

## Estado Inicial Hoje

Hoje o padrão do sistema é conservador:

- todas as colunas existentes estão **liberadas**
- todas as colunas existentes estão **visíveis por padrão**

Por isso a interface mostra no subtítulo algo como:

- `Atualização: usando padrão`

Esse texto quer dizer:

- ainda não existe uma configuração customizada carregada
- ou a tela está usando a configuração padrão já normalizada pelo sistema

Não quer dizer que a seção esteja desativada.

---

## Como A ProductTable Consome Essa Configuração

Para cada tela que usa `ProductTable`, a tabela recebe:

- `enabledColumns`
- `defaultVisibleColumns`

Depois disso a tabela resolve três camadas:

1. **Administração da tela**
   - o que é permitido existir
2. **Padrão da tela**
   - o que começa ligado
3. **Preferência do usuário**
   - o que esse usuário ocultou, reordenou ou reexibiu manualmente

Ou seja:

- a configuração administrativa define o teto
- a preferência do usuário personaliza apenas dentro desse teto

---

## Relação Entre Configuração Administrativa E Preferência Do Usuário

Esse ponto é o mais importante para o redesign.

### A configuração administrativa é global por tela

Ela vale para a tela inteira e para todos os usuários.

### A preferência do usuário é individual

Ela salva:

- ordem das colunas
- colunas visíveis
- colunas ocultas

Isso é salvo por:

- usuário
- tela

### Precedência

A regra correta é:

1. A administração da tela limita o que pode existir.
2. A preferência do usuário só atua dentro desse conjunto permitido.

### Exemplo

Se o administrador remover `Obs. operacional` da tela `Pedidos`:

- a coluna deixa de aparecer para todos
- mesmo que algum usuário já a tivesse exibido antes

Se depois o administrador liberar a coluna novamente:

- ela volta a existir no universo da tela
- mas não necessariamente volta visível para usuários que já tinham preferência própria salva

Por isso, em UX, é importante comunicar que:

- **Liberar coluna** não é o mesmo que **forçar exibição imediata para todos**
- **Padrão visível** afeta principalmente:
  - usuários novos
  - usuários sem preferência salva

---

## Comportamento Quando O Administrador Clica Nos Chips

Para cada tela existem dois grupos de chips.

### Grupo 1: Colunas liberadas

Cada chip representa se a coluna:

- está `Liberada`
- está `Bloqueada`
- ou é `Obrigatória`

Ao desligar uma coluna liberada:

- ela sai de `enabledColumns`
- ela também sai de `defaultVisibleColumns`, se estiver lá

### Grupo 2: Padrão visível

Cada chip representa se a coluna:

- começa `Visível`
- começa `Oculta`
- está `Indisponível` porque não foi liberada
- ou é `Obrigatória`

Regra:

- só dá para mexer no padrão visível se a coluna estiver liberada

---

## Estados Que A Interface Precisa Representar

O designer precisa prever pelo menos estes estados:

### 1. Coluna liberada e visível por padrão

- estado positivo completo

### 2. Coluna liberada mas oculta por padrão

- disponível para o usuário final
- porém não nasce exibida

### 3. Coluna bloqueada

- fora do universo da tela

### 4. Coluna obrigatória

- ativa
- não editável

### 5. Tela com alterações não salvas

- existe diferença entre o rascunho atual e a configuração persistida

### 6. Salvando

- botões precisam refletir isso

### 7. Padrão restaurado, mas ainda não salvo

- importante porque `Restaurar padrão` hoje apenas carrega o rascunho
- a alteração só passa a valer depois de `Salvar colunas`

---

## Ações Da Seção

### Recarregar colunas

Função:

- buscar novamente a configuração persistida
- descartar a leitura local temporária da tela, se necessário

### Restaurar padrão das colunas

Função:

- voltar o rascunho para o padrão do sistema
- não salva automaticamente

### Salvar colunas

Função:

- persistir a configuração atual
- fazer com que as telas passem a usar essa nova regra

---

## Persistência

Essa configuração é salva em uma configuração central do sistema com a chave:

- `product_table_screen_columns`

Isso significa:

- não é uma preferência local de navegador
- não é uma preferência individual do usuário
- é uma regra administrativa global

Em UX isso sugere que a seção tenha cara de:

- configuração estrutural
- impacto em várias telas
- efeito compartilhado por toda a aplicação

---

## O Que A Seção Não Faz

Ela **não** controla:

- os filtros de negócio da tela
- a lógica operacional dos dados
- a ordenação padrão do usuário
- a busca
- a paginação
- colunas de tabelas que ainda não usam `ProductTable`

Ela controla apenas:

- disponibilidade da coluna por tela
- visibilidade inicial por tela

---

## Regras De Normalização

Mesmo que a interface envie algo inconsistente, o sistema normaliza.

Exemplos:

- colunas desconhecidas são descartadas
- duplicatas são removidas
- coluna obrigatória volta automaticamente
- `defaultVisibleColumns` fora de `enabledColumns` são removidas

Para o designer isso significa:

- a UX pode ser mais livre visualmente
- mas deve tentar evitar combinações inválidas antes do envio

---

## Implicações Diretas Para O Design

### A separação entre os dois níveis precisa ser muito clara

O maior risco de UX aqui é a pessoa achar que:

- `Liberada` = já visível para todo mundo

ou

- `Padrão visível` = permissão de uso

Essas duas leituras estão erradas.

### A interface ideal precisa transmitir uma hierarquia

Boa hierarquia:

1. Escolher quais colunas a tela permite usar
2. Entre as permitidas, escolher as que nascem ligadas

### Chips funcionam, mas não são a única opção

Outra IA pode explorar, por exemplo:

- lista em duas colunas com `Disponíveis` e `Padrão`
- tabela matriz por tela
- card por tela com duas listas
- accordions por tela
- drag and drop futuro

Desde que preserve a lógica acima.

---

## Sugestões De Estados Visuais

### Para `Colunas liberadas`

- `Liberada`: estado ativo
- `Bloqueada`: estado neutro/inativo
- `Obrigatória`: estado ativo com cadeado ou badge de restrição

### Para `Padrão visível`

- `Visível`: estado positivo
- `Oculta`: estado neutro
- `Indisponível`: estado desabilitado
- `Obrigatória`: estado ativo + bloqueado

### Para feedback geral

- aviso de `alterações pendentes`
- confirmação de `salvo`
- alerta de `falha ao carregar`
- alerta de `falha ao salvar`

---

## Casos De Uso Reais

### Caso 1

Quero que `Obs. operacional` exista na tela de `Produtos`, mas não apareça para todo mundo logo de início.

Configuração:

- `Liberada`: sim
- `Padrão visível`: não

Resultado:

- usuário pode adicionar depois em `Editar colunas`
- mas a coluna nasce oculta

### Caso 2

Quero impedir totalmente a coluna `Hospital compatível` em `Pedidos`.

Configuração:

- `Liberada`: não

Resultado:

- a coluna desaparece da tela
- desaparece do editor de colunas do usuário
- também deixa de poder ser marcada como visível por padrão

### Caso 3

Quero restaurar a configuração original.

Ação:

- `Restaurar padrão das colunas`
- depois `Salvar colunas`

Resultado:

- volta para o conjunto padrão definido pelo sistema

---

## O Que Uma IA De Design Deve Considerar

Se esse documento for entregue para outra IA para redesenho, ela precisa saber que:

- existe uma lógica de **duas etapas**
- existe distinção entre **regra global** e **preferência individual**
- existem **colunas obrigatórias**
- existe **persistência global da configuração**
- a seção precisa funcionar bem mesmo quando houver mais telas no futuro

Em outras palavras, o redesign ideal deve ser:

- escalável
- muito claro semanticamente
- bom para 3 telas hoje
- bom para 6 ou mais telas no futuro

---

## Recomendação De Arquitetura Visual

Se fosse desenhar do zero com foco em clareza, a melhor estrutura provavelmente seria:

1. **Card por tela**
2. Dentro de cada card:
   - bloco `Colunas liberadas`
   - bloco `Padrão visível`
3. Cada bloco com o mesmo catálogo de colunas
4. Estados muito claros para:
   - ativa
   - inativa
   - desabilitada
   - obrigatória
5. Rodapé com:
   - `Restaurar padrão`
   - `Salvar`

Essa é a estrutura mais fiel ao comportamento atual.

---

## Resumo Final

A lógica da seção é:

- **Liberada** define se a coluna pode existir naquela tela.
- **Padrão visível** define se ela já começa ligada para quem não personalizou a tabela.
- **Obrigatória** significa que a coluna não pode ser removida.
- **Preferência do usuário** vem depois e só atua dentro do conjunto permitido pela administração.

Se a nova interface preservar essas quatro regras, o redesign pode ser feito com liberdade visual sem quebrar o comportamento funcional.
