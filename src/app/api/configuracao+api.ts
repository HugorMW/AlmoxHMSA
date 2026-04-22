import {
  ConfiguracaoSistemaKey,
  configuracaoSistemaKeys,
  isConfiguracaoSistemaKey,
  normalizarConfiguracaoSistema,
  validarConfiguracaoSistema,
} from '@/features/almox/configuracao';
import { lerConfiguracaoSistema, salvarConfiguracaoSistema } from '@/server/almox-configuracao';
import { lerSessaoDoRequest } from '@/server/session-cookie';

function pickConfigPatch(value: unknown) {
  const source =
    typeof value === 'object' && value !== null && 'config' in value
      ? (value as { config?: unknown }).config
      : value;

  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return {
      patch: null,
      unknownKeys: [],
    };
  }

  const patch: Partial<Record<ConfiguracaoSistemaKey, unknown>> = {};
  const unknownKeys: string[] = [];

  for (const [key, rawValue] of Object.entries(source)) {
    if (isConfiguracaoSistemaKey(key)) {
      patch[key] = rawValue;
    } else {
      unknownKeys.push(key);
    }
  }

  return {
    patch,
    unknownKeys,
  };
}

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: 'Sessao nao autenticada.' }, { status: 401 });
  }

  try {
    const { config, atualizadoEm } = await lerConfiguracaoSistema();

    return Response.json({
      ok: true,
      config,
      atualizadoEm,
      keys: configuracaoSistemaKeys,
    });
  } catch (error) {
    console.error('[configuracao] Falha ao carregar configuracao do sistema.', {
      usuario: session.usuario,
      message: error instanceof Error ? error.message : 'Falha interna ao carregar configuracao.',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Nao foi possivel carregar os parametros do sistema.',
        details: [error instanceof Error ? error.message : 'Falha interna ao carregar configuracao.'],
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
    const { patch, unknownKeys } = pickConfigPatch(body);

    if (!patch) {
      return Response.json(
        {
          error: 'Envie um objeto de configuracao para atualizar os parametros.',
        },
        { status: 400 }
      );
    }

    if (unknownKeys.length > 0) {
      return Response.json(
        {
          error: 'A configuracao enviada possui chaves desconhecidas.',
          details: unknownKeys,
        },
        { status: 400 }
      );
    }

    const current = await lerConfiguracaoSistema();
    const nextConfig = normalizarConfiguracaoSistema(patch, current.config);
    const issues = validarConfiguracaoSistema(nextConfig);

    if (issues.length > 0) {
      return Response.json(
        {
          error: 'Revise os parametros informados.',
          details: issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }

    const saved = await salvarConfiguracaoSistema(nextConfig, session.usuario);

    return Response.json({
      ok: true,
      config: saved.config,
      atualizadoEm: saved.atualizadoEm,
    });
  } catch (error) {
    console.error('[configuracao] Falha ao salvar configuracao do sistema.', {
      usuario: session.usuario,
      message: error instanceof Error ? error.message : 'Falha interna ao salvar configuracao.',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        error: 'Nao foi possivel salvar os parametros do sistema.',
        details: [error instanceof Error ? error.message : 'Falha interna ao salvar configuracao.'],
      },
      { status: 500 }
    );
  }
}
