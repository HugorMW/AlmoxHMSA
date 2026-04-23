# Arquitetura Atual do Estoque

Documento tecnico para explicar de onde sai o "estoque atual", como ele e gravado, como ele e lido pelo app e como a correcao estrutural foi aplicada.

Atualizado em: **23/04/2026**

Migrations chave desta estrutura:

- [20260423230000_materializar_estoque_atual.sql](../supabase/migrations/20260423230000_materializar_estoque_atual.sql)
- [20260423234500_realinhar_estoque_atual_materializado.sql](../supabase/migrations/20260423234500_realinhar_estoque_atual_materializado.sql)

---

## 1. Objetivo

Este documento responde:

1. quais tabelas e views participam do estoque;
2. como a importacao do SISCORE grava os dados;
3. como o frontend le a base operacional hoje;
4. qual era o gargalo anterior;
5. o que mudou na correcao estrutural.

---

## 2. Mapa atual

```mermaid
flowchart LR
    A[SISCORE Excel] --> B[run-siscore-import.ts]
    B --> C[RPC public.importar_estoque_siscore]
    C --> D[almox.lote_importacao]
    C --> E[almox.unidade]
    C --> F[almox.produto_referencia]
    C --> G[almox.produto_unidade]
    C --> H[almox.estoque_importado]
    C --> I[almox.estoque_atual]
    I --> J[almox.v_estoque_atual]
    I --> K[public.almox_estoque_atual]
    K --> L[loadEstoqueAtualRows()]
    L --> M[AlmoxDataProvider]
    M --> N[dataset]
    N --> O[Dashboard / Produtos / Emprestimos / Pedidos]
```

---

## 3. Escrita dos dados

### 3.1 Entrada no backend

O fluxo de importacao de estoque passa por:

- [src/server/run-siscore-import.ts](../src/server/run-siscore-import.ts)
- [src/server/siscore-sync-core.ts](../src/server/siscore-sync-core.ts)

Em [run-siscore-import.ts](../src/server/run-siscore-import.ts), o backend:

1. le a credencial SISCORE salva;
2. autentica no portal;
3. baixa a planilha;
4. normaliza as linhas;
5. chama o RPC `public.importar_estoque_siscore`.

### 3.2 Normalizacao

Em [siscore-sync-core.ts](../src/server/siscore-sync-core.ts:412), `normalizarLinhasEstoque()` extrai, entre outros:

- `categoria_material`
- `codigo_produto`
- `nome_produto`
- `codigo_produto_referencia`
- `nome_produto_referencia`
- `codigo_unidade`
- `suficiencia_em_dias`
- `consumo_medio`
- `estoque_atual`

Observacao importante:

- a unidade `HMSA` e filtrada para fora nesse ponto;
- o app trabalha com as demais unidades importadas do SISCORE para compor emprestimos e comparacoes.

### 3.3 Gravacao no banco

O RPC originalmente criado em [20260402193000_expor_rpcs_importacao_siscore.sql](../supabase/migrations/20260402193000_expor_rpcs_importacao_siscore.sql:1) foi reescrito pela migration [20260423230000_materializar_estoque_atual.sql](../supabase/migrations/20260423230000_materializar_estoque_atual.sql).

Hoje ele faz, nesta ordem:

1. cria um registro em `almox.lote_importacao`;
2. monta `tmp_estoque_rows`;
3. upsert em `almox.unidade`;
4. upsert em `almox.produto_referencia`;
5. upsert em `almox.produto_unidade`;
6. insert em `almox.estoque_importado`;
7. remove o estado atual existente da categoria importada em `almox.estoque_atual`;
8. insere a foto operacional nova dessa categoria em `almox.estoque_atual`;
9. marca o lote como `processado`.

Consequencia importante:

- o historico continua preservado em `almox.estoque_importado`;
- a leitura operacional deixa de depender do recalculo do historico inteiro.

---

## 4. Leitura atual do estoque pelo app

### 4.1 Tabela fisica interna

A estrutura que hoje representa o estado operacional pronto e:

- `almox.estoque_atual`

Ela foi criada em:

- [20260423230000_materializar_estoque_atual.sql](../supabase/migrations/20260423230000_materializar_estoque_atual.sql)
- e realinhada com os ultimos lotes processados por [20260423234500_realinhar_estoque_atual_materializado.sql](../supabase/migrations/20260423234500_realinhar_estoque_atual_materializado.sql)

Papel:

- 1 linha por `produto_unidade_id`;
- sempre correspondente ao ultimo lote importado daquela categoria.

### 4.2 View publica

O frontend continua lendo:

- `public.almox_estoque_atual`

Mas essa view publica agora faz apenas:

- `select ... from almox.estoque_atual`

Ou seja:

