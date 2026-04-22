create table if not exists almox.configuracao_sistema (
  id uuid primary key default gen_random_uuid(),
  codigo_unidade text null,
  chave text not null,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text null
);

create unique index if not exists configuracao_sistema_global_chave_uidx
  on almox.configuracao_sistema (chave)
  where codigo_unidade is null;

create unique index if not exists configuracao_sistema_unidade_chave_uidx
  on almox.configuracao_sistema (codigo_unidade, chave)
  where codigo_unidade is not null;

drop trigger if exists configuracao_sistema_definir_atualizado_em on almox.configuracao_sistema;

create trigger configuracao_sistema_definir_atualizado_em
before update on almox.configuracao_sistema
for each row
execute function almox.definir_atualizado_em();

comment on table almox.configuracao_sistema is 'Parametros globais e por unidade para regras operacionais do almoxarifado.';
comment on column almox.configuracao_sistema.codigo_unidade is 'NULL representa configuracao global. Valor preenchido fica reservado para override por unidade.';
comment on column almox.configuracao_sistema.chave is 'Nome tecnico do parametro consumido pelo app.';
comment on column almox.configuracao_sistema.valor is 'Valor do parametro em JSONB para permitir numeros e estruturas futuras.';
comment on column almox.configuracao_sistema.atualizado_por is 'Usuario autenticado no app que salvou a ultima alteracao.';

alter table almox.configuracao_sistema enable row level security;

grant usage on schema almox to authenticated;
grant select on almox.configuracao_sistema to authenticated;
grant select, insert, update on almox.configuracao_sistema to service_role;

drop policy if exists configuracao_sistema_select on almox.configuracao_sistema;
create policy configuracao_sistema_select
on almox.configuracao_sistema
for select
to authenticated
using (true);

insert into almox.configuracao_sistema (codigo_unidade, chave, valor)
select null, seed.chave, seed.valor
from (
  values
    ('criticoDias', '7'::jsonb),
    ('altoDias', '15'::jsonb),
    ('medioDias', '30'::jsonb),
    ('baixoDias', '60'::jsonb),
    ('riscoAltoDias', '10'::jsonb),
    ('riscoMedioDias', '25'::jsonb),
    ('prioridadeUrgenteDias', '7'::jsonb),
    ('prioridadeAltaDias', '15'::jsonb),
    ('comprarDias', '15'::jsonb),
    ('podeEmprestarDias', '120'::jsonb),
    ('doadorSeguroDias', '100'::jsonb),
    ('pisoDoadorAposEmprestimoDias', '100'::jsonb),
    ('alvoTransferenciaCmm', '0.75'::jsonb),
    ('mesesCompraSugerida', '2'::jsonb),
    ('excluirCmmMenorQueUm', 'false'::jsonb)
) as seed(chave, valor)
where not exists (
  select 1
  from almox.configuracao_sistema atual
  where atual.codigo_unidade is null
    and atual.chave = seed.chave
);

create or replace function public.listar_configuracao_sistema(
  p_codigo_unidade text default null
)
returns table (
  codigo_unidade text,
  chave text,
  valor jsonb,
  atualizado_em timestamptz,
  atualizado_por text
)
language sql
security definer
set search_path = public, almox
as $$
  select
    c.codigo_unidade,
    c.chave,
    c.valor,
    c.atualizado_em,
    c.atualizado_por
  from almox.configuracao_sistema c
  where (
    (p_codigo_unidade is null and c.codigo_unidade is null)
    or c.codigo_unidade = p_codigo_unidade
  )
  order by c.chave;
$$;

create or replace function public.salvar_configuracao_sistema(
  p_chave text,
  p_valor jsonb,
  p_codigo_unidade text default null,
  p_atualizado_por text default null
)
returns void
language plpgsql
security definer
set search_path = public, almox
as $$
declare
  v_id uuid;
begin
  select c.id
  into v_id
  from almox.configuracao_sistema c
  where c.chave = p_chave
    and (
      (p_codigo_unidade is null and c.codigo_unidade is null)
      or c.codigo_unidade = p_codigo_unidade
    )
  limit 1;

  if v_id is null then
    insert into almox.configuracao_sistema (
      codigo_unidade,
      chave,
      valor,
      atualizado_por
    )
    values (
      p_codigo_unidade,
      p_chave,
      p_valor,
      p_atualizado_por
    );
  else
    update almox.configuracao_sistema
    set valor = p_valor,
        atualizado_por = p_atualizado_por,
        atualizado_em = now()
    where id = v_id;
  end if;
end;
$$;

revoke all on function public.listar_configuracao_sistema(text) from public, anon, authenticated;
revoke all on function public.salvar_configuracao_sistema(text, jsonb, text, text) from public, anon, authenticated;

grant execute on function public.listar_configuracao_sistema(text) to service_role;
grant execute on function public.salvar_configuracao_sistema(text, jsonb, text, text) to service_role;
