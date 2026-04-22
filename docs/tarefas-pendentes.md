# Tarefas Pendentes

Documento vivo para registrar melhorias aprovadas como ideia, mas ainda não implementadas.

Status por item: `[ ]` pendente · `[~]` em andamento · `[x]` concluído · `[-]` descartado.

---

## 1. Exclusões

### [x] 1.1 Exceções para exclusões automáticas

**Contexto**

A opção **Ocultar itens com consumo mensal menor que 1** pode ocultar itens que ainda estão em fase de cadastro, implantação ou consumo inicial. Esses itens podem ter CMM baixo temporariamente, mas ainda precisam aparecer no app até terem histórico suficiente.

**Proposta**

Na tela **Excluir**, dentro do bloco **Exclusões automáticas**, adicionar um botão para abrir uma tela sobreposta com gerenciamento de exceções.

Nome sugerido do botão: **Gerenciar exceções**

**Decisão implementada**

- As exceções foram separadas da blacklist manual em uma tabela própria: `public.almox_excecoes_cmm_hmsa`.
- A exceção vale apenas para a regra automática **Ocultar itens com consumo mensal menor que 1**.
- A exceção foi aplicada para itens do HMSA.
- A blacklist manual continua tendo prioridade: se o item estiver bloqueado manualmente, ele continua oculto mesmo que exista exceção de CMM.
- A tela mostra candidatos vindos da base atual do HMSA com CMM menor que 1.

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

- [x] Definir onde persistir as exceções: nova tabela `public.almox_excecoes_cmm_hmsa`.
- [x] Definir se a exceção será global ou apenas HMSA: apenas HMSA nesta etapa.
- [x] Ajustar a pipeline em `data.ts` para respeitar a lista de exceções antes de aplicar o filtro automático.
- [x] Atualizar `almox-provider.tsx` para carregar, salvar e invalidar cache quando exceções mudarem.
- [x] Criar tela sobreposta para pesquisar, filtrar por classificação e marcar/remover exceções.
- [x] Validar que exceções não reativam itens removidos pela blacklist manual.

---

## 2. Dashboard

### [x] 2.1 Mover visão por hospital para o cabeçalho

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

### [x] 2.2 Remover "Acima da faixa" da tela Dashboard

**Contexto**

O item **Acima da faixa** aparece nos cards de inteligência do dashboard, mas a regra foi simplificada para usar o mesmo limite de **Pode emprestar quando tiver**. Como leitura separada, ele pode ficar redundante.

**Proposta**

Remover o item **Acima da faixa** da tela Dashboard.

**Comportamento esperado**

- O dashboard deixa de exibir o card/aba **Acima da faixa**.
- A informação de estoque com folga deve continuar acessível em locais mais apropriados, como listas de empréstimos ou produtos.
- A remoção não deve afetar o cálculo de **Pode emprestar**.

**Pendências técnicas**

- Remover o card de inteligência `Acima da faixa` de `dashboard-screen.tsx`.
- Avaliar se `intelligenceDetails.idle_items` ainda é necessário em `data.ts`.
- Garantir que nenhum painel fique com estado inicial apontando para um card removido.
- Validar visualmente o dashboard após a remoção.

### [x] 2.3 Melhorar apresentação da origem e atualização dos dados

**Contexto**

As informações abaixo aparecem com texto longo e redundante:

- `Base operacional conectada ao Supabase. Última importação com mudança: ... Última leitura do app: ...`
- `Origem dos dados`
- `Indicadores calculados a partir da importação mais recente do SISCORE já persistida no banco.`

**Proposta**

Trocar esses textos por uma apresentação mais objetiva, visual e escaneável.

**Comportamento esperado**

- Mostrar origem, última importação e última leitura sem ocupar tanto espaço.
- Evitar repetir a mesma informação no subtítulo do dashboard e no banner.
- Usar uma linha compacta, badge ou bloco pequeno de status.
- Deixar claro para o usuário se ele está vendo dados recentes, cache local ou base em sincronização.

