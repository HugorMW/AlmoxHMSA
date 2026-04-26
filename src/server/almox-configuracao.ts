import {
  ConfiguracaoSistema,
  ConfiguracaoSistemaKey,
  configuracaoSistemaKeys,
  criarConfiguracaoSistemaDeRows,
  validarConfiguracaoSistema,
} from '@/features/almox/configuracao';
import { getSupabaseAdmin } from '@/server/supabase-admin';

type RawConfiguracaoRow = {
  chave: string;
  valor: unknown;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

export async function lerConfiguracaoSistema() {
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.rpc('listar_configuracao_sistema', {
    p_codigo_unidade: null,
  });

  if (error) {
    throw new Error(`Supabase RPC listar_configuracao_sistema falhou: ${error.message}`);
  }

  const rows = (data ?? []) as RawConfiguracaoRow[];
  const config = criarConfiguracaoSistemaDeRows(rows);
  const atualizadoEm =
    rows
      .map((row) => row.atualizado_em)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

  return {
    config,
    atualizadoEm,
  };
}

export async function salvarConfiguracaoSistema(
  config: ConfiguracaoSistema,
  usuario: string,
  keys: ConfiguracaoSistemaKey[] = configuracaoSistemaKeys
) {
  const issues = validarConfiguracaoSistema(config);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join('\n'));
  }

  const supabase = getSupabaseAdmin() as any;

  for (const key of keys) {
    const { error } = await supabase.rpc('salvar_configuracao_sistema', {
      p_chave: key,
      p_valor: config[key],
      p_codigo_unidade: null,
      p_atualizado_por: usuario,
    });

    if (error) {
      throw new Error(`Supabase RPC salvar_configuracao_sistema falhou para ${key}: ${error.message}`);
    }
  }

  return lerConfiguracaoSistema();
}
