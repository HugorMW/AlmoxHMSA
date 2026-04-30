import { lerSessaoDoRequest } from '@/server/session-cookie';
import { lerPreferenciaUsuario, salvarPreferenciaUsuario } from '@/server/almox-preferencias-usuario';

function normalizarScope(scope: unknown) {
  if (typeof scope !== 'string') {
    return null;
  }

  const scopeLimpo = scope.trim();
  if (!scopeLimpo || scopeLimpo.length > 120) {
    return null;
  }

  return scopeLimpo;
}

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = normalizarScope(url.searchParams.get('scope'));

  if (!scope) {
    return Response.json(
      { error: 'Informe um scope valido para carregar a preferencia.' },
      { status: 400 }
    );
  }

  try {
    const preferencia = await lerPreferenciaUsuario(session.usuario, scope);

    return Response.json({
      ok: true,
      scope,
      value: preferencia?.value ?? null,
      atualizadoEm: preferencia?.atualizadoEm ?? null,
      atualizadoPor: preferencia?.atualizadoPor ?? null,
    });
  } catch (error) {
    console.error('[preferencias] Falha ao carregar preferencia do usuario.', {
      usuario: session.usuario,
      scope,
      message: error instanceof Error ? error.message : 'Falha interna ao carregar preferencia.',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Nao foi possivel carregar a preferencia do usuario.',
        details: [error instanceof Error ? error.message : 'Falha interna ao carregar preferencia.'],
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const scope = normalizarScope(body && typeof body === 'object' ? (body as { scope?: unknown }).scope : null);

    if (!scope) {
      return Response.json(
        { error: 'Informe um scope valido para salvar a preferencia.' },
        { status: 400 }
      );
    }

    const value = body && typeof body === 'object' ? (body as { value?: unknown }).value : undefined;
    if (typeof value === 'undefined') {
      return Response.json(
        { error: 'Envie um valor para salvar a preferencia.' },
        { status: 400 }
      );
    }

    const preferencia = await salvarPreferenciaUsuario(session.usuario, scope, value);

    return Response.json({
      ok: true,
      scope,
      value: preferencia?.value ?? value,
      atualizadoEm: preferencia?.atualizadoEm ?? null,
      atualizadoPor: preferencia?.atualizadoPor ?? session.usuario,
    });
  } catch (error) {
    console.error('[preferencias] Falha ao salvar preferencia do usuario.', {
      usuario: session.usuario,
      message: error instanceof Error ? error.message : 'Falha interna ao salvar preferencia.',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Nao foi possivel salvar a preferencia do usuario.',
        details: [error instanceof Error ? error.message : 'Falha interna ao salvar preferencia.'],
      },
      { status: 500 }
    );
  }
}
