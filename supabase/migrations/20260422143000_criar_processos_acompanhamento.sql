create table if not exists public.almox_processos_acompanhamento (
  id uuid primary key default gen_random_uuid(),
  categoria_material text not null
    check (categoria_material in ('material_hospitalar', 'material_farmacologico')),
  cod_bionexo text not null,
  cd_produto text not null,
  ds_produto text not null,
  numero_processo text not null,
  tipo_processo text not null
    check (tipo_processo in ('ARP', 'Processo Simplificado', 'Processo Excepcional')),
  fornecedor text,
  data_resgate date,
  total_parcelas integer not null default 3
    check (total_parcelas between 1 and 12),
  parcelas_entregues jsonb not null default '[]'::jsonb,
  critico boolean not null default false,
  ignorado boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists almox_processos_acompanhamento_categoria_idx
  on public.almox_processos_acompanhamento (categoria_material);

create index if not exists almox_processos_acompanhamento_cod_bionexo_idx
  on public.almox_processos_acompanhamento (cod_bionexo);

create index if not exists almox_processos_acompanhamento_ativo_idx
  on public.almox_processos_acompanhamento (ativo, ignorado);

drop trigger if exists almox_processos_acompanhamento_definir_atualizado_em
  on public.almox_processos_acompanhamento;

create trigger almox_processos_acompanhamento_definir_atualizado_em
before update on public.almox_processos_acompanhamento
for each row
execute function almox.definir_atualizado_em();

comment on table public.almox_processos_acompanhamento is 'Processos acompanhados pelo modulo de acompanhamento de processos do AlmoxHMSA.';
comment on column public.almox_processos_acompanhamento.cod_bionexo is 'Codigo Bionexo normalizado, equivalente ao cd_pro_fat importado do SISCORE.';
comment on column public.almox_processos_acompanhamento.cd_produto is 'Codigo interno do produto no HMSA preenchido pela base importada.';
comment on column public.almox_processos_acompanhamento.ds_produto is 'Descricao do produto preenchida pela base importada.';
comment on column public.almox_processos_acompanhamento.parcelas_entregues is 'Lista booleana com o status de entrega de cada parcela do processo.';
comment on column public.almox_processos_acompanhamento.ignorado is 'Oculta o processo da lista principal sem apagar o registro.';

grant select, insert, update, delete on public.almox_processos_acompanhamento to anon, authenticated;

alter table public.almox_processos_acompanhamento enable row level security;

drop policy if exists almox_processos_acompanhamento_select on public.almox_processos_acompanhamento;
create policy almox_processos_acompanhamento_select
on public.almox_processos_acompanhamento
for select
to anon, authenticated
using (true);

drop policy if exists almox_processos_acompanhamento_insert on public.almox_processos_acompanhamento;
create policy almox_processos_acompanhamento_insert
on public.almox_processos_acompanhamento
for insert
to anon, authenticated
with check (true);

drop policy if exists almox_processos_acompanhamento_update on public.almox_processos_acompanhamento;
create policy almox_processos_acompanhamento_update
on public.almox_processos_acompanhamento
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists almox_processos_acompanhamento_delete on public.almox_processos_acompanhamento;
create policy almox_processos_acompanhamento_delete
on public.almox_processos_acompanhamento
for delete
to anon, authenticated
using (true);
