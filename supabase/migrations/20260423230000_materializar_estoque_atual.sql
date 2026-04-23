-- Materializa o estado atual do estoque em tabela fisica para evitar que
-- cada leitura do app precise recalcular o "atual" a partir do historico.
-- A view publica continua existindo com o mesmo contrato, mas passa a ler
-- dados prontos mantidos durante a importacao do SISCORE.

create table if not exists almox.estoque_atual (
  id uuid primary key default gen_random_uuid(),
  categoria_material text not null
    check (categoria_material in ('material_hospitalar', 'material_farmacologico')),
  estoque_importado_id uuid not null references almox.estoque_importado(id) on delete cascade,
  lote_importacao_id uuid not null references almox.lote_importacao(id) on delete cascade,
  data_referencia date,
  importado_em timestamptz not null,
  unidade_id uuid not null references almox.unidade(id) on delete cascade,
  codigo_unidade text not null,
  nome_unidade text not null,
  produto_referencia_id uuid references almox.produto_referencia(id) on delete set null,
  codigo_produto_referencia text,
  nome_produto_referencia text,
  unidade_medida_referencia text,
  especie_padrao text,
  produto_unidade_id uuid not null references almox.produto_unidade(id) on delete cascade,
  codigo_produto text not null,
  nome_produto text not null,
  unidade_medida_produto text,
  suficiencia_em_dias numeric(18, 4),
  data_ultima_entrada date,
  valor_custo_medio numeric(18, 6),
  consumo_medio numeric(18, 6),
  estoque_atual numeric(18, 4),
  criado_em timestamptz not null default now()
);

create unique index if not exists estoque_atual_produto_unidade_uidx
  on almox.estoque_atual (produto_unidade_id);

create index if not exists estoque_atual_categoria_unidade_codigo_idx
  on almox.estoque_atual (categoria_material, codigo_unidade, codigo_produto);

create index if not exists estoque_atual_codigo_referencia_idx
  on almox.estoque_atual (codigo_produto_referencia)
  where codigo_produto_referencia is not null;

create index if not exists estoque_atual_unidade_codigo_idx
  on almox.estoque_atual (codigo_unidade, codigo_produto);

comment on table almox.estoque_atual is 'Foto operacional pronta do ultimo estoque conhecido por produto/unidade.';
comment on column almox.estoque_atual.estoque_importado_id is 'Linha historica de almox.estoque_importado que originou o estado atual.';
comment on column almox.estoque_atual.lote_importacao_id is 'Lote do SISCORE que originou o estado atual materializado.';

insert into almox.estoque_atual (
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
)
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
from public.almox_estoque_atual
on conflict (produto_unidade_id) do update
set categoria_material = excluded.categoria_material,
    estoque_importado_id = excluded.estoque_importado_id,
    lote_importacao_id = excluded.lote_importacao_id,
    data_referencia = excluded.data_referencia,
    importado_em = excluded.importado_em,
    unidade_id = excluded.unidade_id,
    codigo_unidade = excluded.codigo_unidade,
    nome_unidade = excluded.nome_unidade,
    produto_referencia_id = excluded.produto_referencia_id,
    codigo_produto_referencia = excluded.codigo_produto_referencia,
    nome_produto_referencia = excluded.nome_produto_referencia,
    unidade_medida_referencia = excluded.unidade_medida_referencia,
    especie_padrao = excluded.especie_padrao,
    codigo_produto = excluded.codigo_produto,
    nome_produto = excluded.nome_produto,
    unidade_medida_produto = excluded.unidade_medida_produto,
    suficiencia_em_dias = excluded.suficiencia_em_dias,
    data_ultima_entrada = excluded.data_ultima_entrada,
    valor_custo_medio = excluded.valor_custo_medio,
    consumo_medio = excluded.consumo_medio,
    estoque_atual = excluded.estoque_atual,
    criado_em = excluded.criado_em;

