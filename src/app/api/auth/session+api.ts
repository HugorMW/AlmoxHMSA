import { lerSessaoDoRequest } from '@/server/session-cookie';

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  return Response.json({ session });
}
