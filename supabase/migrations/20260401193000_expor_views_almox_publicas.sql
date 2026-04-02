create or replace view public.almox_estoque_atual as
select
  estoque_importado_id,
  lote_importacao_id,
  data_referencia,
  importado_em,
  unidade_id,
  codigo_unidade,
  nome_unidade,
  produto_referencia_id,
  codigo_produto_referencia,
  nome_produto_referencia,
  unidade_medida_referencia,
  especie_padrao,
  produto_unidade_id,
  codigo_produto,
  nome_produto,
  unidade_medida_produto,
  suficiencia_em_dias,
  data_ultima_entrada,
  valor_custo_medio,
  consumo_medio,
  estoque_atual,
  criado_em
from almox.v_estoque_atual;

create or replace view public.almox_emprestimo_disponivel as
select
  produto_referencia_id,
  codigo_produto_referencia,
  nome_produto_referencia,
  unidade_id,
  codigo_unidade,
  nome_unidade,
  produto_unidade_id,
  codigo_produto,
  nome_produto,
  suficiencia_em_dias,
  consumo_medio,
  estoque_atual,
  data_ultima_entrada
from almox.v_emprestimo_disponivel;

grant select on public.almox_estoque_atual to anon, authenticated;
grant select on public.almox_emprestimo_disponivel to anon, authenticated;
