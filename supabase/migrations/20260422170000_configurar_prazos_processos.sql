with categorias(slug) as (
  values
    ('MaterialHospitalar'),
    ('MaterialFarmacologico')
),
tipos(slug) as (
  values
    ('Arp'),
    ('Simplificado'),
    ('Excepcional')
),
parcelas(numero, dias_uteis) as (
  values
    (1, 5),
    (2, 45),
    (3, 85),
    (4, 125),
    (5, 165),
    (6, 205)
),
seed(chave, valor) as (
  select
    format('processo%s%sParcela%sDiasUteis', categorias.slug, tipos.slug, parcelas.numero),
    to_jsonb(parcelas.dias_uteis)
  from categorias
  cross join tipos
  cross join parcelas
)
insert into almox.configuracao_sistema (codigo_unidade, chave, valor)
select null, seed.chave, seed.valor
from seed
where not exists (
  select 1
  from almox.configuracao_sistema atual
  where atual.codigo_unidade is null
    and atual.chave = seed.chave
);

update public.almox_processos_acompanhamento
set total_parcelas = 6,
    parcelas_entregues = coalesce(
      (
        select jsonb_agg(entregue.value order by entregue.ordinality)
        from jsonb_array_elements(parcelas_entregues) with ordinality as entregue(value, ordinality)
        where entregue.ordinality <= 6
      ),
      '[]'::jsonb
    )
where total_parcelas > 6;

alter table public.almox_processos_acompanhamento
  drop constraint if exists almox_processos_acompanhamento_total_parcelas_check;

alter table public.almox_processos_acompanhamento
  add constraint almox_processos_acompanhamento_total_parcelas_check
  check (total_parcelas between 1 and 6);

comment on constraint almox_processos_acompanhamento_total_parcelas_check
  on public.almox_processos_acompanhamento
  is 'Limita o acompanhamento de processos a no maximo 6 parcelas.';
