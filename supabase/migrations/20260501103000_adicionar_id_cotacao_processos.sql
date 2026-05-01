alter table public.almox_processos_acompanhamento
  add column if not exists id_cotacao text;

comment on column public.almox_processos_acompanhamento.id_cotacao
  is 'Identificador da cotacao vinculado ao Processo Simplificado.';
