import { SiscoreSyncScope } from '@/server/run-siscore-import';
import { SiscoreSyncJobTipo } from '@/server/siscore-sync-tracker';

function trimEnv(name: string) {
  return String(process.env[name] ?? '').trim();
}

export function getGitHubActionsConfig() {
  const repository = trimEnv('GITHUB_ACTIONS_REPOSITORY');
  const token = trimEnv('GITHUB_ACTIONS_TRIGGER_TOKEN');
  const workflowEstoque =
    trimEnv('GITHUB_ACTIONS_SYNC_WORKFLOW_ESTOQUE') ||
    trimEnv('GITHUB_ACTIONS_SYNC_WORKFLOW') ||
    'siscore-sync.yml';
  const workflowNotas = trimEnv('GITHUB_ACTIONS_SYNC_WORKFLOW_NOTAS') || 'siscore-sync-notas.yml';
  const ref = trimEnv('GITHUB_ACTIONS_SYNC_REF') || 'master';

  return {
    repository,
    token,
    workflowEstoque,
    workflowNotas,
    ref,
    enabled: Boolean(repository && token),
  };
}

function getWorkflowArquivo(jobTipo: SiscoreSyncJobTipo) {
  const { workflowEstoque, workflowNotas } = getGitHubActionsConfig();
  return jobTipo === 'notas_fiscais' ? workflowNotas : workflowEstoque;
}

export function getGitHubActionsWorkflowUrl(jobTipo: SiscoreSyncJobTipo) {
  const { repository, enabled } = getGitHubActionsConfig();
  const workflow = getWorkflowArquivo(jobTipo);
  if (!enabled) {
    return null;
  }

  return `https://github.com/${repository}/actions/workflows/${workflow}`;
}

export function resolverJobsSincronizacaoSiscore(scope: SiscoreSyncScope): Array<{
  jobTipo: SiscoreSyncJobTipo;
  scope: SiscoreSyncScope;
  workflowArquivo: string;
}> {
  const workflowEstoque = getWorkflowArquivo('estoque');
  const workflowNotas = getWorkflowArquivo('notas_fiscais');

  if (scope === 'all') {
    return [
      {
        jobTipo: 'estoque',
        scope: 'estoque',
        workflowArquivo: workflowEstoque,
      },
      {
        jobTipo: 'notas_fiscais',
        scope: 'notas_fiscais',
        workflowArquivo: workflowNotas,
      },
    ];
  }

  if (scope === 'notas_fiscais') {
    return [
      {
        jobTipo: 'notas_fiscais',
        scope,
        workflowArquivo: workflowNotas,
      },
    ];
  }

  return [
    {
      jobTipo: 'estoque',
      scope,
      workflowArquivo: workflowEstoque,
    },
  ];
}

export async function dispararWorkflowSincronizacaoSiscore({
  usuario,
  scope,
  trackingId,
}: {
  usuario: string;
  scope: SiscoreSyncScope;
  trackingId: string;
}) {
  const { repository, token, ref, enabled } = getGitHubActionsConfig();
  const jobs = resolverJobsSincronizacaoSiscore(scope);

  if (!enabled) {
    throw new Error(
      'GITHUB_ACTIONS_REPOSITORY e GITHUB_ACTIONS_TRIGGER_TOKEN precisam estar definidos para disparar a sincronizacao externa.'
    );
  }

  const dispatches: Array<{
    jobTipo: SiscoreSyncJobTipo;
    scope: SiscoreSyncScope;
    workflowArquivo: string;
    url: string | null;
    dispatched: boolean;
    dispatchError?: string;
  }> = [];

  for (const job of jobs) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/${job.workflowArquivo}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'almoxhmsa-sync-dispatch',
        },
        body: JSON.stringify({
          ref,
          inputs: {
            siscore_usuario: usuario,
            scope: job.scope,
            triggered_by: usuario,
            tracking_id: trackingId,
          },
        }),
      }
    );

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '');
      dispatches.push({
        jobTipo: job.jobTipo,
        scope: job.scope,
        workflowArquivo: job.workflowArquivo,
        url: getGitHubActionsWorkflowUrl(job.jobTipo),
        dispatched: false,
        dispatchError: `GitHub Actions recusou o disparo da sincronizacao de ${job.jobTipo}. HTTP ${response.status}. ${
          rawBody || 'Sem detalhes adicionais.'
        }`,
      });
      continue;
    }

    dispatches.push({
      jobTipo: job.jobTipo,
      scope: job.scope,
      workflowArquivo: job.workflowArquivo,
      url: getGitHubActionsWorkflowUrl(job.jobTipo),
      dispatched: true,
    });
  }

  return {
    repository,
    ref,
    trackingId,
    jobs: dispatches,
  };
}
