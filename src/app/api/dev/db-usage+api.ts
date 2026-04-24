import { lerSessaoDoRequest } from '@/server/session-cookie';
import { getSupabaseAdmin } from '@/server/supabase-admin';

const DEV_USER = 'hugorwagemacher';

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  if (session.usuario.trim().toLowerCase() !== DEV_USER) {
    return Response.json({ error: 'Acesso restrito.' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin() as any;

  const [dbUsage, queryStats, usuariosOnline] = await Promise.all([
    supabase.rpc('almox_dev_db_usage', { p_top_tables: 10, p_max_connections: 20 }),
    supabase.rpc('almox_dev_query_stats', { p_limit: 15 }),
    supabase.rpc('almox_dev_usuarios_online', { p_janela_minutos: 5, p_max_usuarios: 30 }),
  ]);

  if (dbUsage.error) {
    return Response.json(
      { error: `Falha ao consultar uso do banco: ${dbUsage.error.message}` },
      { status: 500 }
    );
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const projectRefMatch = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const projectRef = projectRefMatch?.[1] ?? null;
  const painelUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/reports/usage`
    : null;

  return Response.json({
    dbUsage: dbUsage.data,
    queryStats: queryStats.error ? null : queryStats.data,
    queryStatsError: queryStats.error?.message ?? null,
    usuariosOnline: usuariosOnline.error ? null : usuariosOnline.data,
    usuariosOnlineError: usuariosOnline.error?.message ?? null,
    painelUrl,
  });
}
