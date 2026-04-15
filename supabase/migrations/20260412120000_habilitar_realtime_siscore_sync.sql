-- Habilita Supabase Realtime na tabela siscore_sync_execucao para que o
-- cliente web possa monitorar o status do sync sem polling por intervalo.
-- O tracking_id (UUID) age como token de acesso: quem não sabe o UUID
-- não consegue filtrar os eventos relevantes.

-- Concede acesso de leitura ao role anon/authenticated para que a
-- subscription Realtime do cliente público funcione.
grant usage on schema almox to anon, authenticated;

grant select (
  id,
  tracking_id,
  job_tipo,
  scope,
  status,
  workflow_run_url,
  mensagem_erro,
  criado_em,
  iniciado_em,
  finalizado_em,
  atualizado_em,
  metadados
) on almox.siscore_sync_execucao to anon, authenticated;

-- Habilita RLS na tabela (o service_role ainda ignora RLS, portanto
-- os workflows do GitHub Actions continuam funcionando normalmente).
alter table almox.siscore_sync_execucao enable row level security;

-- Política permissiva de leitura: o tracking_id UUID funciona como
-- token de capacidade — sem ele o cliente não sabe o que filtrar.
create policy "siscore_sync_execucao_leitura_publica"
  on almox.siscore_sync_execucao
  for select
  to anon, authenticated
  using (true);

-- Adiciona a tabela à publication do Supabase Realtime.
alter publication supabase_realtime add table almox.siscore_sync_execucao;
