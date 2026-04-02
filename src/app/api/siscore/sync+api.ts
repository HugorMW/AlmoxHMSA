import { executarImportacaoSiscoreDoUsuario } from '@/server/run-siscore-import';
import { lerCredencialSiscoreUsuario } from '@/server/siscore-credential-store';
import { lerSessaoDoRequest } from '@/server/session-cookie';

export async function POST(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  try {
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

    const result = await executarImportacaoSiscoreDoUsuario(session.usuario);

    return Response.json({
      ok: true,
      usuario: session.usuario,
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
