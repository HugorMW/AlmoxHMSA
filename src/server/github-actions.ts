import { SiscoreSyncScope } from '@/server/run-siscore-import';

function trimEnv(name: string) {
  return String(process.env[name] ?? '').trim();
}

export function getGitHubActionsConfig() {
  const repository = trimEnv('GITHUB_ACTIONS_REPOSITORY');
  const token = trimEnv('GITHUB_ACTIONS_TRIGGER_TOKEN');
  const workflow = trimEnv('GITHUB_ACTIONS_SYNC_WORKFLOW') || 'siscore-sync.yml';
  const ref = trimEnv('GITHUB_ACTIONS_SYNC_REF') || 'master';

  return {
    repository,
    token,
    workflow,
    ref,
    enabled: Boolean(repository && token),
  };
}

export function getGitHubActionsWorkflowUrl() {
  const { repository, workflow, enabled } = getGitHubActionsConfig();
  if (!enabled) {
    return null;
  }

  return `https://github.com/${repository}/actions/workflows/${workflow}`;
}

export async function dispararWorkflowSincronizacaoSiscore({
  usuario,
  scope,
}: {
  usuario: string;
  scope: SiscoreSyncScope;
}) {
  const { repository, token, workflow, ref, enabled } = getGitHubActionsConfig();

  if (!enabled) {
    throw new Error(
      'GITHUB_ACTIONS_REPOSITORY e GITHUB_ACTIONS_TRIGGER_TOKEN precisam estar definidos para disparar a sincronizacao externa.'
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,
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
          scope,
          triggered_by: usuario,
        },
      }),
    }
  );

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '');
    throw new Error(
      `GitHub Actions recusou o disparo da sincronizacao. HTTP ${response.status}. ${rawBody || 'Sem detalhes adicionais.'}`
    );
  }

  return {
    repository,
    workflow,
    ref,
    url: getGitHubActionsWorkflowUrl(),
  };
}
