create or replace function public.almox_dev_db_usage(
  p_top_tables int default 10,
  p_max_connections int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, almox, pg_catalog
as $$
declare
  v_db_name text;
  v_db_size_bytes bigint;
  v_top_tabelas jsonb;
  v_schemas jsonb;
  v_cache jsonb;
  v_conexoes jsonb;
begin
  select current_database() into v_db_name;
  select pg_database_size(v_db_name) into v_db_size_bytes;

  select coalesce(jsonb_agg(row_to_json(t) order by t.tamanho_total_bytes desc), '[]'::jsonb)
  into v_top_tabelas
  from (
    select
      n.nspname as schema,
      c.relname as tabela,
      pg_total_relation_size(c.oid) as tamanho_total_bytes,
      pg_relation_size(c.oid) as tamanho_heap_bytes,
      pg_indexes_size(c.oid) as tamanho_indices_bytes,
      coalesce(s.n_live_tup, c.reltuples::bigint) as linhas_estimadas,
      coalesce(s.n_dead_tup, 0) as linhas_mortas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where c.relkind in ('r', 'm')
      and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
    order by pg_total_relation_size(c.oid) desc
    limit p_top_tables
  ) t;

  select coalesce(jsonb_agg(row_to_json(s) order by s.tamanho_total_bytes desc), '[]'::jsonb)
  into v_schemas
  from (
    select
      n.nspname as schema,
      sum(pg_total_relation_size(c.oid))::bigint as tamanho_total_bytes
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'm')
      and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
    group by n.nspname
  ) s;

  select jsonb_build_object(
    'hit', coalesce(sum(blks_hit), 0),
    'read', coalesce(sum(blks_read), 0),
    'ratio', case
      when coalesce(sum(blks_hit), 0) + coalesce(sum(blks_read), 0) = 0 then null
      else round(
        sum(blks_hit)::numeric / (coalesce(sum(blks_hit), 0) + coalesce(sum(blks_read), 0)),
        4
      )
    end
  )
  into v_cache
  from pg_stat_database
  where datname = v_db_name;

  select coalesce(jsonb_agg(row_to_json(c) order by c.iniciada_em nulls last), '[]'::jsonb)
  into v_conexoes
  from (
    select
      pid,
      usename as usuario,
      application_name as aplicacao,
      state as estado,
      wait_event_type as espera_tipo,
      wait_event as espera_evento,
      query_start as iniciada_em,
      extract(epoch from (now() - query_start))::int as duracao_query_segundos,
      left(query, 300) as query
    from pg_stat_activity
    where datname = v_db_name
      and pid <> pg_backend_pid()
    order by query_start nulls last
    limit p_max_connections
  ) c;

  return jsonb_build_object(
    'database_nome', v_db_name,
    'database_tamanho_bytes', v_db_size_bytes,
    'limite_free_plan_bytes', 524288000,
    'top_tabelas', v_top_tabelas,
    'schemas', v_schemas,
    'cache', v_cache,
    'conexoes', v_conexoes,
    'medido_em', now()
  );
end;
$$;

comment on function public.almox_dev_db_usage(int, int) is
  'Metricas de uso do banco para tela de desenvolvedor. Gate de acesso aplicado na API route.';

create or replace function public.almox_dev_query_stats(p_limit int default 15)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_habilitado boolean;
  v_queries jsonb;
begin
  select exists (select 1 from pg_extension where extname = 'pg_stat_statements')
  into v_habilitado;

  if not v_habilitado then
    return jsonb_build_object('habilitado', false, 'queries', '[]'::jsonb);
  end if;

  begin
    execute format($fmt$
      select coalesce(jsonb_agg(row_to_json(q) order by q.total_exec_time desc), '[]'::jsonb)
      from (
        select
          left(query, 500) as query,
          calls,
          round(total_exec_time::numeric, 2) as total_exec_time_ms,
          round(mean_exec_time::numeric, 2) as mean_exec_time_ms,
          rows,
          shared_blks_hit,
          shared_blks_read
        from pg_stat_statements
        order by total_exec_time desc
        limit %L
      ) q
    $fmt$, p_limit) into v_queries;
  exception when others then
    return jsonb_build_object(
      'habilitado', true,
      'erro', sqlerrm,
      'queries', '[]'::jsonb
    );
  end;

  return jsonb_build_object('habilitado', true, 'queries', coalesce(v_queries, '[]'::jsonb));
end;
$$;

comment on function public.almox_dev_query_stats(int) is
  'Top queries por tempo total acumulado (pg_stat_statements). Gate de acesso aplicado na API route.';

revoke all on function public.almox_dev_db_usage(int, int) from public;
revoke all on function public.almox_dev_query_stats(int) from public;
grant execute on function public.almox_dev_db_usage(int, int) to service_role;
grant execute on function public.almox_dev_query_stats(int) to service_role;