**Pendências técnicas**

- Revisar `PageHeader.subtitle` do dashboard.
- Revisar/remover o banner **Origem dos dados**.
- Definir um componente compacto para status da base.
- Validar texto em desktop e mobile.

---

## 3. Parâmetros

### [-] 3.1 Validar quantidade de empréstimo com cobertura mínima da unidade doadora

**Contexto**

O parâmetro já existe na tela de configurações como **Depois de emprestar, deve ficar com** (`pisoDoadorAposEmprestimoDias`), com valor padrão de `100 dias`.

No cálculo atual, o campo **Quanto o HMSA deve pegar emprestado** já considera o quanto a unidade doadora pode emprestar sem cair abaixo desse piso.

**Decisão**

Descartada como tarefa separada. O parâmetro já existe e a regra já considera a cobertura mínima da unidade doadora. A clareza desse comportamento deve ser tratada dentro dos textos, validações e organização do bloco **Do HMSA para Demais Unidades**.

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

### [x] 3.2 Ajustar bloco "Do HMSA para Demais Unidades"

**Contexto**

O subgrupo **Estoque com folga** em Parâmetros pode ficar mais claro se o nome indicar o fluxo real: itens saindo do HMSA para ajudar outras unidades.

**Proposta**

Renomear o subgrupo **Estoque com folga** para **Do HMSA para Demais Unidades**.

Adicionar nesse subgrupo o parâmetro:

- **Depois de emprestar, deve ficar com**

**Comportamento esperado**

- O usuário entende que esse bloco trata do HMSA como unidade doadora.
- O parâmetro define a cobertura mínima que o HMSA deve manter depois de emprestar para outra unidade.
- A regra deve ficar separada da regra usada quando outra unidade empresta para o HMSA.

**Pendências técnicas**

- Verificar se o parâmetro atual `pisoDoadorAposEmprestimoDias` deve ser reutilizado ou se será necessário criar um parâmetro específico para HMSA como doador.
- Ajustar textos e helpers em `settings-screen.tsx`.
- Ajustar cálculo da lista de itens que o HMSA pode emprestar, se necessário.
- Atualizar documentação em `settings-parametros.md`.

### [ ] 3.3 Dividir tela de Parâmetros por classificação

**Contexto**

Alguns usuários são responsáveis por classificações específicas. A tela de parâmetros precisa refletir essa divisão para evitar ajustes globais indevidos.

**Proposta**

Dividir a tela de Parâmetros por classificação.

**Comportamento esperado**

- O usuário consegue visualizar e editar parâmetros por classificação.
- A classificação selecionada deve deixar claro quais regras estão sendo editadas.
- Deve existir comportamento padrão para classificações sem configuração específica.

**Pendências técnicas**

- Definir quais classificações terão parâmetros próprios.
- Ajustar modelo de persistência para suportar configuração por classificação.
- Ajustar leitura no `almox-provider.tsx` e cálculo em `data.ts`.
- Garantir fallback para parâmetros globais.

---

## 4. Listas e Tabelas

### [x] 4.1 Configurar quantidade de itens por página nas listas

**Contexto**

As listas de Produtos, Empréstimos, Pedidos e outras telas precisam permitir controlar quantos itens aparecem por página.

**Proposta**

Adicionar, no final das listas, uma opção para configurar a quantidade de produtos/itens visualizados por página.

Decisão inicial: manter a escolha apenas local na tela nesta etapa. Persistência por usuário pode ser revisada futuramente junto com permissões/preferências.

**Comportamento esperado**

- Usuário escolhe a quantidade de itens por página.
- A escolha aparece no rodapé da lista.
- A tela preserva busca, filtros e paginação de forma consistente.
- Aplicar pelo menos em:
  - Produtos
  - Empréstimos
  - Pedidos
  - Itens acima do consumo médio

**Pendências técnicas**

