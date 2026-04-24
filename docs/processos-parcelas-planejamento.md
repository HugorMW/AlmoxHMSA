# Processos — Planejamento de Parcelas

Documento vivo para planejar a próxima evolução da tela de **Processos**, com foco em melhorar a interação das parcelas sem perder a simplicidade operacional.

Status por item: `[ ]` pendente · `[~]` em análise · `[x]` decidido · `[-]` descartado.

---

## 1. Base consultada

Arquivos e documentos usados para este planejamento:

- [docs/acompanhamento-processos.md](./acompanhamento-processos.md)
- [src/features/almox/screens/processes-screen.tsx](../src/features/almox/screens/processes-screen.tsx)
- [src/features/almox/almox-provider.tsx](../src/features/almox/almox-provider.tsx)
- [src/features/almox/types.ts](../src/features/almox/types.ts)
- [src/features/almox/configuracao.ts](../src/features/almox/configuracao.ts)
- [supabase/migrations/20260422143000_criar_processos_acompanhamento.sql](../supabase/migrations/20260422143000_criar_processos_acompanhamento.sql)
- [supabase/migrations/20260422170000_configurar_prazos_processos.sql](../supabase/migrations/20260422170000_configurar_prazos_processos.sql)

---

## 2. Objetivo

Melhorar o controle das parcelas na tela de Processos para permitir:

- clicar em uma parcela específica da linha e abrir um modal contextualizado;
- atualizar a situação da parcela sem precisar pensar no processo inteiro;
- registrar quando a parcela foi adiada;
- registrar quando a empresa já foi notificada;
- manter claro o prazo original, o prazo ajustado e a situação atual.

O foco aqui é **controle operacional rápido**, não auditoria completa ainda.

---

## 3. Diagnóstico do estado atual

### [x] 3.1 Como funciona hoje

Hoje a tela funciona assim:

- cada processo mostra uma timeline com as parcelas e seus vencimentos;
- a timeline é apenas visual;
- o usuário clica no botão de ação **Atualizar parcelas**;
- o modal aberto mostra a lista de parcelas;
- cada parcela só pode alternar entre `entregue` e `pendente`;
- o banco persiste isso em `parcelas_entregues`, que é apenas um array booleano.

### [x] 3.2 Limitações atuais

O modelo atual é curto demais para a próxima etapa:

- não existe clique direto em uma parcela da linha;
- não existe dado para dizer que a parcela foi adiada;
- não existe dado para dizer que a empresa foi notificada;
- não existe separação entre prazo original e prazo ajustado;
- o modal atual trata todas as parcelas quase como checkboxes, sem contexto operacional.

### [x] 3.3 Impacto prático

Na rotina, isso gera três problemas:

1. o usuário enxerga a parcela na linha, mas não consegue agir direto nela;
2. quando o prazo muda, o sistema não tem como refletir esse ajuste sem distorcer a lógica original;
3. a equipe perde visibilidade de cobrança já feita junto à empresa.

---

## 4. Princípios para a melhoria

### [x] 4.1 A parcela passa a ser a unidade principal de ação

O processo continua sendo o registro principal, mas a ação operacional deve acontecer na parcela.

### [x] 4.2 Prazo configurado continua sendo a base

Os parâmetros de prazo por:

- classificação;
- tipo de processo;
- número da parcela;

continuam sendo a regra principal.

O adiamento entra como **ajuste manual por parcela**, não como substituição da configuração global.

### [x] 4.3 Notificação não muda o prazo sozinha

Marcar que a empresa foi notificada é informação de acompanhamento. Isso não deve alterar o vencimento por conta própria.

### [x] 4.4 O fluxo precisa continuar rápido

Não vale transformar a tela em um formulário pesado. A atualização da parcela precisa caber em um modal simples, com poucos comandos claros.

---

## 5. Proposta de experiência

### [x] 5.1 Interação principal na tabela

Cada item da timeline de parcelas deve virar um elemento clicável.

Comportamento proposto:

- clicar em `P1`, `P2`, `P3` etc. abre o modal da **parcela selecionada**;
- o modal já entra focado naquela parcela;
- o botão lateral atual deixa de ser o único caminho para atualização.

### [~] 5.2 Destino do botão atual "Atualizar parcelas"

Opções avaliadas:

1. manter o botão e fazê-lo abrir a primeira parcela pendente;
2. manter o botão e fazê-lo abrir um modal-resumo com a lista completa;
3. remover o botão e confiar apenas no clique da timeline.

**Decisão provisória**

Ficar com a opção `2`.

Motivo:

- mantém uma porta de entrada clara para quem ainda procura a ação na coluna `Ações`;
- preserva acessibilidade e previsibilidade;
- permite um modo resumo para processos com muitas parcelas;
- evita depender só do clique em elementos menores na timeline.

