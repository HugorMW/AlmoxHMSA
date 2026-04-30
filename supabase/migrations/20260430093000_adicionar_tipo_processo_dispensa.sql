alter table public.almox_processos_acompanhamento
  drop constraint if exists almox_processos_acompanhamento_tipo_processo_check;

alter table public.almox_processos_acompanhamento
  add constraint almox_processos_acompanhamento_tipo_processo_check
  check (
    tipo_processo in (
      'ARP',
      'Processo Simplificado',
      'Processo Excepcional',
      'Processo de Dispensa'
    )
  );

with categorias(slug) as (
  values
    ('MaterialHospitalar'),
    ('MaterialFarmacologico')
),
tipos(slug) as (
  values
    ('Dispensa')
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