create or replace function public.importar_estoque_siscore(
  p_rows jsonb,
  p_nome_arquivo text,
  p_categoria_material text,
  p_exportacao_url text
)
returns uuid
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_lote_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhuma linha de estoque recebida para importacao.';
  end if;

  insert into almox.lote_importacao (
    sistema_origem,
    nome_arquivo_origem,
    data_referencia,
    categoria_material,
    status,
    quantidade_linhas,
    metadados
  )
  values (
    'siscore',
    p_nome_arquivo,
    timezone('America/Sao_Paulo', now())::date,
    p_categoria_material,
    'processando',
    0,
    jsonb_build_object('exportacao_url', p_exportacao_url)
  )
  returning id into v_lote_id;

  begin
    create temp table tmp_estoque_rows on commit drop as
    select
      trim(coalesce(categoria_material, p_categoria_material)) as categoria_material,
      trim(coalesce(codigo_produto, '')) as codigo_produto,
      trim(coalesce(nome_produto, '')) as nome_produto,
      nullif(trim(coalesce(unidade_medida_produto, '')), '') as unidade_medida_produto,
      nullif(trim(coalesce(codigo_produto_referencia, '')), '') as codigo_produto_referencia,
      nullif(trim(coalesce(nome_produto_referencia, '')), '') as nome_produto_referencia,
      nullif(trim(coalesce(unidade_medida_referencia, '')), '') as unidade_medida_referencia,
      trim(coalesce(codigo_unidade, '')) as codigo_unidade,
      trim(coalesce(nome_unidade, '')) as nome_unidade,
      suficiencia_em_dias,
      data_ultima_entrada,
      valor_custo_medio,
      consumo_medio,
      estoque_atual,
      nullif(trim(coalesce(especie_padrao, '')), '') as especie_padrao
    from jsonb_to_recordset(p_rows) as x(
      categoria_material text,
      codigo_produto text,
      nome_produto text,
      unidade_medida_produto text,
      codigo_produto_referencia text,
      nome_produto_referencia text,
      unidade_medida_referencia text,
      codigo_unidade text,
      nome_unidade text,
      suficiencia_em_dias numeric,
      data_ultima_entrada date,
      valor_custo_medio numeric,
      consumo_medio numeric,
      estoque_atual numeric,
      especie_padrao text
    )
    where trim(coalesce(codigo_produto, '')) <> ''
      and trim(coalesce(codigo_unidade, '')) <> '';

    insert into almox.unidade (
      codigo_unidade,
      nome_unidade,
      ativo
    )
    select distinct
      r.codigo_unidade,
      r.nome_unidade,
      true
    from tmp_estoque_rows r
    on conflict (codigo_unidade) do update
      set nome_unidade = excluded.nome_unidade,
          ativo = true,
          atualizado_em = now();

    insert into almox.produto_referencia (
      categoria_material,
      codigo_produto_referencia,
      nome_produto_referencia,
      unidade_medida_referencia,
      especie_padrao
    )
    select distinct
      r.categoria_material,
      r.codigo_produto_referencia,
      r.nome_produto_referencia,
      r.unidade_medida_referencia,
      r.especie_padrao
    from tmp_estoque_rows r
    where r.codigo_produto_referencia is not null
    on conflict (categoria_material, codigo_produto_referencia) do update
      set nome_produto_referencia = excluded.nome_produto_referencia,
          unidade_medida_referencia = excluded.unidade_medida_referencia,
          especie_padrao = excluded.especie_padrao,
          atualizado_em = now();

    insert into almox.produto_unidade (
      categoria_material,
      unidade_id,
      produto_referencia_id,
      codigo_produto,
      nome_produto,
      unidade_medida_produto
    )
    select distinct
      r.categoria_material,
      u.id,
      pr.id,
      r.codigo_produto,
      r.nome_produto,
      r.unidade_medida_produto
    from tmp_estoque_rows r
    join almox.unidade u
      on u.codigo_unidade = r.codigo_unidade
    left join almox.produto_referencia pr
      on pr.categoria_material = r.categoria_material
     and pr.codigo_produto_referencia = r.codigo_produto_referencia
    on conflict (categoria_material, unidade_id, codigo_produto) do update
      set produto_referencia_id = excluded.produto_referencia_id,
          nome_produto = excluded.nome_produto,
          unidade_medida_produto = excluded.unidade_medida_produto,
          atualizado_em = now();

    insert into almox.estoque_importado (
      lote_importacao_id,
      produto_unidade_id,
      suficiencia_em_dias,
      data_ultima_entrada,
      valor_custo_medio,
      consumo_medio,
      estoque_atual
    )
    select distinct on (pu.id)
      v_lote_id,
      pu.id,
      r.suficiencia_em_dias,
      r.data_ultima_entrada,
      r.valor_custo_medio,
      r.consumo_medio,
      r.estoque_atual
    from tmp_estoque_rows r
    join almox.unidade u
      on u.codigo_unidade = r.codigo_unidade
    join almox.produto_unidade pu
      on pu.categoria_material = r.categoria_material
     and pu.unidade_id = u.id
     and pu.codigo_produto = r.codigo_produto
    order by pu.id;

    delete from almox.estoque_atual
    where categoria_material = p_categoria_material;

    insert into almox.estoque_atual (
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
    )
    select
      li.categoria_material,
      ei.id,
      li.id,
      li.data_referencia,
      li.importado_em,
      u.id,
      u.codigo_unidade,
      u.nome_unidade,
      pr.id,
      pr.codigo_produto_referencia,
      pr.nome_produto_referencia,
      pr.unidade_medida_referencia,
      pr.especie_padrao,
      pu.id,
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
    join almox.produto_unidade pu
      on pu.id = ei.produto_unidade_id
    join almox.unidade u
      on u.id = pu.unidade_id
    left join almox.produto_referencia pr
      on pr.id = pu.produto_referencia_id
    join almox.lote_importacao li
      on li.id = ei.lote_importacao_id
    where ei.lote_importacao_id = v_lote_id;

    update almox.lote_importacao
    set status = 'processado',
        processado_em = now(),
        quantidade_linhas = (select count(*) from tmp_estoque_rows)
    where id = v_lote_id;

    return v_lote_id;
  exception
    when others then
      update almox.lote_importacao
      set status = 'falha',
          processado_em = now(),
          observacoes = left(sqlerrm, 2000)
      where id = v_lote_id;
      raise;
  end;
end;
$$;

revoke all on function public.importar_estoque_siscore(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.importar_estoque_siscore(jsonb, text, text, text) to service_role;

create or replace view almox.v_estoque_atual as
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
from almox.estoque_atual;

create or replace view almox.v_emprestimo_disponivel as
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
from almox.estoque_atual
where codigo_produto_referencia is not null;

create or replace view public.almox_estoque_atual as
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
from almox.estoque_atual;

create or replace view public.almox_emprestimo_disponivel as
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
