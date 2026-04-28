import { getSupabaseAdmin } from '@/server/supabase-admin';
import { lerSessaoDoRequest } from '@/server/session-cookie';

const MIN_DAYS = 1;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;

function mapHospitalCode(code: string): string | null {
  const normalized = String(code ?? '').trim().toUpperCase();
  if (normalized === 'HMSASOUL') return 'HMSA';
  if (normalized === 'HMSA' || normalized === 'HEC' || normalized === 'HDDS' || normalized === 'HABF') {
    return normalized;
  }
  return null;
}

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get('dias') ?? DEFAULT_DAYS);
  const dias = Number.isFinite(rawDays)
    ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.trunc(rawDays)))
    : DEFAULT_DAYS;

  try {
    const supabase = getSupabaseAdmin() as any;
    const { data, error } = await supabase.rpc('almox_dashboard_kpi_historico', { p_dias: dias });

    if (error) {
      throw new Error(error.message);
    }

    type Row = {
      data_referencia: string;
      codigo_unidade: string;
      urgent: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      stable: number;
      total_products: number;
    };

    const rows = (Array.isArray(data) ? (data as Row[]) : []).reduce<
      Record<string, { data: string; urgent: number; critical: number; high: number; medium: number; low: number; stable: number; total_products: number }[]>
    >((accumulator, row) => {
      const hospital = mapHospitalCode(row.codigo_unidade);
      if (!hospital) return accumulator;
      if (!accumulator[hospital]) {
        accumulator[hospital] = [];
      }
      accumulator[hospital].push({
        data: row.data_referencia,
        urgent: Number(row.urgent ?? 0),
        critical: Number(row.critical ?? 0),
        high: Number(row.high ?? 0),
        medium: Number(row.medium ?? 0),
        low: Number(row.low ?? 0),
        stable: Number(row.stable ?? 0),
        total_products: Number(row.total_products ?? 0),
      });
      return accumulator;
    }, {});

    return Response.json({ ok: true, dias, byHospital: rows });
  } catch (error) {
    console.error('[dashboard/kpi-historico] Falha ao consultar snapshots.', {
      usuario: session.usuario,
      message: error instanceof Error ? error.message : 'Falha interna ao consultar historico.',
    });
    return Response.json(
      {
        error: 'Nao foi possivel carregar o historico de KPIs.',
        details: [error instanceof Error ? error.message : 'Falha interna ao consultar historico.'],
      },
      { status: 500 }
    );
  }
}
