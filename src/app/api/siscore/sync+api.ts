import { dispararWorkflowSincronizacaoSiscore, getGitHubActionsConfig } from '@/server/github-actions';
import { executarImportacaoSiscoreDoUsuario, SiscoreSyncScope } from '@/server/run-siscore-import';
import { lerCredencialSiscoreUsuario } from '@/server/siscore-credential-store';
import { lerSessaoDoRequest } from '@/server/session-cookie';

function parseScope(value: unknown): SiscoreSyncScope {
  return value === 'material_hospitalar' ||
    value === 'material_farmacologico' ||
    value === 'notas_fiscais' ||
    value === 'all'
    ? value
    : 'all';
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
      const dispatch = await dispararWorkflowSincronizacaoSiscore({
        usuario: session.usuario,
        scope,
      });

      return Response.json(
        {
          ok: true,
          queued: true,
          usuario: session.usuario,
          scope,
          message: 'Sincronizacao enviada ao GitHub Actions.',
          workflowUrl: dispatch.url,
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
