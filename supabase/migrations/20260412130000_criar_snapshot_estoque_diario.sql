-- Snapshot diario do estoque para apuracao de consumo mensal.
-- Registra o estado do estoque uma vez por dia (ultima execucao do dia
-- sobrescreve as anteriores) para permitir comparar consumo acumulado
-- no mes contra a media mensal do SISCORE.

create table if not exists almox.estoque_diario_snapshot (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  lote_importacao_id uuid,
  codigo_unidade text not null,
  nome_unidade text,
  codigo_produto text not null,
  nome_produto text,
  categoria_material text,
  unidade_medida text,
  estoque_atual numeric,
  consumo_medio numeric,
  suficiencia_em_dias numeric,
  valor_custo_medio numeric,
  criado_em timestamptz not null default now(),
  constraint estoque_diario_snapshot_uidx unique (data_referencia, codigo_unidade, codigo_produto)
);

create index if not exists estoque_diario_snapshot_data_idx
  on almox.estoque_diario_snapshot (data_referencia desc);

create index if not exists estoque_diario_snapshot_produto_idx
  on almox.estoque_diario_snapshot (codigo_unidade, codigo_produto, data_referencia desc);

create or replace function public.registrar_snapshot_estoque_diario(
  p_data_referencia date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_quantidade integer;
begin
  insert into almox.estoque_diario_snapshot (
    data_referencia,
    lote_importacao_id,
    codigo_unidade,
    nome_unidade,
    codigo_produto,
    nome_produto,
    categoria_material,
    unidade_medida,
    estoque_atual,
    consumo_medio,
    suficiencia_em_dias,
    valor_custo_medio
  )
  select
    p_data_referencia,
    lote_importacao_id,
    codigo_unidade,
    nome_unidade,
    codigo_produto,
    nome_produto,
    categoria_material,
    unidade_medida_produto,
    estoque_atual,
    consumo_medio,
    suficiencia_em_dias,
    valor_custo_medio
  from almox_estoque_atual
  on conflict (data_referencia, codigo_unidade, codigo_produto)
  do update set
    lote_importacao_id = excluded.lote_importacao_id,
    nome_unidade = excluded.nome_unidade,
    nome_produto = excluded.nome_produto,
    categoria_material = excluded.categoria_material,
    unidade_medida = excluded.unidade_medida,
    estoque_atual = excluded.estoque_atual,
    consumo_medio = excluded.consumo_medio,
    suficiencia_em_dias = excluded.suficiencia_em_dias,
    valor_custo_medio = excluded.valor_custo_medio,
    criado_em = now();

  get diagnostics v_quantidade = row_count;
  return v_quantidade;
end;
$$;

revoke all on function public.registrar_snapshot_estoque_diario(date) from public;
grant execute on function public.registrar_snapshot_estoque_diario(date) to service_role;

-- View para apurar consumo acumulado do mes vigente por produto/unidade.
-- Compara o snapshot mais antigo do mes corrente com o estoque atual e usa
-- o consumo_medio mensal do SISCORE como linha de corte.
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
