import crypto from 'node:crypto';

import { getSupabaseAdmin } from '@/server/supabase-admin';

type CredencialPersistida = {
  siscore_usuario: string;
  senha_cifrada: string;
  iv: string;
  auth_tag: string;
  ultima_validacao_em: string;
  ultimo_uso_em: string | null;
};

function normalizarUsuarioSiscore(usuario: string) {
  return usuario.trim().toLowerCase();
}

function getCredentialSecret() {
  return (
    process.env.SISCORE_CREDENTIALS_KEY ||
    process.env.APP_SESSION_SECRET ||
    process.env.SUPABASE_PROJECT_REF ||
    process.env.SUPABASE_DB_URL ||
    'almox-dev-credentials-key'
  );
}

function getKey() {
  return crypto.createHash('sha256').update(getCredentialSecret()).digest();
}

function encryptPassword(senha: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(senha, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    senha_cifrada: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    auth_tag: authTag.toString('base64url'),
  };
}

function decryptPassword(credencial: Pick<CredencialPersistida, 'senha_cifrada' | 'iv' | 'auth_tag'>) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(credencial.iv, 'base64url')
  );

  decipher.setAuthTag(Buffer.from(credencial.auth_tag, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(credencial.senha_cifrada, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export async function salvarCredencialSiscoreUsuario({
  usuario,
  senha,
}: {
  usuario: string;
  senha: string;
}) {
  const usuarioLimpo = usuario.trim();
  const usuarioChave = normalizarUsuarioSiscore(usuarioLimpo);

  if (!usuarioLimpo || !senha) {
    throw new Error('Usuario e senha do SISCORE sao obrigatorios para salvar a credencial.');
  }

  const encrypted = encryptPassword(senha);
  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.rpc('salvar_credencial_siscore_usuario', {
    p_siscore_usuario: usuarioLimpo,
    p_siscore_usuario_chave: usuarioChave,
    p_senha_cifrada: encrypted.senha_cifrada,
    p_iv: encrypted.iv,
    p_auth_tag: encrypted.auth_tag,
  });

  if (error) {
    throw new Error(`Supabase RPC salvar_credencial_siscore_usuario falhou: ${error.message}`);
  }
}

export async function lerCredencialSiscoreUsuario(usuario: string) {
  const usuarioChave = normalizarUsuarioSiscore(usuario);
  if (!usuarioChave) {
    return null;
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.rpc('ler_credencial_siscore_usuario', {
    p_siscore_usuario_chave: usuarioChave,
  });

  if (error) {
    throw new Error(`Supabase RPC ler_credencial_siscore_usuario falhou: ${error.message}`);
  }

  const credencial = Array.isArray(data) ? (data[0] as CredencialPersistida | undefined) : undefined;

  if (!credencial) {
    return null;
  }

  return {
    usuario: credencial.siscore_usuario,
    senha: decryptPassword(credencial),
    ultimaValidacaoEm: credencial.ultima_validacao_em,
    ultimoUsoEm: credencial.ultimo_uso_em,
  };
}

export async function registrarUsoCredencialSiscoreUsuario(usuario: string) {
  const usuarioChave = normalizarUsuarioSiscore(usuario);
  if (!usuarioChave) {
    return;
  }

  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.rpc('registrar_uso_credencial_siscore_usuario', {
    p_siscore_usuario_chave: usuarioChave,
  });

  if (error) {
    throw new Error(`Supabase RPC registrar_uso_credencial_siscore_usuario falhou: ${error.message}`);
  }
}
