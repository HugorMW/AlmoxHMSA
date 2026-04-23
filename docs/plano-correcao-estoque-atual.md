# Plano de Correcao do Estoque Atual

Documento de planejamento e registro da correcao estrutural aplicada no carregamento da base operacional.

Status em **23/04/2026**:

- Fase 1 implementada
- Fase 2 implementada
- Fase 3 parcialmente implementada
- Fase 4 pendente

Migration aplicada:

- [20260423230000_materializar_estoque_atual.sql](../supabase/migrations/20260423230000_materializar_estoque_atual.sql)
- [20260423234500_realinhar_estoque_atual_materializado.sql](../supabase/migrations/20260423234500_realinhar_estoque_atual_materializado.sql)

---

## 1. Problema original

O frontend consultava `public.almox_estoque_atual`, mas essa view dependia de `almox.v_estoque_atual`, que recalculava o "estoque atual" em cima do historico de `almox.estoque_importado`.

Resultado:

- leitura pesada no primeiro carregamento;
- timeout `57014` no client API do Supabase;
- pressao desnecessaria sobre egress e processamento no Free Plan.

---

## 2. Objetivo da correcao

Trocar este modelo:

- "ler uma view que recalcula o estoque atual"

por este:

- "ler um dado fisico de estoque atual, ja pronto"

Sem perder:

- historico completo em `almox.estoque_importado`;
- compatibilidade com o app atual;
- compatibilidade com o snapshot diario;
- separacao por categoria material.

---

## 3. Decisao adotada

### 3.1 Estrategia escolhida

Foi criada a tabela fisica:

- `almox.estoque_atual`

E a exposicao publica foi mantida assim:

- `public.almox_estoque_atual` continua existindo, mas agora le dessa tabela

Motivos:

- o nome publico continuou igual para o frontend;
- a mudanca pesada ficou concentrada no banco e no fluxo de importacao;
- rollback permanece viavel.

### 3.2 O que foi deliberadamente evitado como solucao principal

Nao foi tratado como correcao principal:

1. aumentar timeout do banco;
2. mudar so o `PAGE_SIZE`;
3. remover apenas o `ORDER BY`;
4. depender so de mais cache no browser.

Esses ajustes poderiam aliviar sintomas, mas nao resolveriam a causa estrutural.

---

## 4. Modelo implementado

### 4.1 Responsabilidades

#### `almox.estoque_importado`

Continua sendo:

- historico bruto por lote importado.

#### `almox.estoque_atual`

Passou a ser:

- foto operacional pronta do estado atual por produto/unidade.

#### `public.almox_estoque_atual`

Passou a ser:

- view publica fina em cima de `almox.estoque_atual`.

### 4.2 Indices criados

Foram criados:

1. `estoque_atual_produto_unidade_uidx`
2. `estoque_atual_categoria_unidade_codigo_idx`
3. `estoque_atual_codigo_referencia_idx`
4. `estoque_atual_unidade_codigo_idx`

---

## 5. Ponto de atualizacao adotado

### 5.1 Onde a mudanca entrou

O lugar escolhido para manter `almox.estoque_atual` foi o proprio fluxo de importacao:

- [run-siscore-import.ts](../src/server/run-siscore-import.ts)
- [public.importar_estoque_siscore](../supabase/migrations/20260423230000_materializar_estoque_atual.sql)

### 5.2 Regra aplicada para remocoes

Nao foi usado apenas `upsert` por linha na tabela atual.

Regra implementada:

1. apos inserir no historico, o RPC remove o estado atual da categoria importada;
2. em seguida reinsere a foto completa dessa categoria;
3. tudo ocorre dentro do mesmo processamento do lote.

Isso foi necessario para tratar corretamente produtos que deixarem de vir em uma exportacao nova.

---

## 6. Fases de implementacao

### Fase 1 - Banco

- [x] criar `almox.estoque_atual`
- [x] criar indices
- [x] ajustar `public.almox_estoque_atual` para ler da nova tabela
- [x] manter `almox.v_estoque_atual` por compatibilidade
- [x] fazer backfill inicial do estado atual existente

### Fase 2 - RPC de importacao

- [x] apos inserir em `almox.estoque_importado`, materializar o estado atual da categoria importada
- [x] substituir o conjunto atual da categoria pela foto do lote novo
- [x] manter essa atualizacao no mesmo fluxo do lote

### Fase 3 - Leitura e observabilidade

