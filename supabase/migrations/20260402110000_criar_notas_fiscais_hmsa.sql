create table if not exists almox.lote_importacao_notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  sistema_origem text not null default 'siscore',
  nome_arquivo_origem text,
  data_referencia date,
  importado_em timestamptz not null default now(),
  processado_em timestamptz,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'processado', 'falha')),
  quantidade_linhas integer not null default 0 check (quantidade_linhas >= 0),
  quantidade_notas integer not null default 0 check (quantidade_notas >= 0),
  quantidade_notas_com_item_duplicado integer not null default 0 check (quantidade_notas_com_item_duplicado >= 0),
  observacoes text,
  metadados jsonb not null default '{}'::jsonb
);

create table if not exists almox.nota_fiscal (
  id uuid primary key default gen_random_uuid(),
  lote_importacao_atual_id uuid references almox.lote_importacao_notas_fiscais(id) on delete set null,
  unidade_id uuid not null references almox.unidade(id) on delete restrict,
  unidade_origem_siscore text not null,
  fornecedor_chave text not null,
  nome_fornecedor text not null,
  numero_documento text not null,
  data_entrada date not null,
  status_sincronizacao text not null default 'ativo'
    check (status_sincronizacao in ('ativo', 'alterado', 'removido_no_siscore', 'reativado')),
  status_conferencia text not null default 'ok'
    check (status_conferencia in ('ok', 'nota_com_item_duplicado')),
  possui_item_duplicado boolean not null default false,
  hash_conteudo text not null,
  ultima_vez_vista_em timestamptz not null default now(),
  removida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, fornecedor_chave, numero_documento, data_entrada)
);

create index if not exists nota_fiscal_lote_atual_idx
  on almox.nota_fiscal (lote_importacao_atual_id);

create index if not exists nota_fiscal_unidade_data_idx
  on almox.nota_fiscal (unidade_id, data_entrada desc);

create index if not exists nota_fiscal_status_idx
  on almox.nota_fiscal (status_sincronizacao, status_conferencia);

create table if not exists almox.nota_fiscal_item (
  id uuid primary key default gen_random_uuid(),
  nota_fiscal_id uuid not null references almox.nota_fiscal(id) on delete cascade,
  sequencia_item integer not null check (sequencia_item > 0),
  linha_origem integer not null check (linha_origem > 0),
  codigo_produto text not null,
  descricao_produto text not null,
  quantidade_entrada numeric(18, 4),
  valor_unitario numeric(18, 6),
  valor_total numeric(18, 6),
  descricao_especie text,
  produto_unidade_id uuid references almox.produto_unidade(id) on delete set null,
  duplicado_na_nota boolean not null default false,
  hash_item text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (nota_fiscal_id, sequencia_item)
);

create index if not exists nota_fiscal_item_nota_idx
  on almox.nota_fiscal_item (nota_fiscal_id);

create index if not exists nota_fiscal_item_codigo_produto_idx
  on almox.nota_fiscal_item (codigo_produto);

create index if not exists nota_fiscal_item_produto_unidade_idx
  on almox.nota_fiscal_item (produto_unidade_id);

drop trigger if exists nota_fiscal_definir_atualizado_em on almox.nota_fiscal;
create trigger nota_fiscal_definir_atualizado_em
before update on almox.nota_fiscal
for each row
execute function almox.definir_atualizado_em();

drop trigger if exists nota_fiscal_item_definir_atualizado_em on almox.nota_fiscal_item;
create trigger nota_fiscal_item_definir_atualizado_em
before update on almox.nota_fiscal_item
for each row
execute function almox.definir_atualizado_em();

comment on table almox.lote_importacao_notas_fiscais is 'Controla cada carga de notas fiscais importada do SISCORE.';
comment on table almox.nota_fiscal is 'Estado atual reconciliado das notas fiscais do HMSA vindas do SISCORE.';
comment on table almox.nota_fiscal_item is 'Itens atuais da nota fiscal conforme a ultima leitura reconciliada do SISCORE.';

comment on column almox.nota_fiscal.unidade_origem_siscore is 'Valor bruto da coluna Unidade no arquivo exportado do SISCORE.';
comment on column almox.nota_fiscal.fornecedor_chave is 'Chave normalizada do fornecedor para identificar a nota sem depender de caixa ou espacos.';
comment on column almox.nota_fiscal.status_sincronizacao is 'Indica se a nota esta ativa, alterada, removida no SISCORE ou reativada.';
comment on column almox.nota_fiscal.status_conferencia is 'Indica se a nota exige conferencia operacional por item duplicado.';
comment on column almox.nota_fiscal.possui_item_duplicado is 'Marca notas em que o mesmo codigo_produto apareceu mais de uma vez.';
comment on column almox.nota_fiscal_item.sequencia_item is 'Sequencia do item dentro da nota conforme a ordem recebida do SISCORE.';
comment on column almox.nota_fiscal_item.linha_origem is 'Linha original da exportacao do SISCORE usada para rastreio.';
comment on column almox.nota_fiscal_item.duplicado_na_nota is 'Marca itens cujo codigo_produto aparece repetido dentro da mesma nota.';
comment on column almox.nota_fiscal_item.hash_item is 'Hash do conteudo do item para apoiar reconciliacao e diagnostico.';

