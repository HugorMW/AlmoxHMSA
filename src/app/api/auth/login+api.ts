import { autenticarNoSiscore, SiscoreAuthError } from '@/server/siscore-auth';
import {
  registrarAcessoSiscoreUsuario,
  salvarCredencialSiscoreUsuario,
} from '@/server/siscore-credential-store';
import { criarHeaderSetCookieDeSessao, criarSessionToken } from '@/server/session-cookie';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const usuario = String(body?.usuario ?? '').trim();
    const senha = String(body?.senha ?? '').trim();

    if (!usuario || !senha) {
      return Response.json(
        { error: 'Informe usuario e senha do SISCORE.' },
        { status: 400 }
      );
    }

    const session = await autenticarNoSiscore({
      baseUrl: process.env.SISCORE_BASE_URL ?? '',
      usuario,
      senha,
      validationUrl:
        process.env.SISCORE_EXPORTACAO_URL ||
        process.env.SISCORE_EXPORTACAO_URL_FARMACOLOGICO ||
        '',
    });

    await salvarCredencialSiscoreUsuario({ usuario, senha });

    registrarAcessoSiscoreUsuario(session.usuario).catch((rpcError: unknown) => {
      console.warn(
        '[auth/login] Falha ao registrar ultimo acesso do usuario.',
        rpcError instanceof Error ? rpcError.message : rpcError
      );
    });

    const token = criarSessionToken(session.usuario);

    return Response.json(
      { session },
      {
        status: 200,
        headers: {
          'Set-Cookie': criarHeaderSetCookieDeSessao(token, request.url),
        },
      }
    );
  } catch (error) {
    if (error instanceof SiscoreAuthError) {
      return Response.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }

    if (error instanceof Error) {
      console.error('[auth/login] Falha ao salvar credencial SISCORE apos login valido.', {
        message: error.message,
        stack: error.stack,
      });

      return Response.json(
        {
          error: 'O login foi validado no SISCORE, mas nao foi possivel salvar a credencial para atualizacao futura da base.',
          details: [error.message],
        },
        { status: 500 }
      );
    }

    console.error('[auth/login] Falha interna nao identificada ao finalizar login do SISCORE.', error);

    return Response.json(
      {
        error: 'Nao foi possivel autenticar no SISCORE agora.',
        details: ['Etapa: processamento interno do login.'],
      },
      { status: 500 }
    );
  }
}
