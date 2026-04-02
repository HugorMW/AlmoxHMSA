import { criarHeaderSetCookieExpirado } from '@/server/session-cookie';

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        'Set-Cookie': criarHeaderSetCookieExpirado(request.url),
      },
    }
  );
}
