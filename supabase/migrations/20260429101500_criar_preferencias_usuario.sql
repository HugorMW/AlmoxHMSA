create table if not exists almox.preferencias_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  usuario_chave text not null,
  scope text not null,
  valor jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text null,
  constraint preferencias_usuario_usuario_ck check (char_length(btrim(usuario)) > 0),
  constraint preferencias_usuario_usuario_chave_ck check (char_length(btrim(usuario_chave)) > 0),
  constraint preferencias_usuario_scope_ck check (char_length(btrim(scope)) between 1 and 120)
);

create unique index if not exists preferencias_usuario_usuario_scope_uidx
  on almox.preferencias_usuario (usuario_chave, scope);

drop trigger if exists preferencias_usuario_definir_atualizado_em on almox.preferencias_usuario;

create trigger preferencias_usuario_definir_atualizado_em
before update on almox.preferencias_usuario
for each row
execute function almox.definir_atualizado_em();

comment on table almox.preferencias_usuario is 'Preferencias de interface por usuario autenticado no app.';
comment on column almox.preferencias_usuario.usuario is 'Usuario do SISCORE autenticado no app.';
comment on column almox.preferencias_usuario.usuario_chave is 'Usuario normalizado para lookup e upsert.';
comment on column almox.preferencias_usuario.scope is 'Escopo logico da preferencia, por exemplo consumo.columns.';
comment on column almox.preferencias_usuario.valor is 'Valor da preferencia em JSONB.';
comment on column almox.preferencias_usuario.atualizado_por is 'Usuario autenticado no app que gravou a preferencia.';

alter table almox.preferencias_usuario enable row level security;

grant usage on schema almox to authenticated;
grant select, insert, update on almox.preferencias_usuario to service_role;

create or replace function public.ler_preferencia_usuario(
  p_usuario text,
  p_scope text
)
returns table (
  usuario text,
  scope text,
  valor jsonb,
  atualizado_em timestamptz,
  atualizado_por text
)
language sql
security definer
set search_path = public, almox
as $$
  select
    p.usuario,
    p.scope,
    p.valor,
    p.atualizado_em,
    p.atualizado_por
  from almox.preferencias_usuario p
  where p.usuario_chave = lower(btrim(coalesce(p_usuario, '')))
    and p.scope = btrim(coalesce(p_scope, ''))
  limit 1;
$$;

create or replace function public.salvar_preferencia_usuario(
  p_usuario text,
  p_scope text,
  p_valor jsonb,
  p_atualizado_por text default null
)
returns table (
  usuario text,
  scope text,
  valor jsonb,
  atualizado_em timestamptz,
  atualizado_por text
)
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_usuario text := btrim(coalesce(p_usuario, ''));
  v_usuario_chave text := lower(v_usuario);
  v_scope text := btrim(coalesce(p_scope, ''));
begin
  if v_usuario = '' then
    raise exception 'Usuario obrigatorio para salvar preferencia.';
  end if;

  if v_scope = '' then
    raise exception 'Scope obrigatorio para salvar preferencia.';
  end if;

  return query
  insert into almox.preferencias_usuario (
    usuario,
    usuario_chave,
    scope,
    valor,
    atualizado_por
  )
  values (
    v_usuario,
    v_usuario_chave,
    v_scope,
    p_valor,
    coalesce(nullif(btrim(coalesce(p_atualizado_por, '')), ''), v_usuario)
  )
  on conflict (usuario_chave, scope)
  do update
  set usuario = excluded.usuario,
      valor = excluded.valor,
      atualizado_por = excluded.atualizado_por,
      atualizado_em = now()
  returning
    preferencias_usuario.usuario,
    preferencias_usuario.scope,
    preferencias_usuario.valor,
    preferencias_usuario.atualizado_em,
    preferencias_usuario.atualizado_por;
end;
$$;

revoke all on function public.ler_preferencia_usuario(text, text) from public, anon, authenticated;
revoke all on function public.salvar_preferencia_usuario(text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.ler_preferencia_usuario(text, text) to service_role;
grant execute on function public.salvar_preferencia_usuario(text, text, jsonb, text) to service_role;
