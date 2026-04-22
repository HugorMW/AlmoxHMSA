insert into almox.configuracao_sistema (codigo_unidade, chave, valor)
select null, seed.chave, seed.valor
from (
  values
    ('pisoDoadorAposEmprestimoDias', '100'::jsonb),
    ('excluirCmmMenorQueUm', 'false'::jsonb)
) as seed(chave, valor)
where not exists (
  select 1
  from almox.configuracao_sistema atual
  where atual.codigo_unidade is null
    and atual.chave = seed.chave
);

update almox.configuracao_sistema
set chave = 'excluirCmmMenorQueUm',
    atualizado_em = now()
where codigo_unidade is null
  and chave = 'excluirCmmZero'
  and not exists (
    select 1
    from almox.configuracao_sistema atual
    where atual.codigo_unidade is null
      and atual.chave = 'excluirCmmMenorQueUm'
  );
