create or replace function public.salvar_credencial_siscore_usuario(
  p_siscore_usuario text,
  p_siscore_usuario_chave text,
  p_senha_cifrada text,
  p_iv text,
  p_auth_tag text
)
returns void
language plpgsql
security definer
set search_path = public, almox
as $$
begin
  insert into almox.siscore_credencial_usuario (
    siscore_usuario,
    siscore_usuario_chave,
    senha_cifrada,
    iv,
    auth_tag,
    ultima_validacao_em
  )
  values (
    p_siscore_usuario,
    p_siscore_usuario_chave,
    p_senha_cifrada,
    p_iv,
    p_auth_tag,
    now()
  )
  on conflict (siscore_usuario_chave) do update
    set siscore_usuario = excluded.siscore_usuario,
        senha_cifrada = excluded.senha_cifrada,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        ultima_validacao_em = now(),
        atualizado_em = now();
end;
$$;

create or replace function public.ler_credencial_siscore_usuario(
  p_siscore_usuario_chave text
)
returns table (
  siscore_usuario text,
  senha_cifrada text,
  iv text,
  auth_tag text,
  ultima_validacao_em timestamptz,
  ultimo_uso_em timestamptz
)
language sql
security definer
set search_path = public, almox
as $$
  select
    c.siscore_usuario,
    c.senha_cifrada,
    c.iv,
    c.auth_tag,
    c.ultima_validacao_em,
    c.ultimo_uso_em
  from almox.siscore_credencial_usuario c
  where c.siscore_usuario_chave = p_siscore_usuario_chave
  limit 1;
$$;

create or replace function public.registrar_uso_credencial_siscore_usuario(
  p_siscore_usuario_chave text
)
returns void
language plpgsql
security definer
set search_path = public, almox
as $$
begin
  update almox.siscore_credencial_usuario
  set ultimo_uso_em = now(),
      atualizado_em = now()
  where siscore_usuario_chave = p_siscore_usuario_chave;
end;
$$;

revoke all on function public.salvar_credencial_siscore_usuario(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.ler_credencial_siscore_usuario(text) from public, anon, authenticated;
revoke all on function public.registrar_uso_credencial_siscore_usuario(text) from public, anon, authenticated;

grant execute on function public.salvar_credencial_siscore_usuario(text, text, text, text, text) to service_role;
grant execute on function public.ler_credencial_siscore_usuario(text) to service_role;
grant execute on function public.registrar_uso_credencial_siscore_usuario(text) to service_role;
