create table if not exists public.almox_exclusoes_hmsa (
  id uuid primary key default gen_random_uuid(),
  cd_produto text not null,
  ds_produto text,
  codigo_unidade text not null default 'HMSASOUL',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (codigo_unidade, cd_produto),
  constraint almox_exclusoes_hmsa_unidade_chk
    check (upper(codigo_unidade) in ('HMSA', 'HMSASOUL'))
);

drop trigger if exists almox_exclusoes_hmsa_definir_atualizado_em on public.almox_exclusoes_hmsa;

create trigger almox_exclusoes_hmsa_definir_atualizado_em
before update on public.almox_exclusoes_hmsa
for each row
execute function almox.definir_atualizado_em();

comment on table public.almox_exclusoes_hmsa is 'Itens do HMSA ocultados manualmente do site por cd_produto.';
comment on column public.almox_exclusoes_hmsa.cd_produto is 'Codigo do produto local do HMSA que nao deve aparecer no site.';
comment on column public.almox_exclusoes_hmsa.ds_produto is 'Descricao do produto no momento do cadastro da exclusao.';
comment on column public.almox_exclusoes_hmsa.ativo is 'Define se a exclusao segue valendo para o site.';

grant select, insert, update, delete on public.almox_exclusoes_hmsa to anon, authenticated;

alter table public.almox_exclusoes_hmsa enable row level security;

drop policy if exists almox_exclusoes_hmsa_select on public.almox_exclusoes_hmsa;
create policy almox_exclusoes_hmsa_select
on public.almox_exclusoes_hmsa
for select
to anon, authenticated
using (true);

drop policy if exists almox_exclusoes_hmsa_insert on public.almox_exclusoes_hmsa;
create policy almox_exclusoes_hmsa_insert
on public.almox_exclusoes_hmsa
for insert
to anon, authenticated
with check (upper(codigo_unidade) in ('HMSA', 'HMSASOUL'));

drop policy if exists almox_exclusoes_hmsa_update on public.almox_exclusoes_hmsa;
create policy almox_exclusoes_hmsa_update
on public.almox_exclusoes_hmsa
for update
to anon, authenticated
using (true)
with check (upper(codigo_unidade) in ('HMSA', 'HMSASOUL'));

drop policy if exists almox_exclusoes_hmsa_delete on public.almox_exclusoes_hmsa;
create policy almox_exclusoes_hmsa_delete
on public.almox_exclusoes_hmsa
for delete
to anon, authenticated
using (true);
