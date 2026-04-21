-- Acelera a view almox.v_estoque_atual: o DISTINCT ON original ordenava
-- por colunas vindas de lote_importacao, forcando um sort sobre todas as
-- ~300k linhas de estoque_importado a cada consulta. Foi verificado que
-- ordenar apenas por (produto_unidade_id, criado_em desc) produz o mesmo
-- conjunto de "linhas mais recentes por produto_unidade", e com o indice
-- composto abaixo o DISTINCT ON vira um simples Index Scan.

create index if not exists estoque_importado_atual_idx
  on almox.estoque_importado (produto_unidade_id, criado_em desc);

drop view if exists public.almox_consumo_mes_atual;
drop view if exists public.almox_emprestimo_disponivel;
drop view if exists public.almox_estoque_atual;
drop view if exists almox.v_emprestimo_disponivel;
drop view if exists almox.v_estoque_atual;

create view almox.v_estoque_atual as
select distinct on (ei.produto_unidade_id)
  li.categoria_material,
  ei.id as estoque_importado_id,
  li.id as lote_importacao_id,
  li.data_referencia,
  li.importado_em,
  u.id as unidade_id,
  u.codigo_unidade,
  u.nome_unidade,
  pr.id as produto_referencia_id,
  pr.codigo_produto_referencia,
  pr.nome_produto_referencia,
  pr.unidade_medida_referencia,
  pr.especie_padrao,
  pu.id as produto_unidade_id,
  pu.codigo_produto,
  pu.nome_produto,
  pu.unidade_medida_produto,
  ei.suficiencia_em_dias,
  ei.data_ultima_entrada,
  ei.valor_custo_medio,
  ei.consumo_medio,
  ei.estoque_atual,
  ei.criado_em
from almox.estoque_importado ei
join almox.produto_unidade pu
  on pu.id = ei.produto_unidade_id
join almox.unidade u
  on u.id = pu.unidade_id
left join almox.produto_referencia pr
  on pr.id = pu.produto_referencia_id
join almox.lote_importacao li
  on li.id = ei.lote_importacao_id
order by
  ei.produto_unidade_id,
  ei.criado_em desc;

create view almox.v_emprestimo_disponivel as
select
  ea.categoria_material,
  pr.id as produto_referencia_id,
  pr.codigo_produto_referencia,
  pr.nome_produto_referencia,
  u.id as unidade_id,
  u.codigo_unidade,
  u.nome_unidade,
  pu.id as produto_unidade_id,
  pu.codigo_produto,
  pu.nome_produto,
  ea.suficiencia_em_dias,
  ea.consumo_medio,
  ea.estoque_atual,
  ea.data_ultima_entrada
from almox.v_estoque_atual ea
join almox.produto_unidade pu
  on pu.id = ea.produto_unidade_id
join almox.unidade u
  on u.id = ea.unidade_id
join almox.produto_referencia pr
  on pr.id = ea.produto_referencia_id
where pr.codigo_produto_referencia is not null;

create view public.almox_estoque_atual as
select
  categoria_material,
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

create view public.almox_emprestimo_disponivel as
select
  categoria_material,
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

create view public.almox_consumo_mes_atual as
with snapshot_inicio_mes as (
  select distinct on (codigo_unidade, codigo_produto)
    codigo_unidade,
    codigo_produto,
    data_referencia,
    estoque_atual as estoque_inicio_mes
  from almox.estoque_diario_snapshot
  where data_referencia >= date_trunc('month', current_date)::date
  order by codigo_unidade, codigo_produto, data_referencia asc
)
select
  atual.categoria_material,
  atual.codigo_unidade,
  atual.nome_unidade,
  atual.codigo_produto,
  atual.nome_produto,
  atual.unidade_medida_produto,
  atual.estoque_atual,
  atual.consumo_medio,
  atual.suficiencia_em_dias,
  snap.data_referencia as data_snapshot_inicio,
  snap.estoque_inicio_mes,
  greatest(
    coalesce(snap.estoque_inicio_mes, 0) - coalesce(atual.estoque_atual, 0),
    0
  ) as consumo_mes_ate_hoje,
  case
    when coalesce(atual.consumo_medio, 0) <= 0 then null
    else round(
      (
        greatest(
          coalesce(snap.estoque_inicio_mes, 0) - coalesce(atual.estoque_atual, 0),
          0
        ) / atual.consumo_medio
      )::numeric,
      3
    )
  end as percentual_consumido
from almox_estoque_atual atual
left join snapshot_inicio_mes snap
  on snap.codigo_unidade = atual.codigo_unidade
 and snap.codigo_produto = atual.codigo_produto;

grant select on public.almox_consumo_mes_atual to anon, authenticated, service_role;
