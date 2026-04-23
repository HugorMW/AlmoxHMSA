# Contexto Tecnico do AlmoxHMSA

Documento de entrada para futuras manutencoes, refactors, investigacoes e para eventual criacao de uma skill dedicada ao projeto.

Este arquivo nao substitui os documentos tecnicos mais detalhados. Ele organiza a leitura e aponta qual arquivo e a fonte de verdade para cada assunto.

---

## 1. Objetivo

Este conjunto de documentos existe para responder quatro perguntas recorrentes:

1. como o usuario entra no sistema;
2. como a base inicial chega ate a tela;
3. onde os dados do SISCORE sao gravados e transformados;
4. qual e o problema atual de performance e qual sera o plano de correcao.

---

## 2. Ordem recomendada de leitura

Para entender o projeto com o menor numero de suposicoes possivel, leia nesta ordem:

1. [fluxo-login.md](./fluxo-login.md)
2. [fluxo-primeiro-carregamento.md](./fluxo-primeiro-carregamento.md)
3. [arquitetura-estoque-atual.md](./arquitetura-estoque-atual.md)
4. [slqEditor.md](./slqEditor.md)
5. [plano-correcao-estoque-atual.md](./plano-correcao-estoque-atual.md)
6. [supabase-free-plan-impactos.md](./supabase-free-plan-impactos.md)
7. [tarefas-pendentes.md](./tarefas-pendentes.md)

Se a tarefa envolver a tela de Processos, leia tambem [acompanhamento-processos.md](./acompanhamento-processos.md).

---

## 3. Fonte de verdade por assunto

### 3.1 Autenticacao

Use:

- [fluxo-login.md](./fluxo-login.md)
- [src/features/auth/auth-provider.tsx](../src/features/auth/auth-provider.tsx)
- [src/app/api/auth/login+api.ts](../src/app/api/auth/login+api.ts)
- [src/server/session-cookie.ts](../src/server/session-cookie.ts)

Regra importante:

- o app **nao usa Supabase Auth para o usuario final**;
- a sessao web do sistema e o cookie proprio `almox_session`.

### 3.2 Primeiro carregamento da area logada

Use:

- [fluxo-primeiro-carregamento.md](./fluxo-primeiro-carregamento.md)
- [src/features/almox/almox-provider.tsx](../src/features/almox/almox-provider.tsx)
- [src/features/almox/data.ts](../src/features/almox/data.ts)

Regra importante:

- a base operacional principal e lida direto do Supabase pelo frontend;
- a configuracao do sistema vem por API interna autenticada;
- Processos agora carregam sob demanda.

### 3.3 Gravacao da base do SISCORE

Use:

- [arquitetura-estoque-atual.md](./arquitetura-estoque-atual.md)
- [src/server/run-siscore-import.ts](../src/server/run-siscore-import.ts)
- [src/server/siscore-sync-core.ts](../src/server/siscore-sync-core.ts)
- [supabase/migrations/20260402193000_expor_rpcs_importacao_siscore.sql](../supabase/migrations/20260402193000_expor_rpcs_importacao_siscore.sql)
- [supabase/migrations/20260423230000_materializar_estoque_atual.sql](../supabase/migrations/20260423230000_materializar_estoque_atual.sql)

Regra importante:

- o backend baixa a planilha;
- o RPC `importar_estoque_siscore` grava tabelas normalizadas;
- o frontend continua lendo `public.almox_estoque_atual`, mas essa view agora e apoiada em `almox.estoque_atual`, uma tabela fisica materializada.

### 3.4 Diagnostico do timeout `57014`

Use:

- [slqEditor.json](./slqEditor.json)
- [slqEditor.md](./slqEditor.md)
- [arquitetura-estoque-atual.md](./arquitetura-estoque-atual.md)

Regra importante:

- o timeout confirmado veio da leitura de `public.almox_estoque_atual`;
- o gargalo principal nao e mais uma hipotese, ele ja foi medido via `EXPLAIN ANALYZE`.

### 3.5 Plano da proxima correcao estrutural

Use:

- [plano-correcao-estoque-atual.md](./plano-correcao-estoque-atual.md)

Regra importante:

- a proxima mudanca relevante deve acontecer primeiro no banco e no fluxo de importacao;
- a ideia e preservar o contrato publico do frontend o maximo possivel.

---

## 4. Glossario minimo do projeto

### SISCORE

Sistema externo usado como origem dos dados operacionais de estoque e notas fiscais.

### lote_importacao

Cabecalho de cada carga importada do SISCORE. Informa quando a importacao ocorreu, qual foi a categoria e qual o status do processamento.

### produto_referencia

Produto comum entre unidades, normalmente identificado por `cd_pro_fat` / `codigo_produto_referencia`.

### produto_unidade

Produto da unidade local. Representa o par unidade + codigo local do produto.

### estoque_importado

Historico das linhas operacionais de estoque recebidas do SISCORE por lote importado.

### almox.v_estoque_atual

View interna de compatibilidade que hoje repassa os dados de `almox.estoque_atual`.

### public.almox_estoque_atual

View publica lida pelo frontend. Hoje ela repassa a foto operacional pronta de `almox.estoque_atual`.

### snapshot diario

Foto diaria do estoque atual, usada para apurar consumo acumulado do mes.

### dataset

Estrutura montada em memoria no frontend para alimentar Dashboard, Produtos, Emprestimos, Pedidos e outras telas.

### cache local

Dados reaproveitados pelo browser via `localStorage` e `sessionStorage` para reduzir recarga imediata da base.

---

## 5. Convencoes que uma futura skill precisa saber

1. o projeto mistura backend proprio, frontend Expo/React e Supabase;
2. autenticacao web e propria do app, nao do Supabase Auth;
3. carregamento inicial e um tema sensivel porque impacta experiencia do usuario e custo do Free Plan;
4. `public.almox_estoque_atual` era o principal ponto de pressao e continua sendo o principal objeto a observar quando surgirem problemas de performance de leitura;
5. sempre que surgir uma duvida sobre "dados atuais", diferencie:
   - horario da importacao no banco;
   - horario da leitura local do app;
   - horario do cache do navegador.

---

## 6. Decisoes ja constatadas

### 6.1 O gargalo atual mais importante nao esta no login

O login tem suas particularidades, mas o problema operacional mais caro hoje esta no carregamento da base de estoque.

### 6.2 O Free Plan do Supabase influencia desenho tecnico

Nao e detalhe. Egress e tamanho do banco precisam entrar nas decisoes sobre carga inicial, historico e view publica.

### 6.3 O timeout `57014` do estoque atual ja foi reproduzido com evidencia concreta

Existe:

- log real do Postgres/PostgREST;
- URL real do request;
- `EXPLAIN ANALYZE` salvo em [slqEditor.json](./slqEditor.json).

---

## 7. Proximo passo depois desta documentacao

O proximo passo recomendado depois da correcao estrutural e acompanhar:

1. erros remanescentes de leitura no provider;
2. tamanho do historico em `almox.estoque_importado`;
3. egress do Supabase;
4. necessidade real de manter `almox.v_estoque_atual` como camada de compatibilidade.
