import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type SiscoreCredentialsPayload = {
  usuario: string;
  senha: string;
  atualizadoEm: string;
};

const SISCORE_CREDENTIALS_FILE = path.join(process.cwd(), '.local', 'siscore-credentials.enc');

function getSecret() {
  return (
    process.env.APP_SESSION_SECRET ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_PROJECT_REF ||
    'almox-dev-session-secret'
  );
}

function getKey() {
  return crypto.createHash('sha256').update(getSecret()).digest();
}

function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64url'),
    authTag: authTag.toString('base64url'),
    content: encrypted.toString('base64url'),
  });
}

function decrypt(payload: string) {
  const parsed = JSON.parse(payload) as { iv: string; authTag: string; content: string };
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(parsed.iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.content, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function salvarCredenciaisSiscore({
  usuario,
  senha,
}: {
  usuario: string;
  senha: string;
}) {
  try {
    const payload: SiscoreCredentialsPayload = {
      usuario: usuario.trim(),
      senha,
      atualizadoEm: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(SISCORE_CREDENTIALS_FILE), { recursive: true });
    fs.writeFileSync(SISCORE_CREDENTIALS_FILE, encrypt(JSON.stringify(payload)), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function lerCredenciaisSiscoreSalvas() {
  if (!fs.existsSync(SISCORE_CREDENTIALS_FILE)) {
    return null;
  }

  try {
    const encrypted = fs.readFileSync(SISCORE_CREDENTIALS_FILE, 'utf8');
    const decrypted = decrypt(encrypted);
    const payload = JSON.parse(decrypted) as SiscoreCredentialsPayload;

    if (!payload?.usuario || !payload?.senha) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
