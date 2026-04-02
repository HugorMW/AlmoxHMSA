import crypto from 'node:crypto';

import { Client } from 'pg';

function normalizarUsuarioSiscore(usuario) {
  return String(usuario ?? '').trim().toLowerCase();
}

function getCredentialSecret(env) {
  return (
    env.SISCORE_CREDENTIALS_KEY ||
    env.APP_SESSION_SECRET ||
    env.SUPABASE_PROJECT_REF ||
    env.SUPABASE_DB_URL ||
    'almox-dev-credentials-key'
  );
}

function getKey(env) {
  return crypto.createHash('sha256').update(getCredentialSecret(env)).digest();
}

function decryptPassword({ senha_cifrada, iv, auth_tag }, env) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(env),
    Buffer.from(iv, 'base64url')
  );

  decipher.setAuthTag(Buffer.from(auth_tag, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(senha_cifrada, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

async function withClient(connectionString, handler) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    return await handler(client);
  } finally {
    await client.end();
  }
}

export async function lerCredencialSiscoreDoBanco({ connectionString, usuario, env }) {
  const usuarioChave = normalizarUsuarioSiscore(usuario);
  if (!connectionString || !usuarioChave) {
    return null;
  }

  return withClient(connectionString, async (client) => {
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

    const credencial = result.rows[0];

    return {
      usuario: credencial.siscore_usuario,
      senha: decryptPassword(credencial, env),
      ultimaValidacaoEm: credencial.ultima_validacao_em,
      ultimoUsoEm: credencial.ultimo_uso_em,
    };
  });
}

export async function registrarUsoCredencialSiscoreNoBanco({ connectionString, usuario }) {
  const usuarioChave = normalizarUsuarioSiscore(usuario);
  if (!connectionString || !usuarioChave) {
    return;
  }

  await withClient(connectionString, async (client) => {
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
