update public.almox_processos_acompanhamento
set edocs_ata_origem = numero_pedido
where coalesce(trim(edocs_ata_origem), '') = ''
  and coalesce(trim(numero_pedido), '') <> '';

alter table public.almox_processos_acompanhamento
  drop column if exists numero_pedido;
