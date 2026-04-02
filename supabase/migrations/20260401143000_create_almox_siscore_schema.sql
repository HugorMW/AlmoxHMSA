create extension if not exists pgcrypto;

create schema if not exists almox;

create or replace function almox.definir_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace function almox.texto_para_numero(valor text)
returns numeric
language plpgsql
immutable
as $$
declare
  texto_limpo text;
begin
  texto_limpo := nullif(trim(valor), '');

  if texto_limpo is null then
    return null;
  end if;

  begin
    return texto_limpo::numeric;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function almox.serial_excel_para_data(valor text)
returns date
language sql
immutable
as $$
  select case
    when almox.texto_para_numero(valor) is null then null
    else (date '1899-12-30' + floor(almox.texto_para_numero(valor))::int)
  end;
$$;

create table if not exists almox.lote_importacao (
  id uuid primary key default gen_random_uuid(),
  sistema_origem text not null default 'siscore',
  nome_arquivo_origem text,
  data_referencia date,
  importado_em timestamptz not null default now(),
  processado_em timestamptz,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'processado', 'falha')),
  quantidade_linhas integer not null default 0 check (quantidade_linhas >= 0),
  observacoes text,
  metadados jsonb not null default '{}'::jsonb
);

create table if not exists almox.unidade (
  id uuid primary key default gen_random_uuid(),
  codigo_unidade text not null unique,
  nome_unidade text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists almox.produto_referencia (
  id uuid primary key default gen_random_uuid(),
  codigo_produto_referencia text not null unique,
  nome_produto_referencia text,
  unidade_medida_referencia text,
  especie_padrao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists almox.produto_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references almox.unidade(id) on delete restrict,
  produto_referencia_id uuid references almox.produto_referencia(id) on delete set null,
  codigo_produto text not null,
  nome_produto text not null,
  unidade_medida_produto text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, codigo_produto)
);

create index if not exists produto_unidade_produto_referencia_idx
  on almox.produto_unidade (produto_referencia_id);

create table if not exists almox.estoque_importado (
  id uuid primary key default gen_random_uuid(),
  lote_importacao_id uuid not null references almox.lote_importacao(id) on delete cascade,
  produto_unidade_id uuid not null references almox.produto_unidade(id) on delete restrict,
  suficiencia_em_dias numeric(18, 4),
  data_ultima_entrada date,
  valor_custo_medio numeric(18, 6),
  consumo_medio numeric(18, 6),
  estoque_atual numeric(18, 4),
  criado_em timestamptz not null default now(),
  unique (lote_importacao_id, produto_unidade_id)
);

create index if not exists estoque_importado_lote_idx
  on almox.estoque_importado (lote_importacao_id);

create index if not exists estoque_importado_produto_unidade_idx
  on almox.estoque_importado (produto_unidade_id);

create trigger unidade_definir_atualizado_em
before update on almox.unidade
for each row
execute function almox.definir_atualizado_em();

create trigger produto_referencia_definir_atualizado_em
before update on almox.produto_referencia
for each row
execute function almox.definir_atualizado_em();

create trigger produto_unidade_definir_atualizado_em
before update on almox.produto_unidade
for each row
execute function almox.definir_atualizado_em();

comment on table almox.lote_importacao is 'Controla cada carga importada do SISCORE.';
comment on table almox.unidade is 'Cadastro das unidades/hospitais presentes na planilha.';
comment on table almox.produto_referencia is 'Agrupa produtos equivalentes entre unidades por meio do cd_pro_fat.';
comment on table almox.produto_unidade is 'Identifica o produto local da unidade por meio do par codigo_produto + unidade.';
comment on table almox.estoque_importado is 'Guarda os valores operacionais importados em cada lote.';

comment on column almox.unidade.codigo_unidade is 'Coluna unidade da planilha.';
comment on column almox.produto_referencia.codigo_produto_referencia is 'Coluna cd_pro_fat.';
comment on column almox.produto_referencia.nome_produto_referencia is 'Coluna ds_pro_fat.';
comment on column almox.produto_referencia.unidade_medida_referencia is 'Coluna ds_pro_fat_unidade.';
comment on column almox.produto_referencia.especie_padrao is 'Coluna especie_padrao.';
comment on column almox.produto_unidade.codigo_produto is 'Coluna cd_produto.';
comment on column almox.produto_unidade.nome_produto is 'Coluna ds_produto.';
comment on column almox.produto_unidade.unidade_medida_produto is 'Coluna ds_unidade.';
comment on column almox.estoque_importado.suficiencia_em_dias is 'Coluna SUFICIÊNCIA_EM_DIAS.';
comment on column almox.estoque_importado.data_ultima_entrada is 'Coluna DT_ULTIMA_ENTRADA.';
comment on column almox.estoque_importado.valor_custo_medio is 'Coluna VALOR_CUSTO_MEDIO.';
comment on column almox.estoque_importado.consumo_medio is 'Coluna cmm_mv, consumo medio do produto na unidade.';
comment on column almox.estoque_importado.estoque_atual is 'Coluna EAT, estoque atual do produto na unidade.';

create or replace view almox.v_estoque_atual as
select distinct on (ei.produto_unidade_id)
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

create or replace view almox.v_emprestimo_disponivel as
select
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
