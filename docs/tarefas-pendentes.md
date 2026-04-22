# Tarefas Pendentes

Documento vivo para registrar melhorias aprovadas como ideia, mas ainda não implementadas.

Status por item: `[ ]` pendente · `[~]` em andamento · `[x]` concluído · `[-]` descartado.

---

## 1. Exclusões

### [ ] 1.1 Exceções para exclusões automáticas

**Contexto**

A opção **Ocultar itens com consumo mensal menor que 1** pode ocultar itens que ainda estão em fase de cadastro, implantação ou consumo inicial. Esses itens podem ter CMM baixo temporariamente, mas ainda precisam aparecer no app até terem histórico suficiente.

**Proposta**

Na tela **Excluir**, dentro do bloco **Exclusões automáticas**, adicionar um botão para abrir uma tela sobreposta com gerenciamento de exceções.

Nome sugerido do botão: **Gerenciar exceções**

**Tela sobreposta**

- Abrir como modal, painel lateral ou tela por cima da tela atual.
- Exibir uma lista de itens candidatos à exclusão automática.
- Permitir pesquisa por número MV, nome ou código.
- Permitir filtro por classificação.
- Mostrar, no mínimo:
  - número MV
  - nome do item
  - CMM
  - estoque atual
  - classificação
- Permitir selecionar itens que devem ser exceção da regra automática.
- Permitir remover itens da lista de exceções.
- Deixar claro que a exceção não apaga dado do banco; ela só impede que o item seja ocultado pela regra automática.

**Comportamento esperado**

- Se a regra **Ocultar itens com consumo mensal menor que 1** estiver ligada, itens com CMM menor que 1 continuam ocultos.
- Se um item estiver cadastrado como exceção, ele continua aparecendo no app mesmo com CMM menor que 1.
- A exceção deve valer apenas para a regra automática de CMM menor que 1.
- A blacklist manual por código continua funcionando separadamente.

**Pendências técnicas**

- Definir onde persistir as exceções: nova tabela ou expansão da tabela de exclusões existente.
- Definir se a exceção será global ou apenas HMSA.
- Ajustar a pipeline em `data.ts` para respeitar a lista de exceções antes de aplicar o filtro automático.
- Atualizar `almox-provider.tsx` para carregar, salvar e invalidar cache quando exceções mudarem.
- Criar testes ou validação manual para garantir que exceções não afetem exclusões manuais.

---

## 2. Dashboard

### [ ] 2.1 Mover visão por hospital para o cabeçalho

**Contexto**

Hoje a **Visão por hospital** aparece na parte principal do dashboard. A ideia é deixar essa seleção no cabeçalho, junto dos controles principais, para funcionar de forma parecida com o filtro de **Classificação**.

**Proposta**

Remover a seção **Visão por hospital** da área principal do dashboard e transformar essa escolha em um controle no cabeçalho.

O controle deve ficar no botão/filtro de **Base**, onde hoje existe a seleção **Todos**.

**Comportamento esperado**

- O filtro de base deve permitir escolher o hospital/unidade visualizada.
- O comportamento deve ser parecido com o filtro de **Classificação**.
- A base de entrada padrão deve vir selecionada como **HMSA**.
- O usuário ainda deve conseguir alternar para **Todos** ou outras unidades, se disponível.
- A mudança deve afetar os KPIs, listas e gráficos do dashboard de forma consistente.

**Pendências técnicas**

- Localizar a implementação atual da seção **Visão por hospital** no dashboard.
- Remover a seção da área principal sem perder a informação funcional.
- Adaptar o cabeçalho/filtro de **Base** para receber a seleção de hospital.
- Definir estado padrão como **HMSA**.
- Garantir que a seleção aplicada no cabeçalho recalcula os dados exibidos no dashboard.
- Validar visualmente em desktop e mobile para evitar sobrecarga no cabeçalho.

---

## 3. Parâmetros

### [ ] 3.1 Validar quantidade de empréstimo com cobertura mínima da unidade doadora

**Contexto**

O parâmetro já existe na tela de configurações como **Depois de emprestar, deve ficar com** (`pisoDoadorAposEmprestimoDias`), com valor padrão de `100 dias`.

No cálculo atual, o campo **Quanto o HMSA deve pegar emprestado** já considera o quanto a unidade doadora pode emprestar sem cair abaixo desse piso.

**Proposta**

Manter o parâmetro atual e revisar apenas a clareza da tela, dos tooltips e dos testes manuais para deixar explícito que a quantidade que o HMSA deve receber já protege a unidade doadora.

**Comportamento esperado**

- O sistema calcula quanto a unidade doadora pode emprestar sem cair abaixo de 100 dias de suficiência.
- A quantidade sugerida para o HMSA deve respeitar esse limite.
- Se a unidade doadora não consegue manter 100 dias após emprestar, ela não deve aparecer como origem recomendada.
- Se houver mais de uma unidade possível, priorizar a que consegue ajudar melhor sem comprometer sua própria cobertura.

**Pendências técnicas**

- Revisar se `data.ts` cobre todos os cenários de borda ao limitar a quantidade sugerida pelo estoque que sobra acima do piso.
- Revisar os textos da UI para deixar claro que a quantidade sugerida já protege a unidade doadora.
- Testar com cenários em que a unidade doadora tem pouco excedente acima de 100 dias.
