alter table almox.lote_importacao
  add column if not exists categoria_material text;

update almox.lote_importacao
set categoria_material = 'material_hospitalar'
where categoria_material is null;

alter table almox.lote_importacao
  alter column categoria_material set default 'material_hospitalar';

alter table almox.lote_importacao
  alter column categoria_material set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lote_importacao_categoria_material_chk'
      and conrelid = 'almox.lote_importacao'::regclass
  ) then
    alter table almox.lote_importacao
      add constraint lote_importacao_categoria_material_chk
      check (categoria_material in ('material_hospitalar', 'material_farmacologico'));
  end if;
end;
$$;

alter table almox.produto_referencia
  add column if not exists categoria_material text;

update almox.produto_referencia
set categoria_material = 'material_hospitalar'
where categoria_material is null;

alter table almox.produto_referencia
  alter column categoria_material set default 'material_hospitalar';

alter table almox.produto_referencia
  alter column categoria_material set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produto_referencia_categoria_material_chk'
      and conrelid = 'almox.produto_referencia'::regclass
  ) then
    alter table almox.produto_referencia
      add constraint produto_referencia_categoria_material_chk
      check (categoria_material in ('material_hospitalar', 'material_farmacologico'));
  end if;
end;
$$;

alter table almox.produto_unidade
  add column if not exists categoria_material text;

update almox.produto_unidade
set categoria_material = 'material_hospitalar'
where categoria_material is null;

alter table almox.produto_unidade
  alter column categoria_material set default 'material_hospitalar';

alter table almox.produto_unidade
  alter column categoria_material set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produto_unidade_categoria_material_chk'
      and conrelid = 'almox.produto_unidade'::regclass
  ) then
    alter table almox.produto_unidade
      add constraint produto_unidade_categoria_material_chk
      check (categoria_material in ('material_hospitalar', 'material_farmacologico'));
  end if;
end;
$$;

alter table almox.produto_referencia
  drop constraint if exists produto_referencia_codigo_produto_referencia_key;

create unique index if not exists produto_referencia_categoria_codigo_idx
  on almox.produto_referencia (categoria_material, codigo_produto_referencia);

alter table almox.produto_unidade
  drop constraint if exists produto_unidade_unidade_id_codigo_produto_key;

create unique index if not exists produto_unidade_categoria_unidade_codigo_idx
  on almox.produto_unidade (categoria_material, unidade_id, codigo_produto);

create index if not exists lote_importacao_categoria_material_idx
  on almox.lote_importacao (categoria_material, importado_em desc);

create index if not exists produto_unidade_categoria_material_idx
  on almox.produto_unidade (categoria_material);

comment on column almox.lote_importacao.categoria_material is 'Categoria importada do SISCORE: material_hospitalar ou material_farmacologico.';
comment on column almox.produto_referencia.categoria_material is 'Categoria em que o cd_pro_fat existe.';
comment on column almox.produto_unidade.categoria_material is 'Categoria da exportacao que originou o produto local.';

drop view if exists public.almox_emprestimo_disponivel;
drop view if exists public.almox_estoque_atual;
drop view if exists almox.v_emprestimo_disponivel;
drop view if exists almox.v_estoque_atual;

create view almox.v_estoque_atual as
select distinct on (ei.produto_unidade_id)
  li.categoria_material,
  ei.id as estoque_importado_id,
  li.id as lote_importacao_id,
  li.data_referencia,
  li.importado_em,
  u.id as unidade_id,
  u.codigo_unidade,
  u.nome_unidade,
  pr.id as produto_referencia_id,
  pr.codigo_produto_referencia,
  pr.nome_produto_referencia,
  pr.unidade_medida_referencia,
  pr.especie_padrao,
  pu.id as produto_unidade_id,
  pu.codigo_produto,
  pu.nome_produto,
  pu.unidade_medida_produto,
  ei.suficiencia_em_dias,
  ei.data_ultima_entrada,
  ei.valor_custo_medio,
  ei.consumo_medio,
  ei.estoque_atual,
  ei.criado_em
from almox.estoque_importado ei
join almox.lote_importacao li
  on li.id = ei.lote_importacao_id
join almox.produto_unidade pu
  on pu.id = ei.produto_unidade_id
join almox.unidade u
  on u.id = pu.unidade_id
left join almox.produto_referencia pr
  on pr.id = pu.produto_referencia_id
order by
  ei.produto_unidade_id,
  coalesce(li.data_referencia, date(li.importado_em)) desc,
  li.importado_em desc,
  ei.criado_em desc;

create view almox.v_emprestimo_disponivel as
select
  ea.categoria_material,
  pr.id as produto_referencia_id,
  pr.codigo_produto_referencia,
  pr.nome_produto_referencia,
  u.id as unidade_id,
  u.codigo_unidade,
  u.nome_unidade,
  pu.id as produto_unidade_id,
  pu.codigo_produto,
  pu.nome_produto,
  ea.suficiencia_em_dias,
  ea.consumo_medio,
  ea.estoque_atual,
  ea.data_ultima_entrada
from almox.v_estoque_atual ea
join almox.produto_unidade pu
  on pu.id = ea.produto_unidade_id
join almox.unidade u
  on u.id = ea.unidade_id
join almox.produto_referencia pr
  on pr.id = ea.produto_referencia_id
where pr.codigo_produto_referencia is not null;

create view public.almox_estoque_atual as
select
  categoria_material,
  estoque_importado_id,
  lote_importacao_id,
  data_referencia,
  importado_em,
  unidade_id,
  codigo_unidade,
  nome_unidade,
  produto_referencia_id,
  codigo_produto_referencia,
  nome_produto_referencia,
  unidade_medida_referencia,
  especie_padrao,
  produto_unidade_id,
  codigo_produto,
  nome_produto,
  unidade_medida_produto,
  suficiencia_em_dias,
  data_ultima_entrada,
  valor_custo_medio,
  consumo_medio,
  estoque_atual,
  criado_em
from almox.v_estoque_atual;

create view public.almox_emprestimo_disponivel as
select
  categoria_material,
  produto_referencia_id,
  codigo_produto_referencia,
  nome_produto_referencia,
  unidade_id,
  codigo_unidade,
  nome_unidade,
  produto_unidade_id,
  codigo_produto,
  nome_produto,
  suficiencia_em_dias,
  consumo_medio,
  estoque_atual,
  data_ultima_entrada
from almox.v_emprestimo_disponivel;

grant select on public.almox_estoque_atual to anon, authenticated;
grant select on public.almox_emprestimo_disponivel to anon, authenticated;
