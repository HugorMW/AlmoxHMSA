create table if not exists almox.siscore_credencial_usuario (
  id uuid primary key default gen_random_uuid(),
  siscore_usuario text not null,
  siscore_usuario_chave text not null unique,
  senha_cifrada text not null,
  iv text not null,
  auth_tag text not null,
  ultima_validacao_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger siscore_credencial_usuario_definir_atualizado_em
before update on almox.siscore_credencial_usuario
for each row
execute function almox.definir_atualizado_em();

comment on table almox.siscore_credencial_usuario is 'Credenciais do SISCORE cifradas por usuario autenticado no app.';
comment on column almox.siscore_credencial_usuario.siscore_usuario is 'Usuario do SISCORE informado no login.';
comment on column almox.siscore_credencial_usuario.siscore_usuario_chave is 'Usuario normalizado para busca e upsert.';
comment on column almox.siscore_credencial_usuario.senha_cifrada is 'Senha cifrada com chave server-side.';
comment on column almox.siscore_credencial_usuario.iv is 'Nonce usado na cifra AES-GCM.';
comment on column almox.siscore_credencial_usuario.auth_tag is 'Tag de autenticacao da cifra AES-GCM.';
comment on column almox.siscore_credencial_usuario.ultima_validacao_em is 'Momento do ultimo login validado no SISCORE.';
comment on column almox.siscore_credencial_usuario.ultimo_uso_em is 'Momento em que a credencial foi usada pela ultima vez na sincronizacao.';