- [x] Identificar componentes de lista existentes.
- [x] Definir opções padrão: 10, 25, 50, 100 e 500.
- [x] Permitir que o usuário digite um valor personalizado entre 1 e 500 itens por página.
- [x] Criar controle reutilizável de rodapé para paginação.
- [x] Aplicar em Produtos, Empréstimos, Pedidos e Consumo do mês.
- [-] Persistência por usuário descartada nesta etapa; reavaliar em uma futura tarefa de preferências por usuário.

### [ ] 4.2 Permitir adicionar ou ocultar colunas nas listas

**Contexto**

As listas possuem muitas informações possíveis, mas nem sempre todas são úteis para todos os usuários.

**Proposta**

Adicionar opção para mostrar ou ocultar colunas nas listas.

**Comportamento esperado**

- Usuário consegue selecionar quais colunas aparecem.
- Configuração deve valer por tela/lista.
- Aplicar pelo menos em:
  - Produtos
  - Empréstimos
  - Pedidos
  - Itens acima do consumo médio

**Pendências técnicas**

- Mapear colunas disponíveis por tela.
- Criar componente de configuração de colunas.
- Definir se a preferência será local ou persistida por usuário.
- Garantir exportação coerente quando houver colunas ocultas.

### [x] 4.3 Revisar status da tela Pedidos

**Contexto**

A tela de Pedidos usa uma classificação de status que precisa ser revista. Provavelmente será melhor alinhar com os níveis já usados no dashboard e na lista de produtos: **Urgente, Crítico, Alto, Médio, Baixo, Estável**.

**Proposta**

Rever e documentar como o status atual da tela Pedidos funciona. Depois, avaliar troca de **Status** para **Nível**, seguindo o mesmo padrão da tela Produtos.

**Comportamento esperado**

- Explicar claramente como o status atual é calculado.
- Decidir se será substituído por **Nível**.
- Se alterado, manter consistência visual com Dashboard e Produtos.

**Pendências técnicas**

- Localizar a regra atual em `orders-screen.tsx` e `data.ts`.
- Documentar o cálculo atual antes de alterar.
- Propor mapeamento para os níveis existentes.
- Validar impacto em filtros, exportação e textos da tela.

### [ ] 4.4 Revisar dados da tela "Produtos HMSA acima do consumo médio"

**Contexto**

A tela/lista de **Produtos HMSA que já ultrapassaram o consumo médio mensal antes do mês terminar** precisa ser revisada para garantir que os dados usados estejam corretos, bem gravados e consultados da forma mais eficiente.

A intenção é ter uma tela confiável para identificar itens do HMSA cujo consumo acumulado no mês já passou do consumo médio mensal esperado, mesmo antes do fechamento do mês. Isso ajuda a antecipar investigação, reposição, redistribuição ou correção de consumo atípico.

**Proposta**

Revisar todo o fluxo de gravação, cálculo e pesquisa dos dados usados nessa tela.

O objetivo é entender:

- de onde vem o consumo acumulado do mês;
- onde esse consumo é gravado;
- como o consumo médio mensal é calculado ou importado;
- qual data de referência está sendo usada;
- se a comparação considera apenas HMSA;
- se a tela está consultando dados prontos do banco ou recalculando no frontend;
- se existem leituras ou cálculos desnecessários.

**Comportamento esperado**

- A tela mostra apenas produtos do HMSA.
- O produto aparece quando o consumo acumulado do mês já passou o consumo médio mensal antes do mês terminar.
- A comparação deve ser clara para o usuário: consumo do mês até agora versus consumo médio mensal.
- Deve haver informação suficiente para análise, como produto, classificação, CMM, consumo acumulado no mês, percentual consumido, estoque atual e suficiência.
- A data de referência da apuração deve ficar clara.
- A consulta deve evitar processamento pesado no frontend quando o banco puder entregar a lista pronta.

**Pendências técnicas**

