import { getSupabaseAdmin } from '@/server/supabase-admin';

type RawPreferenciaUsuarioRow = {
  usuario: string;
  scope: string;
  valor: unknown;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

function normalizarUsuarioPreferencia(usuario: string) {
  return usuario.trim().toLowerCase();
}

function normalizarScope(scope: string) {
  return scope.trim();
}

export async function lerPreferenciaUsuario<T>(usuario: string, scope: string) {
  const usuarioNormalizado = normalizarUsuarioPreferencia(usuario);
  const scopeNormalizado = normalizarScope(scope);

  if (!usuarioNormalizado || !scopeNormalizado) {
    return null;
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.rpc('ler_preferencia_usuario', {
    p_usuario: usuarioNormalizado,
    p_scope: scopeNormalizado,
  });

  if (error) {
    throw new Error(`Supabase RPC ler_preferencia_usuario falhou: ${error.message}`);
  }

  const row = ((data ?? []) as RawPreferenciaUsuarioRow[])[0];
  if (!row) {
    return null;
  }

  return {
    value: row.valor as T,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarPreferenciaUsuario<T>(usuario: string, scope: string, value: T) {
  const usuarioLimpo = usuario.trim();
  const usuarioNormalizado = normalizarUsuarioPreferencia(usuario);
  const scopeNormalizado = normalizarScope(scope);

  if (!usuarioNormalizado) {
    throw new Error('Usuario obrigatorio para salvar preferencia.');
  }

  if (!scopeNormalizado) {
    throw new Error('Scope obrigatorio para salvar preferencia.');
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.rpc('salvar_preferencia_usuario', {
    p_usuario: usuarioLimpo,
    p_scope: scopeNormalizado,
    p_valor: value,
    p_atualizado_por: usuarioLimpo,
  });

  if (error) {
    throw new Error(`Supabase RPC salvar_preferencia_usuario falhou: ${error.message}`);
  }

  const row = ((data ?? []) as RawPreferenciaUsuarioRow[])[0] ?? null;
  return row
    ? {
        value: row.valor as T,
        atualizadoEm: row.atualizado_em,
        atualizadoPor: row.atualizado_por,
      }
    : null;
}
