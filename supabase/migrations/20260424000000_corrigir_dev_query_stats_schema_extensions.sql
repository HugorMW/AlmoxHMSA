create or replace function public.almox_dev_query_stats(p_limit int default 15)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_habilitado boolean;
  v_schema text;
  v_queries jsonb;
begin
  select n.nspname
  into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_stat_statements';

  v_habilitado := v_schema is not null;

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
        from %I.pg_stat_statements
        order by total_exec_time desc
        limit %L
      ) q
    $fmt$, v_schema, p_limit) into v_queries;
  exception when others then
    return jsonb_build_object(
      'habilitado', true,
      'schema', v_schema,
      'erro', sqlerrm,
      'queries', '[]'::jsonb
    );
  end;

  return jsonb_build_object(
    'habilitado', true,
    'schema', v_schema,
    'queries', coalesce(v_queries, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.almox_dev_query_stats(int) from public;
grant execute on function public.almox_dev_query_stats(int) to service_role;
