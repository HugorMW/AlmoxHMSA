import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function getSecret(env) {
  return (
    env.APP_SESSION_SECRET ||
    env.SUPABASE_DB_URL ||
    env.SUPABASE_PROJECT_REF ||
    'almox-dev-session-secret'
  );
}

function getKey(env) {
  return crypto.createHash('sha256').update(getSecret(env)).digest();
}

function decrypt(payload, env) {
  const parsed = JSON.parse(payload);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(env),
    Buffer.from(parsed.iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.content, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function lerCredenciaisSiscoreSalvas(rootDir, env) {
  const filePath = path.join(rootDir, '.local', 'siscore-credentials.enc');

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const encrypted = fs.readFileSync(filePath, 'utf8');
    const decrypted = decrypt(encrypted, env);
    const payload = JSON.parse(decrypted);

    if (!payload?.usuario || !payload?.senha) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
