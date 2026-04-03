import crypto from 'node:crypto';

import {
  dispararWorkflowSincronizacaoSiscore,
  getGitHubActionsConfig,
  resolverJobsSincronizacaoSiscore,
} from '@/server/github-actions';
import { executarImportacaoSiscoreDoUsuario, SiscoreSyncScope } from '@/server/run-siscore-import';
import { lerCredencialSiscoreUsuario } from '@/server/siscore-credential-store';
import {
  atualizarSincronizacaoSiscoreStatus,
  consolidarSincronizacaoSiscore,
  listarSincronizacoesSiscore,
  registrarSincronizacoesSiscoreEnfileiradas,
} from '@/server/siscore-sync-tracker';
import { lerSessaoDoRequest } from '@/server/session-cookie';

function parseScope(value: unknown): SiscoreSyncScope {
  return value === 'material_hospitalar' ||
    value === 'material_farmacologico' ||
    value === 'estoque' ||
    value === 'notas_fiscais' ||
    value === 'all'
    ? value
    : 'all';
}

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const trackingId = String(searchParams.get('trackingId') ?? '').trim();

    if (!trackingId) {
      return Response.json(
        {
          error: 'Informe o trackingId da sincronizacao.',
        },
        { status: 400 }
      );
    }

    const jobs = await listarSincronizacoesSiscore(trackingId);
    const consolidation = consolidarSincronizacaoSiscore(jobs);

    return Response.json({
      ok: true,
      trackingId,
      status: consolidation.status,
      completed: consolidation.completed,
      queuedJobs: consolidation.queuedJobs,
      runningJobs: consolidation.runningJobs,
      successJobs: consolidation.successJobs,
      failedJobs: consolidation.failedJobs,
      jobs,
    });
  } catch (error) {
    console.error('[siscore/sync] Falha ao consultar status da sincronizacao do SISCORE.', {
      usuario: session.usuario,
      message: error instanceof Error ? error.message : 'Falha interna ao consultar status.',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Nao foi possivel consultar o andamento da sincronizacao do SISCORE.',
        details: [error instanceof Error ? error.message : 'Falha interna ao consultar status.'],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const scope = parseScope(body?.scope);
    const credencial = await lerCredencialSiscoreUsuario(session.usuario);

    if (!credencial) {
      return Response.json(
        {
          error: 'Nao existe credencial SISCORE salva para este usuario.',
          details: ['Faca login novamente no site para atualizar a senha usada na sincronizacao.'],
        },
        { status: 409 }
      );
    }

    const githubActions = getGitHubActionsConfig();
    if (githubActions.enabled) {
      const trackingId = crypto.randomUUID();
      const expectedJobs = resolverJobsSincronizacaoSiscore(scope);
      await registrarSincronizacoesSiscoreEnfileiradas({
        trackingId,
        usuario: session.usuario,
        triggeredBy: session.usuario,
        jobs: expectedJobs.map((job) => ({
          jobTipo: job.jobTipo,
          scope: job.scope,
          workflowArquivo: job.workflowArquivo,
        })),
      });

      const dispatch = await dispararWorkflowSincronizacaoSiscore({
        usuario: session.usuario,
        scope,
        trackingId,
      });

      const dispatchErrors = dispatch.jobs.filter((job) => !job.dispatched && job.dispatchError);
      if (dispatchErrors.length > 0) {
        await Promise.all(
          dispatchErrors.map((job) =>
            atualizarSincronizacaoSiscoreStatus({
              trackingId,
              jobTipo: job.jobTipo,
              scope: job.scope,
              usuario: session.usuario,
              triggeredBy: session.usuario,
              workflowArquivo: job.workflowArquivo,
              status: 'failed',
              mensagemErro: job.dispatchError,
            }).catch(() => undefined)
          )
        );
      }

      const dispatchedJobs = dispatch.jobs.filter((job) => job.dispatched);
      if (dispatchedJobs.length === 0) {
        throw new Error(dispatchErrors.map((job) => job.dispatchError).join('; ') || 'Falha ao disparar os workflows do GitHub Actions.');
      }

      return Response.json(
        {
          ok: true,
          queued: true,
          trackingId,
          usuario: session.usuario,
          scope,
          message:
            dispatchedJobs.length > 1
              ? 'Sincronizacao enviada ao GitHub Actions em duas filas: estoque e notas fiscais.'
              : 'Sincronizacao enviada ao GitHub Actions.',
          jobs: dispatch.jobs.map((job) => ({
            ...job,
            status: job.dispatched ? 'queued' : 'failed',
            workflowRunUrl: null,
            mensagemErro: job.dispatchError ?? null,
          })),
        },
        { status: 202 }
      );
    }

    const result = await executarImportacaoSiscoreDoUsuario(session.usuario, scope);

    return Response.json({
      ok: true,
      usuario: session.usuario,
      scope,
      result,
    });
  } catch (error) {
    console.error('[siscore/sync] Falha ao sincronizar base do SISCORE.', {
      usuario: session.usuario,
      message: error instanceof Error ? error.message : 'Falha interna na sincronizacao.',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Nao foi possivel sincronizar a base do SISCORE agora.',
        details: [error instanceof Error ? error.message : 'Falha interna na sincronizacao.'],
      },
      { status: 500 }
    );
  }
}
