import {
  PRODUCT_TABLE_ADMIN_CONFIG_STORAGE_KEY,
  ProductTableAdminConfig,
  normalizarProductTableAdminConfig,
} from "@/features/almox/product-table-screen-config";
import { getSupabaseAdmin } from "@/server/supabase-admin";

type RawConfiguracaoRow = {
  chave: string;
  valor: unknown;
  atualizado_em: string | null;
};

export async function lerProductTableScreenConfig() {
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.rpc("listar_configuracao_sistema", {
    p_codigo_unidade: null,
  });

  if (error) {
    throw new Error(
      `Supabase RPC listar_configuracao_sistema falhou: ${error.message}`,
    );
  }

  const rows = (data ?? []) as RawConfiguracaoRow[];
  const row = rows.find(
    (entry) => entry.chave === PRODUCT_TABLE_ADMIN_CONFIG_STORAGE_KEY,
  );

  return {
    config: normalizarProductTableAdminConfig(row?.valor),
    atualizadoEm: row?.atualizado_em ?? null,
  };
}

export async function salvarProductTableScreenConfig(
  config: ProductTableAdminConfig,
  usuario: string,
) {
  const supabase = getSupabaseAdmin() as any;
  const normalized = normalizarProductTableAdminConfig(config);
  const { error } = await supabase.rpc("salvar_configuracao_sistema", {
    p_chave: PRODUCT_TABLE_ADMIN_CONFIG_STORAGE_KEY,
    p_valor: JSON.stringify(normalized),
    p_codigo_unidade: null,
    p_atualizado_por: usuario,
  });

  if (error) {
    throw new Error(
      `Supabase RPC salvar_configuracao_sistema falhou para ${PRODUCT_TABLE_ADMIN_CONFIG_STORAGE_KEY}: ${error.message}`,
    );
  }

  return lerProductTableScreenConfig();
}
