create table if not exists public.almox_excecoes_cmm_hmsa (
  id uuid primary key default gen_random_uuid(),
  cd_produto text not null,
  ds_produto text,
  codigo_unidade text not null default 'HMSASOUL',
  categoria_material text
    check (categoria_material in ('material_hospitalar', 'material_farmacologico')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (codigo_unidade, cd_produto),
  constraint almox_excecoes_cmm_hmsa_unidade_chk
    check (upper(codigo_unidade) in ('HMSA', 'HMSASOUL'))
);

drop trigger if exists almox_excecoes_cmm_hmsa_definir_atualizado_em on public.almox_excecoes_cmm_hmsa;

create trigger almox_excecoes_cmm_hmsa_definir_atualizado_em
before update on public.almox_excecoes_cmm_hmsa
for each row
execute function almox.definir_atualizado_em();

comment on table public.almox_excecoes_cmm_hmsa is 'Itens do HMSA que continuam visiveis mesmo quando a exclusao automatica de CMM menor que 1 esta ativa.';
comment on column public.almox_excecoes_cmm_hmsa.cd_produto is 'Codigo do produto local do HMSA que deve ser excecao da regra automatica de CMM menor que 1.';
comment on column public.almox_excecoes_cmm_hmsa.ds_produto is 'Descricao do produto no momento do cadastro da excecao.';
comment on column public.almox_excecoes_cmm_hmsa.categoria_material is 'Classificacao do material no momento do cadastro da excecao.';
comment on column public.almox_excecoes_cmm_hmsa.ativo is 'Define se a excecao segue valendo para o site.';

grant select, insert, update, delete on public.almox_excecoes_cmm_hmsa to anon, authenticated;

alter table public.almox_excecoes_cmm_hmsa enable row level security;

drop policy if exists almox_excecoes_cmm_hmsa_select on public.almox_excecoes_cmm_hmsa;
create policy almox_excecoes_cmm_hmsa_select
on public.almox_excecoes_cmm_hmsa
for select
to anon, authenticated
using (true);

drop policy if exists almox_excecoes_cmm_hmsa_insert on public.almox_excecoes_cmm_hmsa;
create policy almox_excecoes_cmm_hmsa_insert
on public.almox_excecoes_cmm_hmsa
for insert
to anon, authenticated
with check (upper(codigo_unidade) in ('HMSA', 'HMSASOUL'));

drop policy if exists almox_excecoes_cmm_hmsa_update on public.almox_excecoes_cmm_hmsa;
create policy almox_excecoes_cmm_hmsa_update
on public.almox_excecoes_cmm_hmsa
for update
to anon, authenticated
using (true)
with check (upper(codigo_unidade) in ('HMSA', 'HMSASOUL'));

drop policy if exists almox_excecoes_cmm_hmsa_delete on public.almox_excecoes_cmm_hmsa;
create policy almox_excecoes_cmm_hmsa_delete
on public.almox_excecoes_cmm_hmsa
for delete
to anon, authenticated
using (true);
