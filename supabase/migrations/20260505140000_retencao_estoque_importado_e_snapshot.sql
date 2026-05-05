-- Retenção automática de estoque_importado e estoque_diario_snapshot
-- - estoque_importado: mantém apenas os 3 lotes mais recentes por categoria_material.
--   Disparado por trigger AFTER UPDATE em lote_importacao quando status vira 'processado'.
-- - estoque_diario_snapshot: mantém apenas os últimos 160 dias.
--   Embarcado dentro de registrar_snapshot_estoque_diario para rodar logo após o snapshot do dia.

create or replace function almox.cleanup_estoque_importado_antigos()
returns integer
language plpgsql
security definer
set search_path = almox, public
as $$
declare
  v_apagado integer;
begin
  with lote_categoria as (
    select li.id as lote_id,
           pu.categoria_material,
           row_number() over (
             partition by pu.categoria_material
             order by li.importado_em desc
           ) as rn
    from almox.lote_importacao li
    join almox.estoque_importado ei on ei.lote_importacao_id = li.id
    join almox.produto_unidade pu on pu.id = ei.produto_unidade_id
    group by li.id, pu.categoria_material
  ),
  lotes_a_apagar as (
    select lote_id from lote_categoria where rn > 3
  )
  delete from almox.estoque_importado
  where lote_importacao_id in (select lote_id from lotes_a_apagar);

  get diagnostics v_apagado = row_count;
  return v_apagado;
end;
$$;

revoke all on function almox.cleanup_estoque_importado_antigos() from public;
grant execute on function almox.cleanup_estoque_importado_antigos() to service_role;

create or replace function almox.trg_cleanup_estoque_importado()
returns trigger
language plpgsql
security definer
set search_path = almox, public
as $$
begin
  if new.status = 'processado'
     and (old.status is null or old.status <> 'processado') then
    perform almox.cleanup_estoque_importado_antigos();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lote_cleanup_estoque_importado on almox.lote_importacao;
create trigger trg_lote_cleanup_estoque_importado
  after update of status on almox.lote_importacao
  for each row
  execute function almox.trg_cleanup_estoque_importado();

create or replace function public.registrar_snapshot_estoque_diario(
  p_data_referencia date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_quantidade integer;
begin
  insert into almox.estoque_diario_snapshot (
    data_referencia,
    lote_importacao_id,
    codigo_unidade,
    nome_unidade,
    codigo_produto,
    nome_produto,
    categoria_material,
    unidade_medida,
    estoque_atual,
    consumo_medio,
    suficiencia_em_dias,
    valor_custo_medio
  )
  select
    p_data_referencia,
    lote_importacao_id,
    codigo_unidade,
    nome_unidade,
    codigo_produto,
    nome_produto,
    categoria_material,
    unidade_medida_produto,
    estoque_atual,
    consumo_medio,
    suficiencia_em_dias,
    valor_custo_medio
  from almox_estoque_atual
  on conflict (data_referencia, codigo_unidade, codigo_produto)
  do update set
    lote_importacao_id = excluded.lote_importacao_id,
    nome_unidade = excluded.nome_unidade,
    nome_produto = excluded.nome_produto,
    categoria_material = excluded.categoria_material,
    unidade_medida = excluded.unidade_medida,
    estoque_atual = excluded.estoque_atual,
    consumo_medio = excluded.consumo_medio,
    suficiencia_em_dias = excluded.suficiencia_em_dias,
    valor_custo_medio = excluded.valor_custo_medio,
    criado_em = now();

  get diagnostics v_quantidade = row_count;

  delete from almox.estoque_diario_snapshot
  where data_referencia < current_date - interval '160 days';

  return v_quantidade;
end;
$$;

revoke all on function public.registrar_snapshot_estoque_diario(date) from public;
grant execute on function public.registrar_snapshot_estoque_diario(date) to service_role;
