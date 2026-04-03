create table if not exists almox.siscore_sync_execucao (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid not null,
  job_tipo text not null
    check (job_tipo in ('estoque', 'notas_fiscais')),
  scope text not null
    check (scope in ('all', 'estoque', 'material_hospitalar', 'material_farmacologico', 'notas_fiscais')),
  usuario text not null,
  triggered_by text not null,
  workflow_arquivo text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failed')),
  workflow_run_url text,
  mensagem_erro text,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  metadados jsonb not null default '{}'::jsonb
);

create unique index if not exists siscore_sync_execucao_tracking_job_uidx
  on almox.siscore_sync_execucao (tracking_id, job_tipo);

create index if not exists siscore_sync_execucao_tracking_idx
  on almox.siscore_sync_execucao (tracking_id, criado_em desc);

drop trigger if exists siscore_sync_execucao_definir_atualizado_em on almox.siscore_sync_execucao;
create trigger siscore_sync_execucao_definir_atualizado_em
before update on almox.siscore_sync_execucao
for each row
execute function almox.definir_atualizado_em();

create or replace function public.registrar_sincronizacoes_siscore_enfileiradas(
  p_tracking_id uuid,
  p_usuario text,
  p_triggered_by text,
  p_jobs jsonb
)
returns void
language sql
security definer
set search_path = public, almox
as $$
  insert into almox.siscore_sync_execucao (
    tracking_id,
    job_tipo,
    scope,
    usuario,
    triggered_by,
    workflow_arquivo,
    status,
    workflow_run_url,
    mensagem_erro,
    iniciado_em,
    finalizado_em,
    metadados
  )
  select
    p_tracking_id,
    job ->> 'job_tipo',
    coalesce(job ->> 'scope', 'all'),
    p_usuario,
    coalesce(nullif(p_triggered_by, ''), p_usuario),
    job ->> 'workflow_arquivo',
    'queued',
    null,
    null,
    null,
    null,
    coalesce(job -> 'metadados', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) as job
  on conflict (tracking_id, job_tipo) do update
    set scope = excluded.scope,
        usuario = excluded.usuario,
        triggered_by = excluded.triggered_by,
        workflow_arquivo = excluded.workflow_arquivo,
        status = 'queued',
        workflow_run_url = null,
        mensagem_erro = null,
        iniciado_em = null,
        finalizado_em = null,
        metadados = coalesce(almox.siscore_sync_execucao.metadados, '{}'::jsonb) || coalesce(excluded.metadados, '{}'::jsonb),
        atualizado_em = now();
$$;

create or replace function public.atualizar_sincronizacao_siscore_status(
  p_tracking_id uuid,
  p_job_tipo text,
  p_scope text,
  p_usuario text,
  p_triggered_by text,
  p_workflow_arquivo text,
  p_status text,
  p_mensagem_erro text default null,
  p_workflow_run_url text default null,
  p_metadados jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, almox
as $$
  insert into almox.siscore_sync_execucao (
    tracking_id,
    job_tipo,
    scope,
    usuario,
    triggered_by,
    workflow_arquivo,
    status,
    workflow_run_url,
    mensagem_erro,
    iniciado_em,
    finalizado_em,
    metadados
  )
  values (
    p_tracking_id,
    p_job_tipo,
    p_scope,
    p_usuario,
    coalesce(nullif(p_triggered_by, ''), p_usuario),
    p_workflow_arquivo,
    p_status,
    p_workflow_run_url,
    p_mensagem_erro,
    case when p_status = 'running' then now() else null end,
    case when p_status in ('success', 'failed') then now() else null end,
    coalesce(p_metadados, '{}'::jsonb)
  )
  on conflict (tracking_id, job_tipo) do update
    set scope = excluded.scope,
        usuario = excluded.usuario,
        triggered_by = excluded.triggered_by,
        workflow_arquivo = excluded.workflow_arquivo,
        status = excluded.status,
        workflow_run_url = coalesce(excluded.workflow_run_url, almox.siscore_sync_execucao.workflow_run_url),
        mensagem_erro = excluded.mensagem_erro,
        iniciado_em = case
          when excluded.status = 'running' then coalesce(almox.siscore_sync_execucao.iniciado_em, now())
          else almox.siscore_sync_execucao.iniciado_em
        end,
        finalizado_em = case
          when excluded.status in ('success', 'failed') then now()
          else almox.siscore_sync_execucao.finalizado_em
        end,
        metadados = coalesce(almox.siscore_sync_execucao.metadados, '{}'::jsonb) || coalesce(excluded.metadados, '{}'::jsonb),
        atualizado_em = now();
$$;

create or replace function public.listar_sincronizacoes_siscore(
  p_tracking_id uuid
)
returns table (
  tracking_id uuid,
  job_tipo text,
  scope text,
  usuario text,
  triggered_by text,
  workflow_arquivo text,
  status text,
  workflow_run_url text,
  mensagem_erro text,
  criado_em timestamptz,
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  atualizado_em timestamptz,
  metadados jsonb
)
language sql
security definer
set search_path = public, almox
as $$
  select
    execucao.tracking_id,
    execucao.job_tipo,
    execucao.scope,
    execucao.usuario,
    execucao.triggered_by,
    execucao.workflow_arquivo,
    execucao.status,
    execucao.workflow_run_url,
    execucao.mensagem_erro,
    execucao.criado_em,
    execucao.iniciado_em,
    execucao.finalizado_em,
    execucao.atualizado_em,
    execucao.metadados
  from almox.siscore_sync_execucao as execucao
  where execucao.tracking_id = p_tracking_id
  order by
    case execucao.job_tipo
      when 'estoque' then 0
      when 'notas_fiscais' then 1
      else 9
    end,
    execucao.criado_em asc;
$$;

revoke all on function public.registrar_sincronizacoes_siscore_enfileiradas(uuid, text, text, jsonb) from public;
revoke all on function public.atualizar_sincronizacao_siscore_status(uuid, text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public.listar_sincronizacoes_siscore(uuid) from public;

grant execute on function public.registrar_sincronizacoes_siscore_enfileiradas(uuid, text, text, jsonb) to service_role;
grant execute on function public.atualizar_sincronizacao_siscore_status(uuid, text, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.listar_sincronizacoes_siscore(uuid) to service_role;
