alter table public.almox_processos_acompanhamento
  add column if not exists observacao text;

comment on column public.almox_processos_acompanhamento.observacao is
  'Observacao livre do processo, usada para registrar contexto operacional complementar.';
