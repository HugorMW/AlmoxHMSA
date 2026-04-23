# Analise do `EXPLAIN ANALYZE` de `almox_estoque_atual`

Leitura humana do resultado salvo em [slqEditor.json](./slqEditor.json).

Esse documento existe para registrar o diagnostico real do banco antes da correcao estrutural.

---

## 1. Consulta analisada

Foi analisada a consulta equivalente a:

```sql
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

Esse e exatamente o tipo de leitura que o frontend faz no primeiro carregamento do provider.

---

## 2. Resultado resumido

Numeros principais do plano salvo em [slqEditor.json](./slqEditor.json):

- tempo total: **4035 ms**
- linhas finais devolvidas: **1000**
- linhas montadas pela subquery `v_estoque_atual`: **11.002**
- linhas lidas em `almox.estoque_importado`: **359.518**

---

## 3. O que o plano mostra

### 3.1 O `Sort` final existe, mas nao e o principal gargalo

Trecho relevante:

- `Sort actual time=4034.454..4034.522`

Isso significa que o `Sort` acontece no fim, quase como reflexo do custo anterior. Ele nao explica sozinho os ~4 segundos totais.

### 3.2 O grosso do custo esta em montar a view

Trechos relevantes:

- `Index Scan using estoque_importado_atual_idx on almox.estoque_importado`
- `actual time=0.013..3296.111`
- `rows=359518`

- `Merge Join`
- `actual time=0.940..3754.882`

- `Unique`
- `actual time=2.093..3996.161`

Traduzindo:

- o banco le o historico grande;
- junta com as outras tabelas;
- remove duplicidade para achar a ultima linha de cada produto/unidade;
- so entao produz a visao "atual".

### 3.3 A otimizacao anterior ajudou, mas nao resolveu a causa estrutural

Ja existe uma migration para acelerar a view:

- [20260421140000_acelerar_view_estoque_atual.sql](../supabase/migrations/20260421140000_acelerar_view_estoque_atual.sql)

Ela melhorou o `DISTINCT ON` interno e o acesso por indice em `estoque_importado`.

Mesmo assim, o plano ainda mostra que:

- a view continua dependendo da leitura do historico inteiro relevante;
- o app continua pagando esse custo toda vez que consulta o estoque atual.

---

## 4. Conclusao objetiva

O diagnostico medido e:

- **o problema principal nao e mais uma suspeita no `ORDER BY`**
- **o problema principal e calcular o estoque atual em tempo de consulta, em cima do historico**

Em termos de negocio:

- para devolver uma pagina de 1000 itens atuais, o banco percorre centenas de milhares de registros historicos.

Em termos de arquitetura:

- `public.almox_estoque_atual` esta carregando duas responsabilidades:
  1. representar o estado atual;
  2. recalcular esse estado atual.

O segundo papel e o que precisa sair dela.

---

## 5. O que este plano invalida

Antes desse `EXPLAIN ANALYZE`, havia uma hipotese forte de que o problema principal pudesse ser:

- `ORDER BY categoria_material, codigo_unidade, codigo_produto`

Depois da medicao, essa leitura precisa ser corrigida:

- o `ORDER BY` pode contribuir, mas nao e o centro do problema;
- o centro do problema e a view depender do historico para responder "qual e o estado atual".

---

## 6. O que este plano passa a justificar

Este resultado justifica uma mudanca estrutural, nao apenas ajustes cosmeticos:

1. criar uma estrutura fisica de estoque atual;
2. atualizar essa estrutura durante a importacao do SISCORE;
3. manter `public.almox_estoque_atual` como contrato publico fino;
4. continuar usando `almox.estoque_importado` como historico.

O detalhamento dessa correcao esta em [plano-correcao-estoque-atual.md](./plano-correcao-estoque-atual.md).