- o nome publico nao mudou;
- o contrato do app nao mudou;
- a fonte interna agora e materializada.

### 4.3 View interna de compatibilidade

`almox.v_estoque_atual` foi preservada por compatibilidade, mas agora ela tambem le:

- `almox.estoque_atual`

Isso reduz impacto em:

- views auxiliares;
- rollback;
- manutencao de codigo SQL legado.

### 4.4 Leitura no frontend

Em [almox-provider.tsx](../src/features/almox/almox-provider.tsx:135), `loadEstoqueAtualRows()`:

1. usa o client publico do Supabase;
2. consulta `almox_estoque_atual`;
3. seleciona apenas as colunas usadas pelo app;
4. ordena por:
   - `categoria_material`
   - `codigo_unidade`
   - `codigo_produto`
5. pagina de `1000` em `1000`.

Esse resultado alimenta o `refresh()` principal em [almox-provider.tsx](../src/features/almox/almox-provider.tsx:748), que atualiza:

- `rows`
- cache local
- `dataset`

---

## 5. O que existe dentro de `public.almox_estoque_atual`

Ela expone uma linha por produto da unidade, com o que o app entende como "estado atual" daquele item.

Campos expostos hoje:

- `categoria_material`
- `estoque_importado_id`
- `lote_importacao_id`
- `data_referencia`
- `importado_em`
- `unidade_id`
- `codigo_unidade`
- `nome_unidade`
- `produto_referencia_id`
- `codigo_produto_referencia`
- `nome_produto_referencia`
- `unidade_medida_referencia`
- `especie_padrao`
- `produto_unidade_id`
- `codigo_produto`
- `nome_produto`
- `unidade_medida_produto`
- `suficiencia_em_dias`
- `data_ultima_entrada`
- `valor_custo_medio`
- `consumo_medio`
- `estoque_atual`
- `criado_em`

Em outras palavras:

- continua sendo um "snapshot atual" do negocio;
- agora esse snapshot esta **persistido pronto**, e nao recalculado em tempo de consulta.

---

## 6. Gargalo anterior

Antes da materializacao, o desenho obrigava o banco a:

1. ler o historico de `almox.estoque_importado`;
2. decidir qual era a ultima linha de cada `produto_unidade_id`;
3. juntar isso com unidade, referencia e lote;
4. so depois entregar a visao atual para o frontend.

Esse era o motivo estrutural do timeout `57014`.

O problema nao era guardar historico. O problema era usar esse historico como fonte direta da tela operacional.

---

## 7. Evidencia objetiva antes e depois

### 7.1 Antes da correcao

O `EXPLAIN ANALYZE` salvo em [slqEditor.json](./slqEditor.json) mostrou:

- **359.518** linhas lidas em `almox.estoque_importado`
- **11.002** linhas produzidas como estoque atual
- **1000** linhas devolvidas na pagina testada
- **4035 ms** de tempo total

Leitura humana desse plano:

- [slqEditor.md](./slqEditor.md)

### 7.2 Depois da correcao

A mesma consulta, ja sobre a estrutura materializada, passou a mostrar:

- leitura por `Index Scan using estoque_atual_categoria_unidade_codigo_idx`
- **1000** linhas devolvidas
- **0,936 ms** de tempo total

Tambem foi validado que:

- `almox.estoque_atual` = **9.168** linhas
- `public.almox_estoque_atual` = **9.168** linhas
- `material_hospitalar` = **5.719** linhas
- `material_farmacologico` = **3.449** linhas
- a unidade legada `HMSA` deixou de existir no estado atual materializado
- a unidade atual `HMSASOUL` permaneceu

Resumo pratico:

- a consulta deixou de depender do historico inteiro;
- passou a ler diretamente a foto atual indexada.
- a tabela materializada ficou coerente com os ultimos lotes processados por categoria.

---

## 8. Dependencias que usam o estoque atual

### 8.1 App principal

Depende de `public.almox_estoque_atual` para:

- Dashboard
- Produtos
- Emprestimos
- Pedidos
- Consumo do mes

### 8.2 Snapshot diario

A funcao [registrar_snapshot_estoque_diario](../supabase/migrations/20260412130000_criar_snapshot_estoque_diario.sql:30) continua lendo `almox_estoque_atual`.

Como o contrato publico foi preservado:

- o snapshot diario continuou compativel sem reescrita imediata.

---

## 9. Resultado arquitetural

Hoje a pergunta do app:

- "me devolva o estoque atual"

passa a ser respondida assim:

- "leia a foto operacional pronta do estoque atual"

Em vez de:

- "recalcule o estoque atual em cima do historico e depois devolva"

Isso preserva:

- rastreabilidade;
- historico importado;
- compatibilidade do frontend;
- contrato das views publicas.