- Mapear as tabelas, views ou snapshots usados para calcular consumo mensal.
- Revisar `public.almox_consumo_mes_atual` e confirmar se atende ao comportamento esperado.
- Confirmar se o cálculo usa snapshots diários, entradas, saídas ou diferença de estoque.
- Conferir se o filtro por HMSA é aplicado na origem dos dados ou apenas na tela.
- Verificar se produtos novos, produtos sem CMM e produtos com estoque zerado precisam de tratamento especial.
- Avaliar criação de uma view/API específica para a tela, já trazendo ranking e percentuais calculados.
- Revisar a tela atual para garantir busca, filtro por classificação e paginação.
- Definir texto de ajuda simples explicando a regra sem termos técnicos.

---

## 5. Permissões e Acesso

### [ ] 5.1 Limitar edição de configurações e exclusões por usuário e classificação

**Contexto**

Determinados usuários ficam responsáveis por determinadas classificações. As telas de **Parâmetros** e **Excluir** devem limitar o que cada usuário pode alterar conforme sua responsabilidade por classificação.

Essa regra também se aplica às exclusões automáticas e exceções, porque elas podem afetar apenas uma classificação específica, como **Material Hospitalar** ou **Farmacológico**.

**Proposta**

Criar controle de permissão para definir quais usuários podem alterar configurações, exclusões e exceções por classificação.

Exemplos:

- usuário responsável por **Material Hospitalar** pode alterar parâmetros, exclusões e exceções hospitalares;
- usuário responsável por **Farmacológico** pode alterar parâmetros, exclusões e exceções farmacológicas;
- usuários sem permissão podem visualizar, mas não editar;
- **hugorwagemacher** mantém acesso total para liberar ou revogar permissões.

**Comportamento esperado**

- Usuários só editam parâmetros das classificações permitidas.
- Usuários só criam/removem exclusões e exceções das classificações permitidas.
- Campos, botões e ações sem permissão ficam bloqueados ou somente leitura.
- Tentativas de alteração sem permissão também devem ser bloqueadas no backend/API.
- Deve existir uma tela de liberação de acesso para configurar permissões por usuário e classificação.
- Apenas o usuário **hugorwagemacher** deve ter acesso inicial a essa tela de permissões.
- Permissão por configuração específica só deve ser usada se alguma regra não tiver classificação clara.

**Pendências técnicas**

- Criar modelo de permissões por usuário e classificação.
- Criar tela de permissões/acessos.
- Restringir edição na tela de Settings/Parâmetros.
- Restringir edição na tela Excluir, incluindo blacklist manual, exclusões automáticas e exceções de CMM.
- Ajustar APIs para validar permissões por classificação antes de salvar alterações.
- Definir fallback para configurações globais sem classificação.
- Registrar auditoria de quem alterou cada configuração, exclusão ou exceção.
- Registrar usuário administrador inicial: `hugorwagemacher`.

### [ ] 5.2 Limitar acesso à tela OPME

**Contexto**

A tela OPME deve ser acessível apenas para usuários autorizados.

**Proposta**

Adicionar controle de permissão para a tela OPME, configurável na mesma tela de permissões.

**Comportamento esperado**

- Usuários sem permissão não acessam OPME.
- O acesso a OPME pode ser atribuído ou removido pela tela de permissões.
- Apenas **hugorwagemacher** deve ter acesso inicial para configurar essas liberações.

**Pendências técnicas**

- Adicionar permissão específica para OPME.
- Aplicar bloqueio na navegação e na rota.
- Mostrar estado de acesso negado quando necessário.
- Integrar com a futura tela de permissões.

### [-] 5.3 Liberar edição por configuração específica

**Contexto**

Além de controlar quem acessa a tela de Parâmetros, será necessário controlar quais configurações cada usuário pode editar. Alguns usuários podem precisar alterar apenas uma regra específica, sem permissão para mexer em todas as configurações do sistema.

**Decisão**

Descartada como tarefa separada. A necessidade foi incorporada à **5.1 Limitar edição de configurações e exclusões por usuário e classificação**.

