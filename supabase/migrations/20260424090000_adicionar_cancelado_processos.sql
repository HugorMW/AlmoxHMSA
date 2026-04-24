alter table public.almox_processos_acompanhamento
  add column if not exists cancelado boolean not null default false;

comment on column public.almox_processos_acompanhamento.cancelado is
  'Marca o processo como cancelado sem remover o registro da tela de acompanhamento.';

