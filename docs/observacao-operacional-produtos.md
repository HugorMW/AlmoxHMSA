# Observacao Operacional de Produtos

Documento de decisao para a coluna de observacao operacional nas listas de produtos.

Objetivo:
- gerar uma orientacao curta e uma analise detalhada por produto;
- priorizar seguranca operacional;
- evitar recomendacoes que deixem o HMSA sem estoque;
- tornar a regra auditavel e previsivel.

## 1. Dados confirmados como disponiveis

Base principal por produto em `almox_estoque_atual`:
- `suficiencia_em_dias`;
- `estoque_atual`;
- `consumo_medio`;
- `data_ultima_entrada`;
- `codigo_produto_referencia`;
- hospital e categoria.

Processos abertos por produto:
- existe resumo por `cd_produto`;
- parcelas pendentes;
- parcelas atrasadas;
- parcelas com alerta;
- E-DOCS;
- adiamento em dias uteis.

Redistribuicao:
- hospital doador sugerido;
- suficiência atual do doador;
- estoque atual do doador;
- suficiencia projetada do doador apos transferencia;
- quantidade sugerida para transferencia.

Consumo recente:
- existe a view `public.almox_consumo_mes_atual`;
- ela compara o estoque do snapshot mais antigo do mes corrente com o estoque atual;
- campos relevantes: `data_snapshot_inicio`, `estoque_inicio_mes`, `consumo_mes_ate_hoje`, `percentual_consumido`.

## 2. Limitacoes confirmadas

- a view `almox_consumo_mes_atual` nao representa o ultimo mes fechado;
- ela mede o consumo acumulado no mes corrente contra o `consumo_medio`;
- portanto ela serve como sinal de aceleracao operacional de consumo, nao como historico completo mensal;
- se nao houver snapshot diario no mes, esse sinal nao pode ser tratado como conclusivo.

Decisao:
- usar a view como indicador auxiliar de aumento relevante de uso;
- documentar explicitamente quando nao houver snapshot suficiente para sustentar essa leitura;
- evitar qualquer troca de acao principal baseada apenas nesse sinal.

## 3. Riscos que a observacao precisa cobrir

- item com cobertura baixa e sem processo aberto;
- item com cobertura baixa e processo aberto, mas sem atraso;
- item com cobertura baixa e processo atrasado;
- item com possibilidade segura de emprestimo;
- item com consumo do mes atual acima da media;
- item com estoque zerado ou muito proximo de ruptura;
- item com processo aberto, mas sem parcelas pendentes visiveis;
- item com informacao de consumo recente indisponivel.

## 4. Diretrizes de regra

Prioridade de leitura:
1. risco de ruptura;
2. existencia e estado do processo aberto;
3. possibilidade segura de emprestimo;
4. aceleracao recente de consumo;
5. conforto operacional do estoque.

Regras desejadas:
- nunca recomendar aguardar passivamente quando houver risco alto e processo atrasado;
- nunca recomendar transferencia se isso empurrar o doador abaixo do piso configurado;
- manter a acao primaria do produto como fonte principal da observacao;
- usar o consumo recente para intensificar urgencia, nao para apagar sinais mais fortes de ruptura ou atraso.
- quando houver processo aberto e tambem houver doador seguro, tratar o emprestimo como contingencia para proteger o HMSA, nao como substituto do acompanhamento do processo.

## 5. Estrutura desejada da coluna

Formato:
- linha 1: mensagem curta;
- linha 2 em diante: analise detalhada objetiva.

Exemplos de mensagem curta:
- `Abrir compra`;
- `Acompanhar processo`;
- `Cobrar fornecedor`;
- `Solicitar emprestimo`;
- `Monitorar consumo`;
- `Estoque estavel`.

Detalhe esperado:
- motivo principal;
- proximo passo recomendado;
- sinal de risco adicional quando houver;
- citar processo, parcela, doador ou consumo acelerado quando relevante.

## 6. Regra final adotada

- `COMPRAR` sem processo: orientar abertura imediata de compra;
- `ACOMPANHAR PROCESSO`: orientar monitoramento de E-DOCS e parcelas pendentes;
- `COBRAR ENTREGA`: orientar cobranca ativa por atraso;
- `PEGAR EMPRESTADO`: orientar contato com hospital doador sugerido e, se houver processo aberto, deixar claro que o remanejamento e contingencia;
- `PODE EMPRESTAR`: orientar avaliacao cautelosa de saldo;
- `OK`: orientar monitoramento simples.

Sinal de consumo recente:
- usar `almox_consumo_mes_atual` como leitura derivada do estoque diario;
- calcular o ritmo observado contra a fracao efetivamente medida do mes, a partir de `data_snapshot_inicio`;
- considerar `moderate` quando o ritmo estimado estiver pelo menos 15% acima do esperado para a data;
- considerar `high` quando o ritmo estimado estiver pelo menos 35% acima do esperado para a data;
- nao alterar a acao principal so por isso; o efeito e reforcar urgencia, cautela ao emprestar ou necessidade de reavaliacao.

## 7. Revisao final

Decisoes consolidadas:
- a coluna entrega mensagem curta na primeira linha e analise detalhada logo abaixo;
- o tooltip permanece com o mesmo texto completo para facilitar leitura em colunas estreitas;
- a exportacao Excel da tela de produtos leva a observacao curta e a detalhada;
- a observacao fica restrita ao HMSA, porque a acao calculada e o risco operacional foram modelados para a unidade receptora principal.
- a observacao passou a usar dados concretos do caso: estoque atual, ultima entrada, processo principal, parcela mais critica, notificacao do fornecedor e contingencia por remanejamento ou reforco de compra.

Alternativas consideradas e descartadas nesta etapa:
- consultar a serie diaria completa por produto em cada renderizacao;
- gerar texto livre por IA sem regra deterministica.

Motivo do descarte:
- a serie completa aumentaria custo, complexidade e variabilidade sem entregar uma decisao mais auditavel nesta tela;
- texto livre por IA nao e apropriado para um campo que pode disparar acao critica de abastecimento.