Desenho resultante:

- clique em uma parcela => abre o modal já focado naquela parcela;
- botão de ação => abre o mesmo modal em modo resumo/lista.

### [x] 5.3 Estrutura sugerida do novo modal

O modal de parcela deve mostrar:

- número do pedido;
- produto;
- parcela atual;
- situação atual;
- prazo padrão;
- prazo ajustado, se houver;
- ações rápidas.

Blocos sugeridos:

1. **Cabeçalho**
   - `Pedido 251/2026`
   - nome do produto
   - `Parcela 2 de 3`

2. **Situação**
   - `Pendente`, `Entregue` ou `Atrasada`
   - badges auxiliares:
     - `Adiada`
     - `Empresa notificada`

3. **Prazos**
   - `Prazo padrão`
   - `Adiamento aplicado`
   - `Prazo atual`

4. **Ações**
   - marcar como entregue / reabrir;
   - adiar parcela;
   - marcar empresa como notificada;
   - limpar adiamento;
   - limpar notificação.

5. **Observações futuras**
   - deixar espaço conceitual para observação, mas não implementar nesta primeira fase.

### [x] 5.4 Ação "Adiar parcela"

Proposta inicial:

- permitir informar **quantos dias úteis** adiar;
- recalcular o vencimento final a partir do prazo padrão + adiamento;
- mostrar visualmente o acréscimo aplicado.

Exemplo:

- prazo padrão da parcela 2 = `45 dias úteis`
- adiamento manual = `10 dias úteis`
- prazo final exibido = `55 dias úteis` a partir do resgate

Motivo da escolha:

- preserva a lógica já existente de dias úteis;
- conversa melhor com a configuração já implementada;
- evita pedir ao usuário uma data manual em um primeiro momento.

### [x] 5.5 Ação "Empresa notificada"

Proposta inicial:

- registrar um marcador simples de que a empresa foi notificada;
- registrar também a data/hora da notificação;
- não exigir canal, responsável ou texto nesta primeira fase.

Exibição sugerida:

- badge `Empresa notificada`;
- linha auxiliar no modal:
  - `Notificada em 23/04/2026 14:35`

### [x] 5.6 Comportamento visual na linha da tabela

Depois da melhoria, a timeline pode sinalizar:

- parcela entregue;
- parcela atrasada;
- parcela adiada;
- parcela notificada.

Sem poluir a linha.

Proposta:

- manter a cor principal pela situação operacional:
  - verde = entregue
  - vermelho = atrasada
  - amarelo = pendente no prazo
- usar indicadores secundários discretos:
  - ícone pequeno de relógio para adiada
  - ícone pequeno de sino ou megafone para notificada

Esses indicadores só complementam a cor, não substituem a leitura principal.

---

## 6. Proposta de modelo de dados

### [x] 6.1 Alternativas avaliadas

#### Alternativa A — tabela filha por parcela

Exemplo:

- `almox_processos_parcelas`
- uma linha por parcela

Prós:

- modelo mais limpo para crescer;
- facilita histórico por parcela;
- facilita filtros e consultas futuras.

Contras:

- aumenta a complexidade agora;
- exige carga adicional no provider;
- obriga a refatorar mais partes da tela de uma vez.

#### Alternativa B — JSON detalhado no próprio processo

Exemplo:

- manter `almox_processos_acompanhamento`;
- adicionar uma nova coluna `parcelas_detalhes jsonb`.

Prós:

- encaixa melhor no desenho atual;
- menor esforço de migração;
- menor impacto na carga e no provider;
- suficiente para esta fase.

Contras:

- menos elegante para analytics e auditoria futura;
- pode ficar limitado se a feature crescer demais.

### [x] 6.2 Decisão provisória

Adotar a **Alternativa B** nesta fase.

Motivo:

- o projeto ainda está consolidando a tela de Processos;
- o modelo atual já é centrado em uma linha por processo;
- o ganho operacional vem rápido sem abrir uma refatoração grande de banco e provider;
- se o módulo ganhar histórico detalhado por usuário depois, aí sim vale migrar para tabela filha.

### [x] 6.3 Estrutura sugerida para `parcelas_detalhes`

Cada item do array pode seguir esta ideia:

```json
[
  {
    "numero": 1,
    "entregue": false,
    "adiamento_dias_uteis": 0,
    "empresa_notificada": false,
    "empresa_notificada_em": null,
    "atualizado_em": "2026-04-23T12:00:00Z"
  }
]
```

Campos sugeridos:

- `numero`
- `entregue`
- `adiamento_dias_uteis`
- `empresa_notificada`
- `empresa_notificada_em`
- `atualizado_em`

### [x] 6.4 Relação com `parcelas_entregues`

Para reduzir risco de transição:

