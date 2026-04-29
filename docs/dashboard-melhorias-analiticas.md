# Melhorias Analiticas da Dashboard

Documento para registrar ideias de evolucao da listagem principal de produtos, com foco em decisao operacional mais rapida e menos dependencia de texto longo.

Escopo desta revisao:
- dashboard principal;
- tabela compartilhada de produtos;
- foco em HMSA, onde ja existem `Processos`, `Acao`, `Hospital compativel` e `Obs. operacional`.

## 1. Diagnostico atual

Pontos fortes atuais:
- a tabela ja mostra dias de suficiencia, nivel, processo aberto, acao sugerida e observacao operacional;
- a observacao operacional esta bem melhor do que antes e cobre contexto real do produto;
- a dashboard ja calcula dados importantes como remanejamento sugerido, cobertura projetada, consumo mensal e risco.

Limitacoes atuais:
- sinais muito importantes ainda estao escondidos na `Obs. operacional` ou em tooltip;
- a tabela responde bem a leitura qualitativa, mas ainda nao e tao forte para comparacao rapida entre linhas;
- faltam colunas numericas que permitam ordenar e priorizar sem depender de leitura de texto;
- parte da logica analitica ja existe no modelo, mas nao esta visivel na grade principal.

## 2. Melhorias de maior valor

### 2.1 Gap de abastecimento

Ideia:
- adicionar uma coluna com o tamanho da acao necessaria para proteger o estoque.

Comportamento sugerido:
- se a acao for `COMPRAR`, mostrar `qty_to_buy`;
- se a acao for `PEGAR EMPRESTADO`, mostrar `qty_transfer`;
- se houver processo aberto, opcionalmente mostrar quanto do gap ainda nao esta coberto pela proxima entrega.

Valor operacional:
- tira da observacao um numero central da tomada de decisao;
- ajuda a responder `quanto preciso agir` sem abrir outra tela;
- facilita priorizacao de produtos urgentes com gaps maiores.

## 2.2 Consumo do mes

Ideia:
- adicionar uma coluna curta com `consumo_mes_ate_hoje / CMM` e `% CMM`.

Exemplos:
- `142 / 90`
- `158%`

Valor operacional:
- deixa explicito quando o consumo do mes ja esta acima do esperado;
- permite ordenar por aceleracao de consumo;
- reduz a necessidade de depender da linha textual `Consumo:` na observacao.

Observacao:
- so usar quando houver snapshot diario valido para o mes;
- quando nao houver snapshot, manter `—` e nao inferir nada.

## 2.3 Prox. marco

Ideia:
- transformar a coluna de processos em algo mais orientado a prazo imediato.

Comportamento sugerido:
- mostrar `E-DOCS`;
- mostrar a proxima parcela pendente;
- mostrar a data da proxima entrega prevista;
- destacar `atrasado`, `hoje` ou `1 dia`.

Valor operacional:
- melhora muito a leitura do que vence primeiro;
- reduz a necessidade de abrir a tela de processos so para descobrir o proximo evento;
- torna a coluna de processos menos descritiva e mais acionavel.

## 3. Melhorias secundarias que ainda valem

### 3.1 Ultima entrada

Ideia:
- adicionar coluna com data da ultima entrada e tempo desde essa data.

Exemplos:
- `15/02/2026`
- `ha 72 dias`
- `VALIDAR USO` quando passar do limite de obsolescencia definido.

Valor operacional:
- ajuda a revisar itens sem giro;
- facilita identificar itens obsoletos ou mal cadastrados;
- apoia decisoes de limpeza da lista.

### 3.2 Risco

Ideia:
- separar `Risco` de `Nivel`.

Valor operacional:
- `Nivel` hoje esta muito ligado a dias de suficiencia;
- `Risco` pode destacar exposicao operacional mesmo quando a quantidade de dias ainda nao parece extrema;
- evita misturar urgencia estrutural com risco de ruptura contextual.

Base existente:
- `rupture_risk` ja esta calculado.

### 3.3 Pos-acao

Ideia:
- mostrar o efeito esperado depois da acao recomendada.

Comportamento sugerido:
- para remanejamento: `HMSA 60d / doador 173d`;
- para compra: opcionalmente meta de cobertura apos a recomposicao.

Valor operacional:
- ajuda a validar se a recomendacao realmente resolve o problema;
- torna a proposta de remanejamento mais auditavel.

## 4. Analises novas alem de colunas

### 4.1 Sem processo e abaixo do limite de compra

Valor:
- forma uma fila clara de abertura imediata;
- pode virar bloco de atencao ou filtro salvo.

### 4.2 Com processo aberto, mas sem cobertura ate a proxima entrega

Valor:
- caso operacional muito importante;
- evita confiar demais em processo aberto que nao protege o HMSA a tempo.

### 4.3 Consumo acelerado no mes

Valor:
- revela aumento relevante de uso;
- ajuda a revisar produtos que pareciam confortaveis, mas estao drenando rapido.

Regra sugerida:
- usar `%CMM` e ritmo observado contra a fração do mes ja medida.

### 4.4 Sem entrada ha muito tempo

Valor:
- identifica itens candidatos a revisao cadastral, obsolescencia ou baixa prioridade real.

Faixas sugeridas:
- `>180 dias`
- `>1 ano`
- `>3 anos`

### 4.5 Processo vencido em item urgente ou critico

Valor:
- deve virar recorte proprio de atencao;
- mistura de `nivel alto` com `processo atrasado` merece destaque especial.

## 5. Melhorias de interacao

Mesmo sem mudar a estrutura de dados, a tabela pode ganhar:
- ordenacao por `%CMM`;
- ordenacao por `Gap abastecimento`;
- ordenacao por `Prox. marco`;
- filtro `sem processo`;
- filtro `com processo atrasado`;
- filtro `consumo acelerado`;
- filtro `sem entrada recente`.

Esses filtros tendem a gerar mais valor do que criar muitas colunas de uma vez.

## 6. Ordem sugerida de implementacao

Fase 1:
- `Consumo do mes`;
- `Gap de abastecimento`;
- `Prox. marco`.

Motivo:
- maior ganho de leitura com menor risco de poluir a grade.

Fase 2:
- `Ultima entrada`;
- `Risco`;
- ordenacoes novas.

Fase 3:
- `Pos-acao`;
- filtros analiticos dedicados;
- recortes prontos de atencao.

## 7. O que evitar

- adicionar muitas colunas longas ao mesmo tempo;
- duplicar texto que ja existe na `Obs. operacional`;
- mostrar indicadores sem regra clara ou sem fonte valida;
- transformar a tabela principal em uma segunda tela de processos.

## 8. Proxima revisao

Quando revisarmos este documento novamente, vale decidir:
- quais colunas entram na tabela principal;
- quais viram apenas tooltip ou detalhe expandido;
- quais indicadores entram como filtros;
- quais blocos merecem virar cards de atencao na dashboard.
