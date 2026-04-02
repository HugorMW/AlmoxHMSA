import crypto from 'node:crypto';

const COOKIE_NAME = 'almox_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  usuario: string;
  exp: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret() {
  return (
    process.env.APP_SESSION_SECRET ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_PROJECT_REF ||
    'almox-dev-session-secret'
  );
}

function sign(value: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function parseCookieHeader(cookieHeaderValue: string | null) {
  const cookies = new Map<string, string>();

  for (const part of String(cookieHeaderValue ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookies.set(key, value);
  }

  return cookies;
}

function shouldUseSecureCookie(requestUrl: string) {
  try {
    return new URL(requestUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

export function criarSessionToken(usuario: string) {
  const payload: SessionPayload = {
    usuario,
    exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function lerSessaoDoRequest(request: Request) {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const token = cookies.get(COOKIE_NAME);

  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

    if (!payload?.usuario || !payload?.exp || payload.exp < Date.now()) {
      return null;
    }

    return { usuario: payload.usuario };
  } catch {
    return null;
  }
}

export function criarHeaderSetCookieDeSessao(token: string, requestUrl: string) {
  const secure = shouldUseSecureCookie(requestUrl) ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`;
}

export function criarHeaderSetCookieExpirado(requestUrl: string) {
  const secure = shouldUseSecureCookie(requestUrl) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
