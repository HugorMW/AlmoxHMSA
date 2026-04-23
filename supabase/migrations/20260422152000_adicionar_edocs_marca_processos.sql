alter table public.almox_processos_acompanhamento
  add column if not exists edocs text,
  add column if not exists marca text;

comment on column public.almox_processos_acompanhamento.numero_processo is 'Numero do pedido acompanhado na tela de processos.';
comment on column public.almox_processos_acompanhamento.edocs is 'Identificador E-DOCS relacionado ao pedido.';
comment on column public.almox_processos_acompanhamento.marca is 'Marca do item relacionado ao pedido.';
