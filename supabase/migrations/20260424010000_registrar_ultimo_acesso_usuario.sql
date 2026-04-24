alter table almox.siscore_credencial_usuario
  add column if not exists ultimo_acesso_em timestamptz;

comment on column almox.siscore_credencial_usuario.ultimo_acesso_em is
  'Momento do ultimo request autenticado com a sessao deste usuario. Usado para medir quem esta online.';

create or replace function public.registrar_acesso_siscore_usuario(
  p_siscore_usuario_chave text
)
returns void
language plpgsql
security definer
set search_path = public, almox
as $$
begin
  update almox.siscore_credencial_usuario
  set ultimo_acesso_em = now()
  where siscore_usuario_chave = p_siscore_usuario_chave;
end;
$$;

revoke all on function public.registrar_acesso_siscore_usuario(text) from public, anon, authenticated;
grant execute on function public.registrar_acesso_siscore_usuario(text) to service_role;

create or replace function public.almox_dev_usuarios_online(
  p_janela_minutos int default 5,
  p_max_usuarios int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, almox, pg_catalog
as $$
declare
  v_agora timestamptz := now();
  v_corte timestamptz := v_agora - make_interval(mins => p_janela_minutos);
  v_online jsonb;
  v_recentes jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(u) order by u.ultimo_acesso_em desc), '[]'::jsonb)
  into v_online
  from (
    select
      siscore_usuario as usuario,
      ultimo_acesso_em,
      extract(epoch from (v_agora - ultimo_acesso_em))::int as segundos_desde_acesso,
      ultima_validacao_em
    from almox.siscore_credencial_usuario
    where ultimo_acesso_em is not null
      and ultimo_acesso_em >= v_corte
    order by ultimo_acesso_em desc
    limit p_max_usuarios
  ) u;

  select coalesce(jsonb_agg(row_to_json(r) order by r.ultimo_acesso_em desc nulls last), '[]'::jsonb)
  into v_recentes
  from (
    select
      siscore_usuario as usuario,
      ultimo_acesso_em,
      ultima_validacao_em
    from almox.siscore_credencial_usuario
    where ultimo_acesso_em is null
       or ultimo_acesso_em < v_corte
    order by coalesce(ultimo_acesso_em, ultima_validacao_em) desc nulls last
    limit p_max_usuarios
  ) r;

  return jsonb_build_object(
    'janela_minutos', p_janela_minutos,
    'medido_em', v_agora,
    'online', v_online,
    'recentes', v_recentes
  );
end;
$$;

comment on function public.almox_dev_usuarios_online(int, int) is
  'Usuarios com sessao ativa (ultimo_acesso_em dentro da janela) e ultimos acessos fora dela. Gate aplicado na API route.';

revoke all on function public.almox_dev_usuarios_online(int, int) from public;
grant execute on function public.almox_dev_usuarios_online(int, int) to service_role;
