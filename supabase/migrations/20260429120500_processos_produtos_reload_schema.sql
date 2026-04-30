-- Garante que a foreign key entre produtos e processos esteja com nome explicito
-- e força o reload do schema cache do PostgREST para que o embedding nested
-- (almox_processos_acompanhamento -> almox_processos_acompanhamento_produtos) funcione.

do $$
declare
  fk_exists boolean;
begin
  select exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'almox_processos_acompanhamento_produtos'
      and c.contype = 'f'
      and c.conname = 'almox_processos_acompanhamento_produtos_processo_id_fkey'
  ) into fk_exists;

  if not fk_exists then
    -- Localiza qualquer FK existente apontando para o processo e dropa para recriar com nome canônico
    execute (
      select string_agg(
        format('alter table public.almox_processos_acompanhamento_produtos drop constraint %I;', c.conname),
        ' '
      )
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'almox_processos_acompanhamento_produtos'
        and c.contype = 'f'
    );

    alter table public.almox_processos_acompanhamento_produtos
      add constraint almox_processos_acompanhamento_produtos_processo_id_fkey
      foreign key (processo_id)
      references public.almox_processos_acompanhamento(id)
      on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
