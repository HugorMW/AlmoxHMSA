import { lerSessaoDoRequest } from '@/server/session-cookie';
import { registrarAcessoSiscoreUsuario } from '@/server/siscore-credential-store';

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  registrarAcessoSiscoreUsuario(session.usuario).catch((error: unknown) => {
    console.warn(
      '[auth/session] Falha ao registrar ultimo acesso do usuario.',
      error instanceof Error ? error.message : error
    );
  });

  return Response.json({ session });
}
