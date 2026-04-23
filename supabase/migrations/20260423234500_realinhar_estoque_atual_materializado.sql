-- Reconstroi a tabela materializada de estoque atual a partir do ultimo lote
-- processado de cada categoria. Isso corrige o backfill inicial que herdou
-- linhas legadas misturadas de lotes antigos, inclusive da unidade HMSA.

create or replace function public.reconstruir_estoque_atual_materializado(
  p_categoria_material text default null
)
returns integer
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_quantidade integer;
begin
  with categorias_alvo as (
    select distinct li.categoria_material
    from almox.lote_importacao li
    where li.status = 'processado'
      and (p_categoria_material is null or li.categoria_material = p_categoria_material)
  )
  delete from almox.estoque_atual ea
  where ea.categoria_material in (select categoria_material from categorias_alvo);

  with latest_lotes as (
    select distinct on (li.categoria_material)
      li.id,
      li.categoria_material
    from almox.lote_importacao li
    where li.status = 'processado'
      and (p_categoria_material is null or li.categoria_material = p_categoria_material)
    order by
      li.categoria_material,
      coalesce(li.processado_em, li.importado_em) desc,
      li.importado_em desc,
      li.id desc
  )
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
  from latest_lotes ll
  join almox.lote_importacao li
    on li.id = ll.id
  join almox.estoque_importado ei
    on ei.lote_importacao_id = li.id
  join almox.produto_unidade pu
    on pu.id = ei.produto_unidade_id
  join almox.unidade u
    on u.id = pu.unidade_id
  left join almox.produto_referencia pr
    on pr.id = pu.produto_referencia_id;

  get diagnostics v_quantidade = row_count;
  return v_quantidade;
end;
$$;

revoke all on function public.reconstruir_estoque_atual_materializado(text) from public, anon, authenticated;
grant execute on function public.reconstruir_estoque_atual_materializado(text) to service_role;

select public.reconstruir_estoque_atual_materializado();