A regra principal deve ser por **classificação**. Permissão por configuração específica fica apenas como complemento para casos em que uma configuração não tenha classificação clara.

**Proposta**

Na futura tela de permissões, permitir liberar edição por usuário e por configuração/parâmetro.

Exemplos:

- usuário A pode editar apenas **Comprar quando faltar até**;
- usuário B pode editar apenas parâmetros de empréstimo;
- usuário C pode visualizar a tela, mas não editar nada;
- **hugorwagemacher** continua com acesso total para administrar essas liberações.

**Comportamento esperado**

- A tela de Parâmetros mostra todos os campos que o usuário pode visualizar.
- Campos sem permissão de edição ficam bloqueados ou somente leitura.
- O botão de salvar deve considerar apenas alterações em campos permitidos.
- Tentativas de editar campo sem permissão também devem ser bloqueadas no backend/API.
- A tela de permissões deve permitir marcar quais configurações cada usuário pode editar.

**Pendências técnicas**

- Criar modelo de permissão por usuário e chave de configuração.
- Definir se a permissão será por campo individual, por grupo ou ambos.
- Atualizar API de configuração para validar permissão por campo antes de salvar.
- Ajustar `settings-screen.tsx` para desabilitar campos sem permissão.
- Registrar auditoria de quem alterou cada configuração.
- Garantir acesso total inicial para `hugorwagemacher`.

---

## 6. Fluxo de Dados e Infraestrutura

### [ ] 6.1 Revisar fluxo de atualização de dados

**Contexto**

É necessário revisar como as atualizações são feitas desde o SISCORE até o Supabase e depois do banco para a tela do usuário.

**Proposta**

Mapear o fluxo completo de atualização e leitura dos dados para reduzir requisições e atualizações desnecessárias.

**Comportamento esperado**

- Entender quando o app busca dados do SISCORE.
- Entender quando o app busca dados do Supabase.
- Evitar leituras repetidas sem necessidade.
- Evitar recálculos no frontend quando nada mudou.
- Manter a tela do usuário atualizada sem sobrecarregar banco ou rede.

**Pendências técnicas**

- Mapear scripts/importações SISCORE.
- Mapear chamadas Supabase no provider.
- Revisar cache local e invalidação.
- Revisar eventos de atualização e sincronização.
- Propor estratégia de atualização consistente.

### [ ] 6.2 Criar plano de monitoramento das cotas gratuitas do Supabase

**Contexto**

As cotas gratuitas do Supabase precisam ser revisadas e monitoradas para evitar surpresa com limites de uso.

**Proposta**

Criar um plano consistente de monitoramento das cotas gratuitas do Supabase e registrar em um arquivo próprio para consulta futura.

Arquivo sugerido: `docs/supabase-monitoramento.md`

**Comportamento esperado**

- Revisar cotas atuais do plano gratuito do Supabase usando documentação oficial.
- Definir quais métricas acompanhar.
- Definir frequência de revisão.
- Definir sinais de alerta para uso excessivo.
- Registrar comandos, telas ou links úteis para monitoramento.

**Pendências técnicas**

- Consultar documentação oficial atualizada do Supabase antes de escrever o plano.
- Identificar métricas relevantes para o projeto: banco, storage, edge/API, bandwidth, autenticação e logs.
- Criar `docs/supabase-monitoramento.md`.
- Incluir checklist periódico de acompanhamento.

### [ ] 6.3 Registrar histórico completo das sincronizações do SISCORE

**Contexto**

A necessidade apareceu ao revisar o bloco de atualização do Dashboard. O texto **Base atualizada em** mostrava uma data como `21/04/2026, 16:34`, mas surgiu a dúvida: se o workflow agendado do GitHub Actions roda depois disso, a base não deveria aparecer como atualizada logo após a execução?

Foi constatado que hoje o Dashboard usa `dashboard.last_sync`, calculado em `hydrateDataset` a partir do maior `importado_em` das linhas carregadas de `almox_estoque_atual`. Esse valor representa a última importação realmente persistida com dados de estoque, não necessariamente a última vez que o robô conferiu o SISCORE.

