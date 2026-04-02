import crypto from 'node:crypto';

import pg from 'pg';

const { Client } = pg;

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

function getConnectionString() {
  const connectionString = process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL nao foi definida para acessar as credenciais do SISCORE.');
  }

  return connectionString;
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

async function withClient<T>(handler: (client: any) => Promise<T>) {
  const client = new Client({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    return await handler(client);
  } finally {
    await client.end();
  }
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

  await withClient(async (client) => {
    await client.query(
      `
        insert into almox.siscore_credencial_usuario (
          siscore_usuario,
          siscore_usuario_chave,
          senha_cifrada,
          iv,
          auth_tag,
          ultima_validacao_em
        )
        values ($1, $2, $3, $4, $5, now())
        on conflict (siscore_usuario_chave) do update
          set siscore_usuario = excluded.siscore_usuario,
              senha_cifrada = excluded.senha_cifrada,
              iv = excluded.iv,
              auth_tag = excluded.auth_tag,
              ultima_validacao_em = now(),
              atualizado_em = now()
      `,
      [
        usuarioLimpo,
        usuarioChave,
        encrypted.senha_cifrada,
        encrypted.iv,
        encrypted.auth_tag,
      ]
    );
  });
}

export async function lerCredencialSiscoreUsuario(usuario: string) {
  const usuarioChave = normalizarUsuarioSiscore(usuario);
  if (!usuarioChave) {
    return null;
  }

  return withClient(async (client) => {
    const result = await client.query(
      `
        select
          siscore_usuario,
          senha_cifrada,
          iv,
          auth_tag,
          ultima_validacao_em,
          ultimo_uso_em
        from almox.siscore_credencial_usuario
        where siscore_usuario_chave = $1
        limit 1
      `,
      [usuarioChave]
    );

    if (!result.rowCount) {
      return null;
    }

    const credencial = result.rows[0] as CredencialPersistida;

    return {
      usuario: credencial.siscore_usuario,
      senha: decryptPassword(credencial),
      ultimaValidacaoEm: credencial.ultima_validacao_em,
      ultimoUsoEm: credencial.ultimo_uso_em,
    };
  });
}

export async function registrarUsoCredencialSiscoreUsuario(usuario: string) {
  const usuarioChave = normalizarUsuarioSiscore(usuario);
  if (!usuarioChave) {
    return;
  }

  await withClient(async (client) => {
    await client.query(
      `
        update almox.siscore_credencial_usuario
        set ultimo_uso_em = now(),
            atualizado_em = now()
        where siscore_usuario_chave = $1
      `,
      [usuarioChave]
    );
  });
}
