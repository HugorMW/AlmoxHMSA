create table if not exists public.almox_processos_acompanhamento_produtos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.almox_processos_acompanhamento(id) on delete cascade,
  ordem integer not null default 0,
  cod_bionexo text not null default '',
  cd_produto text not null,
  ds_produto text not null,
  categoria_material text not null,
  produto_manual boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists almox_processos_acompanhamento_produtos_processo_idx
  on public.almox_processos_acompanhamento_produtos (processo_id);

create index if not exists almox_processos_acompanhamento_produtos_categoria_idx
  on public.almox_processos_acompanhamento_produtos (categoria_material);

create index if not exists almox_processos_acompanhamento_produtos_cd_produto_idx
  on public.almox_processos_acompanhamento_produtos (cd_produto);

create unique index if not exists almox_processos_acompanhamento_produtos_unique_cd_idx
  on public.almox_processos_acompanhamento_produtos (processo_id, cd_produto);

drop trigger if exists almox_processos_acompanhamento_produtos_definir_atualizado_em
  on public.almox_processos_acompanhamento_produtos;

create trigger almox_processos_acompanhamento_produtos_definir_atualizado_em
before update on public.almox_processos_acompanhamento_produtos
for each row
execute function almox.definir_atualizado_em();

insert into public.almox_processos_acompanhamento_produtos (
  processo_id, ordem, cod_bionexo, cd_produto, ds_produto, categoria_material, produto_manual
)
select
  id,
  0,
  coalesce(cod_bionexo, ''),
  cd_produto,
  ds_produto,
  categoria_material,
  coalesce(produto_manual, false)
from public.almox_processos_acompanhamento p
where cd_produto is not null
  and not exists (
    select 1 from public.almox_processos_acompanhamento_produtos f where f.processo_id = p.id
  );

alter table public.almox_processos_acompanhamento
  drop column if exists cod_bionexo,
  drop column if exists cd_produto,
  drop column if exists ds_produto,
  drop column if exists produto_manual;

drop index if exists public.almox_processos_acompanhamento_cod_bionexo_idx;
drop index if exists public.almox_processos_acompanhamento_produto_manual_idx;

grant select, insert, update, delete on public.almox_processos_acompanhamento_produtos to anon, authenticated;

alter table public.almox_processos_acompanhamento_produtos enable row level security;

drop policy if exists almox_processos_acompanhamento_produtos_select
  on public.almox_processos_acompanhamento_produtos;
create policy almox_processos_acompanhamento_produtos_select
on public.almox_processos_acompanhamento_produtos
for select
to anon, authenticated
using (true);

drop policy if exists almox_processos_acompanhamento_produtos_insert
  on public.almox_processos_acompanhamento_produtos;
create policy almox_processos_acompanhamento_produtos_insert
on public.almox_processos_acompanhamento_produtos
for insert
to anon, authenticated
with check (true);

drop policy if exists almox_processos_acompanhamento_produtos_update
  on public.almox_processos_acompanhamento_produtos;
create policy almox_processos_acompanhamento_produtos_update
on public.almox_processos_acompanhamento_produtos
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists almox_processos_acompanhamento_produtos_delete
  on public.almox_processos_acompanhamento_produtos;
create policy almox_processos_acompanhamento_produtos_delete
on public.almox_processos_acompanhamento_produtos
for delete
to anon, authenticated
using (true);

comment on table public.almox_processos_acompanhamento_produtos is
  'Produtos de cada processo (1..N). Antes desta migration cada processo era 1:1 com um produto.';
comment on column public.almox_processos_acompanhamento_produtos.ordem is
  'Ordem de apresentação. O produto com menor ordem é o "primeiro" mostrado na lista.';
