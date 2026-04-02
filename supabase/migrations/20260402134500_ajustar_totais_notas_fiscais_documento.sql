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
  coalesce(max(nfi.quantidade_entrada), 0)::numeric(18, 4) as quantidade_entrada_total,
  coalesce(max(nfi.valor_total), 0)::numeric(18, 6) as valor_total_nota,
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
