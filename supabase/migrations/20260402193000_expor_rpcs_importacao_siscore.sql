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

create or replace function public.importar_notas_fiscais_siscore(
  p_notas jsonb,
  p_nome_arquivo text,
  p_exportacao_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_lote_id uuid;
  v_unidade_id uuid;
  v_quantidade_notas integer := 0;
  v_quantidade_linhas integer := 0;
  v_quantidade_notas_com_item_duplicado integer := 0;
  v_notas_ativas integer := 0;
  v_notas_alteradas integer := 0;
  v_notas_reativadas integer := 0;
  v_notas_removidas_no_siscore integer := 0;
begin
  if p_notas is null or jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'Nenhuma nota fiscal recebida para importacao.';
  end if;

  insert into almox.lote_importacao_notas_fiscais (
    sistema_origem,
    nome_arquivo_origem,
    data_referencia,
    status,
    quantidade_linhas,
    quantidade_notas,
    quantidade_notas_com_item_duplicado,
    metadados
  )
  values (
    'siscore',
    p_nome_arquivo,
    timezone('America/Sao_Paulo', now())::date,
    'processando',
    0,
    0,
    0,
    jsonb_build_object('exportacao_url', p_exportacao_url)
  )
  returning id into v_lote_id;

  begin
    create temp table tmp_notas on commit drop as
    select
      trim(coalesce(unidade_origem_siscore, '')) as unidade_origem_siscore,
      trim(coalesce(nome_fornecedor, '')) as nome_fornecedor,
      trim(coalesce(fornecedor_chave, '')) as fornecedor_chave,
      data_entrada,
      trim(coalesce(numero_documento, '')) as numero_documento,
      coalesce(possui_item_duplicado, false) as possui_item_duplicado,
      trim(coalesce(status_conferencia, 'ok')) as status_conferencia,
      hash_conteudo,
      coalesce(items, '[]'::jsonb) as items
    from jsonb_to_recordset(p_notas) as x(
      unidade_origem_siscore text,
      nome_fornecedor text,
      fornecedor_chave text,
      data_entrada date,
      numero_documento text,
      possui_item_duplicado boolean,
      status_conferencia text,
      hash_conteudo text,
      items jsonb
    )
    where trim(coalesce(fornecedor_chave, '')) <> ''
      and trim(coalesce(numero_documento, '')) <> ''
      and data_entrada is not null;

    select count(*) into v_quantidade_notas from tmp_notas;
    select coalesce(sum(jsonb_array_length(items)), 0) into v_quantidade_linhas from tmp_notas;
    select count(*) filter (where possui_item_duplicado) into v_quantidade_notas_com_item_duplicado from tmp_notas;

    select u.id
    into v_unidade_id
    from almox.unidade u
    where upper(u.codigo_unidade) in ('HMSA', 'HMSASOUL')
    order by case when upper(u.codigo_unidade) = 'HMSASOUL' then 0 else 1 end
    limit 1;

    if v_unidade_id is null then
      insert into almox.unidade (codigo_unidade, nome_unidade)
      values (
        coalesce((select unidade_origem_siscore from tmp_notas limit 1), 'HMSASOUL'),
        coalesce((select unidade_origem_siscore from tmp_notas limit 1), 'HMSASOUL')
      )
      returning id into v_unidade_id;
    end if;

    create temp table tmp_produto_unidade_hmsa on commit drop as
    select
      pu.codigo_produto,
      min(pu.id) as produto_unidade_id
    from almox.produto_unidade pu
    where pu.unidade_id = v_unidade_id
    group by pu.codigo_produto
    having count(*) = 1;

    create temp table tmp_notas_existentes on commit drop as
    select
      nf.id,
      nf.fornecedor_chave,
      nf.numero_documento,
      nf.data_entrada,
      nf.status_sincronizacao,
      nf.status_conferencia,
      nf.hash_conteudo
    from almox.nota_fiscal nf
    where nf.unidade_id = v_unidade_id;

    insert into almox.nota_fiscal (
      lote_importacao_atual_id,
      unidade_id,
      unidade_origem_siscore,
      fornecedor_chave,
      nome_fornecedor,
      numero_documento,
      data_entrada,
      status_sincronizacao,
      status_conferencia,
      possui_item_duplicado,
      hash_conteudo,
      ultima_vez_vista_em,
      removida_em
    )
    select
      v_lote_id,
      v_unidade_id,
      t.unidade_origem_siscore,
      t.fornecedor_chave,
      t.nome_fornecedor,
      t.numero_documento,
      t.data_entrada,
      case
        when e.id is null then 'ativo'
        when e.status_sincronizacao = 'removido_no_siscore' then 'reativado'
        when e.hash_conteudo is distinct from t.hash_conteudo
          or e.status_conferencia is distinct from t.status_conferencia then 'alterado'
        else 'ativo'
      end,
      t.status_conferencia,
      t.possui_item_duplicado,
      t.hash_conteudo,
      now(),
      null
    from tmp_notas t
    left join tmp_notas_existentes e
      on e.fornecedor_chave = t.fornecedor_chave
     and e.numero_documento = t.numero_documento
     and e.data_entrada = t.data_entrada
    on conflict (unidade_id, fornecedor_chave, numero_documento, data_entrada) do update
      set lote_importacao_atual_id = excluded.lote_importacao_atual_id,
          unidade_origem_siscore = excluded.unidade_origem_siscore,
          nome_fornecedor = excluded.nome_fornecedor,
          status_sincronizacao = excluded.status_sincronizacao,
          status_conferencia = excluded.status_conferencia,
          possui_item_duplicado = excluded.possui_item_duplicado,
          hash_conteudo = excluded.hash_conteudo,
          ultima_vez_vista_em = now(),
          removida_em = null,
          atualizado_em = now();

    select
      count(*) filter (where nf.status_sincronizacao = 'ativo'),
      count(*) filter (where nf.status_sincronizacao = 'alterado'),
      count(*) filter (where nf.status_sincronizacao = 'reativado')
    into
      v_notas_ativas,
      v_notas_alteradas,
      v_notas_reativadas
    from almox.nota_fiscal nf
    join tmp_notas t
      on t.fornecedor_chave = nf.fornecedor_chave
     and t.numero_documento = nf.numero_documento
     and t.data_entrada = nf.data_entrada
    where nf.unidade_id = v_unidade_id;

    delete from almox.nota_fiscal_item nfi
    using almox.nota_fiscal nf
    join tmp_notas t
      on t.fornecedor_chave = nf.fornecedor_chave
     and t.numero_documento = nf.numero_documento
     and t.data_entrada = nf.data_entrada
    where nfi.nota_fiscal_id = nf.id
      and nf.unidade_id = v_unidade_id;

    insert into almox.nota_fiscal_item (
      nota_fiscal_id,
      sequencia_item,
      linha_origem,
      codigo_produto,
      descricao_produto,
      quantidade_entrada,
      valor_unitario,
      valor_total,
      descricao_especie,
      produto_unidade_id,
      duplicado_na_nota,
      hash_item
    )
    select
      nf.id,
      item.sequencia_item,
      item.linha_origem,
      item.codigo_produto,
      item.descricao_produto,
      item.quantidade_entrada,
      item.valor_unitario,
      item.valor_total,
      item.descricao_especie,
      pu.produto_unidade_id,
      coalesce(item.duplicado_na_nota, false),
      item.hash_item
    from tmp_notas t
    join almox.nota_fiscal nf
      on nf.unidade_id = v_unidade_id
     and nf.fornecedor_chave = t.fornecedor_chave
     and nf.numero_documento = t.numero_documento
     and nf.data_entrada = t.data_entrada
    cross join lateral jsonb_to_recordset(t.items) as item(
      sequencia_item integer,
      linha_origem integer,
      codigo_produto text,
      descricao_produto text,
      quantidade_entrada numeric,
      valor_unitario numeric,
      valor_total numeric,
      descricao_especie text,
      duplicado_na_nota boolean,
      hash_item text
    )
    left join tmp_produto_unidade_hmsa pu
      on pu.codigo_produto = item.codigo_produto;

    update almox.nota_fiscal nf
    set status_sincronizacao = 'removido_no_siscore',
        removida_em = now(),
        lote_importacao_atual_id = v_lote_id,
        atualizado_em = now()
    where nf.unidade_id = v_unidade_id
      and not exists (
        select 1
        from tmp_notas t
        where t.fornecedor_chave = nf.fornecedor_chave
          and t.numero_documento = nf.numero_documento
          and t.data_entrada = nf.data_entrada
      )
      and nf.status_sincronizacao <> 'removido_no_siscore';

    get diagnostics v_notas_removidas_no_siscore = row_count;

    update almox.lote_importacao_notas_fiscais
    set status = 'processado',
        processado_em = now(),
        quantidade_linhas = v_quantidade_linhas,
        quantidade_notas = v_quantidade_notas,
        quantidade_notas_com_item_duplicado = v_quantidade_notas_com_item_duplicado,
        metadados = coalesce(metadados, '{}'::jsonb) || jsonb_build_object(
          'notas_ativas', v_notas_ativas,
          'notas_alteradas', v_notas_alteradas,
          'notas_reativadas', v_notas_reativadas,
          'notas_removidas_no_siscore', v_notas_removidas_no_siscore
        )
    where id = v_lote_id;

    return jsonb_build_object(
      'loteId', v_lote_id,
      'quantidadeNotas', v_quantidade_notas,
      'quantidadeLinhas', v_quantidade_linhas,
      'quantidadeNotasComItemDuplicado', v_quantidade_notas_com_item_duplicado,
      'quantidadeNotasRemovidas', v_notas_removidas_no_siscore
    );
  exception
    when others then
      update almox.lote_importacao_notas_fiscais
      set status = 'falha',
          processado_em = now(),
          observacoes = left(sqlerrm, 2000)
      where id = v_lote_id;
      raise;
  end;
end;
$$;

revoke all on function public.importar_estoque_siscore(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.importar_notas_fiscais_siscore(jsonb, text, text) from public, anon, authenticated;

grant execute on function public.importar_estoque_siscore(jsonb, text, text, text) to service_role;
grant execute on function public.importar_notas_fiscais_siscore(jsonb, text, text) to service_role;
