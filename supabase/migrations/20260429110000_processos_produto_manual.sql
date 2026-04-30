alter table public.almox_processos_acompanhamento
  add column if not exists produto_manual boolean not null default false;

create index if not exists almox_processos_acompanhamento_produto_manual_idx
  on public.almox_processos_acompanhamento (produto_manual)
  where produto_manual = true;

alter table public.almox_processos_acompanhamento
  drop constraint if exists almox_processos_acompanhamento_categoria_material_check;

comment on column public.almox_processos_acompanhamento.produto_manual is
  'Indica que o produto foi cadastrado manualmente, fora da base SISCORE.';
comment on column public.almox_processos_acompanhamento.categoria_material is
  'Categoria do material. Valores nativos: material_hospitalar, material_farmacologico. Pode receber rótulos customizados (ex: material_expediente) quando produto_manual = true.';
