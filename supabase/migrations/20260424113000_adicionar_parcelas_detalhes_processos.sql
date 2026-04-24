alter table public.almox_processos_acompanhamento
  add column if not exists parcelas_detalhes jsonb not null default '[]'::jsonb;

update public.almox_processos_acompanhamento as processo
set parcelas_detalhes = detalhes.parcelas_detalhes
from (
  select
    origem.id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'numero', parcela.numero,
          'entregue', coalesce((origem.parcelas_entregues ->> (parcela.numero - 1))::boolean, false),
          'data_entrega', null,
          'adiamento_dias_uteis', 0,
          'empresa_notificada', false,
          'empresa_notificada_em', null,
          'atualizado_em', origem.atualizado_em
        )
        order by parcela.numero
      ),
      '[]'::jsonb
    ) as parcelas_detalhes
  from public.almox_processos_acompanhamento as origem
  cross join lateral generate_series(1, greatest(origem.total_parcelas, 1)) as parcela(numero)
  group by origem.id
) as detalhes
where processo.id = detalhes.id
  and coalesce(jsonb_array_length(processo.parcelas_detalhes), 0) = 0;

comment on column public.almox_processos_acompanhamento.parcelas_detalhes is
  'JSON detalhado de cada parcela do processo, incluindo entrega, data de entrega, adiamento e aviso para a empresa.';