Também foi constatado que o workflow `.github/workflows/siscore-sync-agendado.yml` roda `npm run siscore:import` de forma agendada e manual. Durante a importação, o script calcula um hash do conteúdo baixado. Se o conteúdo for igual ao último lote processado, a persistência é pulada com mensagem de conteúdo idêntico. Nesse caso, o workflow pode terminar com sucesso, mas a data de `importado_em` usada no Dashboard não muda.

Existe a tabela `almox.siscore_sync_execucao`, mas o script só registra status quando existe `SISCORE_SYNC_TRACKING_ID` junto com o tipo do job. O workflow agendado define o tipo do job, mas não define explicitamente um tracking id. Por isso, a execução agendada pode não ficar registrada com o detalhamento necessário.

**Por que fazer**

O usuário precisa conseguir diferenciar:

- **Última mudança nos dados**: quando uma nova base foi gravada ou atualizada.
- **Última conferência no SISCORE**: quando o robô rodou, conferiu a origem e informou se houve mudança, erro ou nenhuma alteração.

Sem essa separação, uma execução bem-sucedida sem alteração pode parecer desatualização ou falha, porque a data da base continua antiga.

**Proposta**

Registrar toda tentativa de sincronização do SISCORE, inclusive quando não houver alteração nos dados.

Cada execução deve ter um resumo geral e, quando possível, detalhes por categoria:

- origem: `agendada`, `manual`, `sistema`
- escopo: `estoque`, `notas_fiscais`, `all`
- categoria: `material_hospitalar`, `material_farmacologico`, `notas_fiscais`
- status: `sucesso`, `sem_alteracao`, `falha`, `parcial`
- início e fim da execução
- quantidade de linhas lidas
- quantidade de linhas gravadas
- lote gerado, quando houver
- hashes de arquivo/conteúdo, quando útil para auditoria
- mensagem amigável para o usuário
- detalhes técnicos em JSON
- link do workflow do GitHub Actions, quando a execução vier do GitHub
- usuário responsável, quando a sincronização for manual

**Exemplos de mensagens**

- `Agendada · Material hospitalar · Sem alterações`
- `Agendada · Material farmacológico · 12.430 linhas conferidas, sem mudança`
- `Manual · Estoque · Dados atualizados com sucesso`
- `Manual · Estoque · Falha ao autenticar no SISCORE`
- `Agendada · Notas fiscais · Sem alterações`

**Comportamento esperado**

- O workflow agendado registra execução mesmo quando a planilha baixada tem conteúdo idêntico.
- O Dashboard pode mostrar dois campos separados:
  - **Última mudança nos dados**
  - **Última conferência no SISCORE**
- O usuário entende se a base está antiga porque não houve alteração no SISCORE ou porque a sincronização falhou.
- A tela pode exibir um status curto, por exemplo: `Hoje, 00:03 · Agendada · Sem alterações`.
- Falhas ficam registradas com mensagem suficiente para diagnóstico.
- Execuções parciais indicam quais categorias deram certo e quais falharam.

**Pendências técnicas**

- Decidir se será usada apenas `almox.siscore_sync_execucao` ou se será criada uma tabela filha para detalhes por categoria.
- Garantir que o workflow agendado gere um `SISCORE_SYNC_TRACKING_ID` próprio.
- Ajustar `scripts/importar-siscore.mjs` para registrar `sem_alteracao` quando o hash de conteúdo for igual ao último lote.
- Registrar o resultado por categoria, inclusive `material_hospitalar` e `material_farmacologico`.
- Expor uma API ou view pública segura para o app consultar o último resumo de sincronização.
- Ajustar o Dashboard para trocar **Base atualizada em** por **Última mudança nos dados**.
- Adicionar **Última conferência no SISCORE** com origem e resultado da última execução.
- Validar execução agendada, execução manual, sem alteração, falha e sucesso parcial.
