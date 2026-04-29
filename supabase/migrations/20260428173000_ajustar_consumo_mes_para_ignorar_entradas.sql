-- Ajusta a apuracao mensal para ignorar aumentos de estoque causados por
-- entradas no meio do mes. O consumo passa a ser a soma das quedas diarias
-- observadas nos snapshots, sem deixar entradas "apagarem" consumo real.

create or replace view public.almox_consumo_mes_atual as
with snapshot_inicio_mes as (
  select distinct on (codigo_unidade, codigo_produto)
    codigo_unidade,
    codigo_produto,
    data_referencia,
    estoque_atual as estoque_inicio_mes
  from almox.estoque_diario_snapshot
  where data_referencia >= date_trunc('month', current_date)::date
  order by codigo_unidade, codigo_produto, data_referencia asc
),
snapshot_deltas as (
  select
    s.codigo_unidade,
    s.codigo_produto,
    s.data_referencia,
    s.estoque_atual,
    lag(s.estoque_atual) over (
      partition by s.codigo_unidade, s.codigo_produto
      order by s.data_referencia
    ) as estoque_anterior
  from almox.estoque_diario_snapshot s
  where s.data_referencia >= date_trunc('month', current_date)::date
),
consumo_agregado as (
  select
    codigo_unidade,
    codigo_produto,
    sum(
      greatest(
        coalesce(estoque_anterior, estoque_atual) - coalesce(estoque_atual, 0),
        0
      )
    ) as consumo_mes_ate_hoje
  from snapshot_deltas
  group by codigo_unidade, codigo_produto
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
  coalesce(consumo.consumo_mes_ate_hoje, 0) as consumo_mes_ate_hoje,
  case
    when coalesce(atual.consumo_medio, 0) <= 0 then null
    else round(
      (
        coalesce(consumo.consumo_mes_ate_hoje, 0) / atual.consumo_medio
      )::numeric,
      3
    )
  end as percentual_consumido
from almox_estoque_atual atual
left join snapshot_inicio_mes snap
  on snap.codigo_unidade = atual.codigo_unidade
 and snap.codigo_produto = atual.codigo_produto
left join consumo_agregado consumo
  on consumo.codigo_unidade = atual.codigo_unidade
 and consumo.codigo_produto = atual.codigo_produto;

grant select on public.almox_consumo_mes_atual to anon, authenticated, service_role;