create or replace view almox.v_notas_fiscais_hmsa as
select
  nf.id as nota_fiscal_id,
  nf.lote_importacao_atual_id,
  li.data_referencia,
  li.importado_em,
  u.id as unidade_id,
  u.codigo_unidade,
  u.nome_unidade,
  nf.unidade_origem_siscore,
  nf.nome_fornecedor,
  nf.numero_documento,
  nf.data_entrada,
  nf.status_sincronizacao,
  nf.status_conferencia,
  nf.possui_item_duplicado,
  count(nfi.id)::integer as quantidade_itens,
  count(*) filter (where nfi.duplicado_na_nota)::integer as quantidade_itens_duplicados,
  coalesce(sum(nfi.quantidade_entrada), 0)::numeric(18, 4) as quantidade_entrada_total,
  coalesce(sum(nfi.valor_total), 0)::numeric(18, 6) as valor_total_nota,
  nf.ultima_vez_vista_em,
  nf.removida_em,
  nf.criado_em,
  nf.atualizado_em
from almox.nota_fiscal nf
join almox.unidade u
  on u.id = nf.unidade_id
left join almox.lote_importacao_notas_fiscais li
  on li.id = nf.lote_importacao_atual_id
left join almox.nota_fiscal_item nfi
  on nfi.nota_fiscal_id = nf.id
group by
  nf.id,
  nf.lote_importacao_atual_id,
  li.data_referencia,
  li.importado_em,
  u.id,
  u.codigo_unidade,
  u.nome_unidade,
  nf.unidade_origem_siscore,
  nf.nome_fornecedor,
  nf.numero_documento,
  nf.data_entrada,
  nf.status_sincronizacao,
  nf.status_conferencia,
  nf.possui_item_duplicado,
  nf.ultima_vez_vista_em,
  nf.removida_em,
  nf.criado_em,
  nf.atualizado_em;

create or replace view almox.v_nota_fiscal_itens_hmsa as
select
  nf.id as nota_fiscal_id,
  nf.status_sincronizacao,
  nf.status_conferencia,
  nf.possui_item_duplicado,
  nf.nome_fornecedor,
  nf.numero_documento,
  nf.data_entrada,
  u.id as unidade_id,
  u.codigo_unidade,
  u.nome_unidade,
  nfi.id as nota_fiscal_item_id,
  nfi.sequencia_item,
  nfi.linha_origem,
  nfi.codigo_produto,
  nfi.descricao_produto,
  nfi.quantidade_entrada,
  nfi.valor_unitario,
  nfi.valor_total,
  nfi.descricao_especie,
  nfi.duplicado_na_nota,
  pu.id as produto_unidade_id,
  pu.categoria_material,
  pu.nome_produto as nome_produto_vinculado,
  nfi.criado_em,
  nfi.atualizado_em
from almox.nota_fiscal_item nfi
join almox.nota_fiscal nf
  on nf.id = nfi.nota_fiscal_id
join almox.unidade u
  on u.id = nf.unidade_id
left join almox.produto_unidade pu
  on pu.id = nfi.produto_unidade_id;

create or replace view public.almox_notas_fiscais_hmsa as
select
  nota_fiscal_id,
  lote_importacao_atual_id,
  data_referencia,
  importado_em,
  unidade_id,
  codigo_unidade,
  nome_unidade,
  unidade_origem_siscore,
  nome_fornecedor,
  numero_documento,
  data_entrada,
  status_sincronizacao,
  status_conferencia,
  possui_item_duplicado,
  quantidade_itens,
  quantidade_itens_duplicados,
  quantidade_entrada_total,
  valor_total_nota,
  ultima_vez_vista_em,
  removida_em,
  criado_em,
  atualizado_em
from almox.v_notas_fiscais_hmsa;

create or replace view public.almox_nota_fiscal_itens_hmsa as
select
  nota_fiscal_id,
  status_sincronizacao,
  status_conferencia,
  possui_item_duplicado,
  nome_fornecedor,
  numero_documento,
  data_entrada,
  unidade_id,
  codigo_unidade,
  nome_unidade,
  nota_fiscal_item_id,
  sequencia_item,
  linha_origem,
  codigo_produto,
  descricao_produto,
  quantidade_entrada,
  valor_unitario,
  valor_total,
  descricao_especie,
  duplicado_na_nota,
  produto_unidade_id,
  categoria_material,
  nome_produto_vinculado,
  criado_em,
  atualizado_em
from almox.v_nota_fiscal_itens_hmsa;

grant select on public.almox_notas_fiscais_hmsa to anon, authenticated;
grant select on public.almox_nota_fiscal_itens_hmsa to anon, authenticated;