- [x] manter o frontend usando `public.almox_estoque_atual`
- [x] repetir o `EXPLAIN ANALYZE` depois da mudanca
- [ ] acrescentar rotulo mais claro nos erros do provider, identificando exatamente qual consulta falhou

### Fase 4 - Limpeza opcional posterior

- [ ] revisar se `almox.v_estoque_atual` ainda precisa existir
- [ ] revisar politica de retencao do historico
- [ ] revisar se o snapshot diario pode ler diretamente da tabela fisica interna

---

## 7. Validacao executada

### 7.1 Banco

Foi validado:

- `almox.estoque_atual` = **9.168** linhas
- `public.almox_estoque_atual` = **9.168** linhas
- `material_hospitalar` = **5.719** linhas
- `material_farmacologico` = **3.449** linhas
- `almox.estoque_importado` permaneceu com **359.518** linhas historicas
- a unidade legada `HMSA` saiu do estado atual materializado
- `HMSASOUL` permaneceu no estado atual, como esperado

### 7.2 Performance

Consulta medida novamente:

```sql
explain (analyze, buffers)
select
  categoria_material,
  importado_em,
  codigo_unidade,
  produto_referencia_id,
  codigo_produto_referencia,
  nome_produto_referencia,
  codigo_produto,
  nome_produto,
  suficiencia_em_dias,
  data_ultima_entrada,
  consumo_medio,
  estoque_atual
from public.almox_estoque_atual
order by categoria_material asc, codigo_unidade asc, codigo_produto asc
limit 1000 offset 0;
```

Resultado apos a mudanca:

- `Index Scan using estoque_atual_categoria_unidade_codigo_idx`
- **0,936 ms** de tempo total

Comparacao com o estado anterior:

- antes: **4035 ms**
- depois: **0,936 ms**

### 7.3 App

Validacoes locais:

- `npm run db:apply`
- `npx tsc --noEmit`

Validacoes operacionais:

- sync real de estoque em modo RPC com credencial salva de `hugorwagemacher`
- resultado do sync real: conteudo identico, persistencia corretamente ignorada por hash
- teste transacional forcando o RPC com os dados atuais do SISCORE, seguido de rollback, para validar o caminho novo sem alterar o estado produtivo
- `npm run almox:snapshot`

O frontend nao exigiu mudanca de contrato para continuar lendo a base.

---

## 8. Compatibilidade obtida

### 8.1 Frontend

`loadEstoqueAtualRows()` continua lendo `almox_estoque_atual`.

Logo:

- a mudanca foi estrutural no banco;
- o contrato lido pelo app permaneceu estavel.

### 8.2 Snapshot diario

`registrar_snapshot_estoque_diario()` continua lendo `almox_estoque_atual`.

Como a view publica foi preservada:

- o snapshot diario continuou compativel.

### 8.3 Historico

`almox.estoque_importado` permaneceu intacta.

Ela continua sendo a base para:

- auditoria;
- comparacoes futuras;
- recuperacao de historico;
- rollback.

---

## 9. Riscos residuais

### 9.1 Observabilidade de erro no app ainda pode melhorar

Se voltar a ocorrer timeout em outra leitura, o provider ainda pode mostrar mensagem pouco contextualizada.

### 9.2 Politica de retencao do historico continua aberta

A materializacao resolveu a leitura operacional, mas nao resolveu sozinha:

- crescimento indefinido do historico;
- governanca de tamanho do banco no Free Plan.

### 9.3 Compatibilidade legado pode ser simplificada depois

`almox.v_estoque_atual` foi mantida para transicao e rollback. Isso ainda pode ser limpo numa rodada futura.

---

## 10. Rollback previsto

Se for necessario voltar:

1. manter `almox.estoque_importado` como fonte integra;
2. recriar `public.almox_estoque_atual` apontando novamente para a logica antiga;
3. desativar temporariamente o uso de `almox.estoque_atual`;
4. repetir `EXPLAIN ANALYZE` para confirmar o retorno ao comportamento anterior.

O ponto forte do rollback continua sendo:

- o historico nao foi perdido.

---

## 11. Proxima rodada recomendada

Depois desta correcao estrutural, a melhor sequencia tecnica e:

1. rotular melhor os erros de consulta no provider;
2. revisar politica de retencao do historico;
3. monitorar tamanho do banco e egress;
4. decidir se `almox.v_estoque_atual` ainda precisa continuar existindo.
