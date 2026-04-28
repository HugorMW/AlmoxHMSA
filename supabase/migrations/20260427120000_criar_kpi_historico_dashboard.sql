-- Funcao para agregar a serie historica de KPIs por hospital e nivel,
-- consumindo os snapshots diarios ja registrados em almox.estoque_diario_snapshot.
-- Bucketiza suficiencia_em_dias usando os thresholds de almox.configuracao_sistema
-- (com fallback para os defaults do app).

create or replace function public.almox_dashboard_kpi_historico(
  p_dias integer default 14
)
returns table(
  data_referencia date,
  codigo_unidade text,
  urgent integer,
  critical integer,
  high integer,
  medium integer,
  low integer,
  stable integer,
  total_products integer
)
language plpgsql
stable
security definer
set search_path = public, almox
as $$
declare
  v_critico numeric;
  v_alto numeric;
  v_medio numeric;
  v_baixo numeric;
  v_dias integer := greatest(coalesce(p_dias, 14), 1);
begin
  select coalesce((valor #>> '{}')::numeric, 7)
    into v_critico
    from almox.configuracao_sistema
   where chave = 'criticoDias' and codigo_unidade is null
   limit 1;

  select coalesce((valor #>> '{}')::numeric, 15)
    into v_alto
    from almox.configuracao_sistema
   where chave = 'altoDias' and codigo_unidade is null
   limit 1;

  select coalesce((valor #>> '{}')::numeric, 30)
    into v_medio
    from almox.configuracao_sistema
   where chave = 'medioDias' and codigo_unidade is null
   limit 1;

  select coalesce((valor #>> '{}')::numeric, 60)
    into v_baixo
    from almox.configuracao_sistema
   where chave = 'baixoDias' and codigo_unidade is null
   limit 1;

  v_critico := coalesce(v_critico, 7);
  v_alto := coalesce(v_alto, 15);
  v_medio := coalesce(v_medio, 30);
  v_baixo := coalesce(v_baixo, 60);

  return query
    select
      s.data_referencia,
      s.codigo_unidade,
      sum(case when coalesce(s.suficiencia_em_dias, 0) <= 0 then 1 else 0 end)::integer as urgent,
      sum(case when coalesce(s.suficiencia_em_dias, 0) > 0
                and coalesce(s.suficiencia_em_dias, 0) <= v_critico then 1 else 0 end)::integer as critical,
      sum(case when coalesce(s.suficiencia_em_dias, 0) > v_critico
                and coalesce(s.suficiencia_em_dias, 0) <= v_alto then 1 else 0 end)::integer as high,
      sum(case when coalesce(s.suficiencia_em_dias, 0) > v_alto
                and coalesce(s.suficiencia_em_dias, 0) <= v_medio then 1 else 0 end)::integer as medium,
      sum(case when coalesce(s.suficiencia_em_dias, 0) > v_medio
                and coalesce(s.suficiencia_em_dias, 0) <= v_baixo then 1 else 0 end)::integer as low,
      sum(case when coalesce(s.suficiencia_em_dias, 0) > v_baixo then 1 else 0 end)::integer as stable,
      count(*)::integer as total_products
    from almox.estoque_diario_snapshot s
    where s.data_referencia >= current_date - (v_dias - 1)
    group by s.data_referencia, s.codigo_unidade
    order by s.data_referencia asc, s.codigo_unidade asc;
end;
$$;

revoke all on function public.almox_dashboard_kpi_historico(integer) from public;
grant execute on function public.almox_dashboard_kpi_historico(integer) to authenticated, service_role;
