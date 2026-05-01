import {
  ProductTableAdminConfig,
  normalizarProductTableAdminConfig,
} from "@/features/almox/product-table-screen-config";
import {
  lerProductTableScreenConfig,
  salvarProductTableScreenConfig,
} from "@/server/product-table-screen-config";
import { lerSessaoDoRequest } from "@/server/session-cookie";

function pickProductTableColumnsPatch(value: unknown) {
  const source =
    typeof value === "object" && value !== null && "config" in value
      ? (value as { config?: unknown }).config
      : value;

  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return null;
  }

  return normalizarProductTableAdminConfig(source);
}

export async function GET(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: "Sessao nao autenticada." }, { status: 401 });
  }

  try {
    const { config, atualizadoEm } = await lerProductTableScreenConfig();

    return Response.json({
      ok: true,
      config,
      atualizadoEm,
    });
  } catch (error) {
    console.error(
      "[product-table-columns] Falha ao carregar configuracao de colunas.",
      {
        usuario: session.usuario,
        message:
          error instanceof Error
            ? error.message
            : "Falha interna ao carregar configuracao de colunas.",
        stack: error instanceof Error ? error.stack : undefined,
      },
    );

    return Response.json(
      {
        error:
          "Nao foi possivel carregar a configuracao de colunas das tabelas.",
        details: [
          error instanceof Error
            ? error.message
            : "Falha interna ao carregar configuracao de colunas.",
        ],
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const session = lerSessaoDoRequest(request);

  if (!session) {
    return Response.json({ error: "Sessao nao autenticada." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const nextConfig = pickProductTableColumnsPatch(body);

    if (!nextConfig) {
      return Response.json(
        {
          error:
            "Envie um objeto de configuracao de colunas para atualizar os parametros.",
        },
        { status: 400 },
      );
    }

    const saved = await salvarProductTableScreenConfig(
      nextConfig as ProductTableAdminConfig,
      session.usuario,
    );

    return Response.json({
      ok: true,
      config: saved.config,
      atualizadoEm: saved.atualizadoEm,
    });
  } catch (error) {
    console.error(
      "[product-table-columns] Falha ao salvar configuracao de colunas.",
      {
        usuario: session.usuario,
        message:
          error instanceof Error
            ? error.message
            : "Falha interna ao salvar configuracao de colunas.",
        stack: error instanceof Error ? error.stack : undefined,
      },
    );

    return Response.json(
      {
        error:
          "Nao foi possivel salvar a configuracao de colunas das tabelas.",
        details: [
          error instanceof Error
            ? error.message
            : "Falha interna ao salvar configuracao de colunas.",
        ],
      },
      { status: 500 },
    );
  }
}
