insert into almox.configuracao_sistema (codigo_unidade, chave, valor)
select null, seed.chave, seed.valor
from (
  select
    'excluirCmmMenorQueUmHospitalar'::text as chave,
    coalesce(
      (
        select atual.valor
        from almox.configuracao_sistema atual
        where atual.codigo_unidade is null
          and atual.chave = 'excluirCmmMenorQueUmHospitalar'
        limit 1
      ),
      (
        select atual.valor
        from almox.configuracao_sistema atual
        where atual.codigo_unidade is null
          and atual.chave = 'excluirCmmMenorQueUm'
        limit 1
      ),
      'false'::jsonb
    ) as valor

  union all

  select
    'excluirCmmMenorQueUmFarmacologico'::text as chave,
    coalesce(
      (
        select atual.valor
        from almox.configuracao_sistema atual
        where atual.codigo_unidade is null
          and atual.chave = 'excluirCmmMenorQueUmFarmacologico'
        limit 1
      ),
      (
        select atual.valor
        from almox.configuracao_sistema atual
        where atual.codigo_unidade is null
          and atual.chave = 'excluirCmmMenorQueUm'
        limit 1
      ),
      'false'::jsonb
    ) as valor
) as seed(chave, valor)
where not exists (
  select 1
  from almox.configuracao_sistema atual
  where atual.codigo_unidade is null
    and atual.chave = seed.chave
);