1. adicionar `parcelas_detalhes`;
2. popular a coluna a partir de `parcelas_entregues`;
3. manter `parcelas_entregues` sincronizada por uma fase;
4. só depois avaliar se ela continua necessária.

Isso evita quebrar a tela de uma vez só.

---

## 7. Regras de negócio sugeridas

### [x] 7.1 Situação da parcela

Regra base:

- `Entregue` quando `entregue = true`
- `Atrasada` quando não entregue e o prazo atual já venceu
- `Pendente` quando não entregue e o prazo atual ainda não venceu

### [x] 7.2 Prazo atual

Regra sugerida:

- `prazo_padrao = data_resgate + dias_uteis_configurados`
- `prazo_atual = prazo_padrao + adiamento_dias_uteis`

### [x] 7.3 Situação do processo

O status do processo continua vindo da situação consolidada das parcelas:

- `Concluído` se todas estiverem entregues;
- `Atrasado` se existir pelo menos uma parcela pendente com prazo atual vencido;
- `Em andamento` nos demais casos.

### [x] 7.4 Notificação da empresa

A notificação:

- não altera o prazo;
- não altera sozinha o status do processo;
- serve para contexto visual e tomada de decisão.

### [x] 7.5 Reabrir parcela

Se o usuário desmarcar uma parcela entregue:

- a parcela volta para pendente;
- a regra de atraso volta a considerar o prazo atual;
- a notificação e o adiamento podem permanecer, porque são históricos operacionais da mesma parcela.

---

## 8. Proposta de implementação

### [ ] 8.1 Fase 1 — Banco

- criar migration para adicionar `parcelas_detalhes jsonb`;
- backfill a partir de `parcelas_entregues`;
- documentar o formato no banco;
- manter compatibilidade com os dados atuais.

### [ ] 8.2 Fase 2 — Tipos e provider

- ampliar `ProcessoAcompanhamento` para representar detalhes por parcela;
- normalizar `parcelas_detalhes` no provider;
- ajustar `loadProcessItems`;
- criar atualização específica de parcela, em vez de só atualizar o array booleano.

### [ ] 8.3 Fase 3 — Tela de Processos

- transformar os blocos da timeline em elementos clicáveis;
- criar novo modal de parcela;
- adaptar o botão lateral para abrir o modal em modo resumo;
- refletir no visual os estados de adiada e notificada.

### [ ] 8.4 Fase 4 — Validação

- testar processo com 1 até 6 parcelas;
- testar atraso com e sem adiamento;
- testar parcela entregue e reaberta;
- testar notificação com processo atrasado;
- validar mobile e desktop.

---

## 9. Riscos e cuidados

### [x] 9.1 Duplicar lógica entre `parcelas_entregues` e `parcelas_detalhes`

Esse é o maior risco da fase de transição. O ideal é definir um único campo como fonte principal o quanto antes.

### [x] 9.2 Poluir a linha da tabela

Se colocar texto demais em cada parcela, a linha perde legibilidade. Os novos sinais precisam ser compactos.

### [x] 9.3 Transformar adiamento em exceção descontrolada

Adiamento precisa ser ajuste manual pontual, não forma paralela de esconder atraso. Por isso faz sentido mostrar sempre:

- prazo padrão;
- adiamento aplicado;
- prazo final.

### [x] 9.4 Aumentar muito o escopo

Nesta fase, não misturar:

- histórico completo por usuário;
- observações longas;
- exportação;
- lembretes automáticos;
- workflow de cobrança.

Isso pode virar fase futura.

---

## 10. Decisões provisórias para revisão

### [x] 10.1 O que entra agora

- clique na parcela abre modal contextual;
- adiamento em dias úteis;
- marcador de empresa notificada com data/hora;
- novo estado visual na timeline.

### [~] 10.2 O que fica para depois

- observação textual por parcela;
- histórico por usuário;
- múltiplas notificações por parcela;
- filtro específico de parcelas notificadas/adiadas;
- automação de alerta.

---

## 11. Perguntas em aberto

### [ ] 11.1 Adiamento deve aceitar só dias úteis ou também data manual?

Decisão provisória deste documento: **apenas dias úteis**.

### [ ] 11.2 Notificação precisa guardar canal ou responsável?

Decisão provisória deste documento: **não nesta fase**.

### [ ] 11.3 O botão lateral deve mudar de nome?

Sugestão:

- sair de `Atualizar parcelas`
- para `Parcelas`

Motivo:

- o modal deixa de ser só um toggle de entregue;
- passa a ser um ponto geral de acompanhamento da parcela.

---

## 12. Próximo passo recomendado

Se este planejamento for aprovado, a ordem mais segura de implementação é:

1. migration com `parcelas_detalhes`;
2. tipos e provider;
3. novo modal de parcela;
4. clique direto na timeline;
5. refinamento visual final.

