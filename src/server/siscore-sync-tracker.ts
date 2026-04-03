import { SiscoreSyncScope } from '@/server/run-siscore-import';
import { getSupabaseAdmin } from '@/server/supabase-admin';

export type SiscoreSyncJobTipo = 'estoque' | 'notas_fiscais';
export type SiscoreSyncJobStatus = 'queued' | 'running' | 'success' | 'failed';
export type SiscoreSyncOverallStatus = SiscoreSyncJobStatus | 'not_found';

export type SiscoreSyncJobDefinition = {
  jobTipo: SiscoreSyncJobTipo;
  scope: SiscoreSyncScope;
  workflowArquivo: string;
};

export type SiscoreSyncTrackedJob = {
  trackingId: string;
  jobTipo: SiscoreSyncJobTipo;
  scope: SiscoreSyncScope;
  usuario: string;
  triggeredBy: string;
  workflowArquivo: string;
  status: SiscoreSyncJobStatus;
  workflowRunUrl: string | null;
  mensagemErro: string | null;
  criadoEm: string;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  atualizadoEm: string;
  metadados: Record<string, unknown>;
};

type RawTrackedJob = {
  tracking_id: string;
  job_tipo: SiscoreSyncJobTipo;
  scope: SiscoreSyncScope;
  usuario: string;
  triggered_by: string;
  workflow_arquivo: string;
  status: SiscoreSyncJobStatus;
  workflow_run_url: string | null;
  mensagem_erro: string | null;
  criado_em: string;
  iniciado_em: string | null;
  finalizado_em: string | null;
  atualizado_em: string;
  metadados: Record<string, unknown> | null;
};

export async function registrarSincronizacoesSiscoreEnfileiradas({
  trackingId,
  usuario,
  triggeredBy,
  jobs,
}: {
  trackingId: string;
  usuario: string;
  triggeredBy: string;
  jobs: SiscoreSyncJobDefinition[];
}) {
  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.rpc('registrar_sincronizacoes_siscore_enfileiradas', {
    p_tracking_id: trackingId,
    p_usuario: usuario,
    p_triggered_by: triggeredBy,
    p_jobs: jobs.map((job) => ({
      job_tipo: job.jobTipo,
      scope: job.scope,
      workflow_arquivo: job.workflowArquivo,
    })),
  });

  if (error) {
    throw new Error(`Supabase RPC registrar_sincronizacoes_siscore_enfileiradas falhou: ${error.message}`);
  }
}

export async function atualizarSincronizacaoSiscoreStatus({
  trackingId,
  jobTipo,
  scope,
  usuario,
  triggeredBy,
  workflowArquivo,
  status,
  mensagemErro,
  workflowRunUrl,
  metadados,
}: {
  trackingId: string;
  jobTipo: SiscoreSyncJobTipo;
  scope: SiscoreSyncScope;
  usuario: string;
  triggeredBy: string;
  workflowArquivo: string;
  status: SiscoreSyncJobStatus;
  mensagemErro?: string | null;
  workflowRunUrl?: string | null;
  metadados?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.rpc('atualizar_sincronizacao_siscore_status', {
    p_tracking_id: trackingId,
    p_job_tipo: jobTipo,
    p_scope: scope,
    p_usuario: usuario,
    p_triggered_by: triggeredBy,
    p_workflow_arquivo: workflowArquivo,
    p_status: status,
    p_mensagem_erro: mensagemErro ?? null,
    p_workflow_run_url: workflowRunUrl ?? null,
    p_metadados: metadados ?? {},
  });

  if (error) {
    throw new Error(`Supabase RPC atualizar_sincronizacao_siscore_status falhou: ${error.message}`);
  }
}

export async function listarSincronizacoesSiscore(trackingId: string) {
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.rpc('listar_sincronizacoes_siscore', {
    p_tracking_id: trackingId,
  });

  if (error) {
    throw new Error(`Supabase RPC listar_sincronizacoes_siscore falhou: ${error.message}`);
  }

  return ((data ?? []) as RawTrackedJob[]).map((row) => ({
    trackingId: row.tracking_id,
    jobTipo: row.job_tipo,
    scope: row.scope,
    usuario: row.usuario,
    triggeredBy: row.triggered_by,
    workflowArquivo: row.workflow_arquivo,
    status: row.status,
    workflowRunUrl: row.workflow_run_url,
    mensagemErro: row.mensagem_erro,
    criadoEm: row.criado_em,
    iniciadoEm: row.iniciado_em,
    finalizadoEm: row.finalizado_em,
    atualizadoEm: row.atualizado_em,
    metadados: row.metadados ?? {},
  }));
}

export function consolidarSincronizacaoSiscore(jobs: SiscoreSyncTrackedJob[]): {
  status: SiscoreSyncOverallStatus;
  queuedJobs: number;
  runningJobs: number;
  successJobs: number;
  failedJobs: number;
  completed: boolean;
} {
  if (!jobs.length) {
    return {
      status: 'not_found',
      queuedJobs: 0,
      runningJobs: 0,
      successJobs: 0,
      failedJobs: 0,
      completed: false,
    };
  }

  const queuedJobs = jobs.filter((job) => job.status === 'queued').length;
  const runningJobs = jobs.filter((job) => job.status === 'running').length;
  const successJobs = jobs.filter((job) => job.status === 'success').length;
  const failedJobs = jobs.filter((job) => job.status === 'failed').length;

  let status: SiscoreSyncOverallStatus = 'queued';
  if (successJobs === jobs.length) {
    status = 'success';
  } else if (runningJobs > 0) {
    status = 'running';
  } else if (queuedJobs > 0) {
    status = 'queued';
  } else if (failedJobs > 0) {
    status = 'failed';
  }

  return {
    status,
    queuedJobs,
    runningJobs,
    successJobs,
    failedJobs,
    completed: status === 'success' || status === 'failed',
  };
}
