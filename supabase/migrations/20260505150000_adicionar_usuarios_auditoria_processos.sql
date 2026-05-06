alter table public.almox_processos_acompanhamento
  add column if not exists criado_por text null,
  add column if not exists atualizado_por text null;

comment on column public.almox_processos_acompanhamento.criado_por is
  'Usuario autenticado no app que criou o processo.';

comment on column public.almox_processos_acompanhamento.atualizado_por is
  'Usuario autenticado no app responsavel pela ultima atualizacao do processo.';
