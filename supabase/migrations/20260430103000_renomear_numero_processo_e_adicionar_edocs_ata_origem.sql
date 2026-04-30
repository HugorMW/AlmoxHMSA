alter table public.almox_processos_acompanhamento
  rename column numero_processo to numero_pedido;

alter table public.almox_processos_acompanhamento
  add column if not exists edocs_ata_origem text;

comment on column public.almox_processos_acompanhamento.numero_pedido
  is 'Pedido ou identificador operacional secundario do processo. Em ARP, pode ficar vazio.';

comment on column public.almox_processos_acompanhamento.edocs
  is 'Processo E-DOCS aberto para compra ou execucao da ata.';

comment on column public.almox_processos_acompanhamento.edocs_ata_origem
  is 'Processo E-DOCS original onde a ATA foi criada.';
