-- Remove registros legados da unidade 'HMSA' (sistema antigo).
-- A unidade atual no SISCORE eh 'HMSASOUL'. Rows com codigo_unidade = 'HMSA'
-- sao residuos que nao devem mais ser importados nem exibidos.

begin;

delete from almox.estoque_diario_snapshot
where upper(trim(codigo_unidade)) = 'HMSA';

delete from almox.nota_fiscal_item
where nota_fiscal_id in (
  select id from almox.nota_fiscal
  where upper(trim(unidade_origem_siscore)) = 'HMSA'
);

delete from almox.nota_fiscal
where upper(trim(unidade_origem_siscore)) = 'HMSA';

delete from almox.estoque_importado
where produto_unidade_id in (
  select pu.id
  from almox.produto_unidade pu
  join almox.unidade u on u.id = pu.unidade_id
  where upper(trim(u.codigo_unidade)) = 'HMSA'
);

delete from almox.produto_unidade
where unidade_id in (
  select id from almox.unidade
  where upper(trim(codigo_unidade)) = 'HMSA'
);

delete from almox.unidade
where upper(trim(codigo_unidade)) = 'HMSA';

commit;
