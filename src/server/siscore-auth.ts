import { URL, URLSearchParams } from 'node:url';

export class SiscoreAuthError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status = 401, details: string[] = []) {
    super(message);
    this.name = 'SiscoreAuthError';
    this.status = status;
    this.details = details;
  }
}

function normalizarTexto(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseAtributos(tag: string) {
  const attrs: Record<string, string> = {};
  const regex = /([^\s=/>]+)(?:=(["'])(.*?)\2|=([^\s>]+))?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(tag)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[3] ?? match[4] ?? '';

    if (key) {
      attrs[key] = value;
    }
  }

  return attrs;
}

function extrairFormularioLogin(html: string, baseUrl: string) {
  const formMatch = html.match(/<form\b[^>]*action=(["'])(.*?)\1[^>]*>/i) ?? html.match(/<form\b[^>]*>/i);

  if (!formMatch) {
    throw new SiscoreAuthError('Formulario de login do SISCORE nao encontrado.', 500, [
      'Etapa: leitura da pagina inicial.',
      'O SISCORE respondeu, mas a estrutura esperada de login nao apareceu.',
    ]);
  }

  const formTag = formMatch[0];
  const formAttrs = parseAtributos(formTag);
  const action = new URL(formAttrs.action || '/', baseUrl).toString();

  const inputTags = [...html.matchAll(/<input\b[^>]*>/gi)];
  const inputs = inputTags.map((match) => parseAtributos(match[0]));

  return { action, inputs };
}

function encontrarCampo(
  inputs: Array<Record<string, string>>,
  pistas: string[],
  tipoEsperado?: string
) {
  for (const input of inputs) {
    const alvo = `${input.name ?? ''} ${input.id ?? ''} ${input.placeholder ?? ''}`.toLowerCase();
    const tipo = (input.type ?? '').toLowerCase();

    if (tipoEsperado && tipo !== tipoEsperado) {
      continue;
    }

    if (pistas.some((pista) => alvo.includes(pista))) {
      return input.name;
    }
  }

  return null;
}

function mergeCookies(cookieJar: Map<string, string>, response: Response) {
  const withGetSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof withGetSetCookie.getSetCookie === 'function'
    ? withGetSetCookie.getSetCookie()
    : response.headers.get('set-cookie')
      ? [response.headers.get('set-cookie') as string]
      : [];

  for (const item of setCookies) {
    const firstPart = item.split(';')[0];
    const separatorIndex = firstPart.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();
    cookieJar.set(key, value);
  }
}

function cookieHeader(cookieJar: Map<string, string>) {
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

function limparValorUrlExportacao(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  let normalized = String(value).trim();
  const hrefMatch = normalized.match(/^href=(["'])(.*?)\1$/i);

  if (hrefMatch) {
    normalized = hrefMatch[2];
  }

  normalized = normalized.replace(/^["']|["']$/g, '');
  normalized = normalized.replace(/&amp;/gi, '&');

  return normalized;
}

function respostaAindaEhLogin(html: string) {
  const possuiCampoSenha = /<input\b[^>]*type=(["'])?password\1?[^>]*>/i.test(html);
  const possuiFormulario = /<form\b/i.test(html);
  const normalized = normalizarTexto(html);
  const mencionaLogin =
    normalized.includes('login') || normalized.includes('usuario') || normalized.includes('senha');

  return possuiFormulario && possuiCampoSenha && mencionaLogin;
}

export async function autenticarNoSiscore({
  baseUrl,
  usuario,
  senha,
  validationUrl,
}: {
  baseUrl: string;
  usuario: string;
  senha: string;
  validationUrl?: string;
}) {
  if (!baseUrl) {
    throw new SiscoreAuthError('SISCORE_BASE_URL nao foi configurada no servidor.', 500, [
      'Etapa: configuracao do servidor.',
    ]);
  }

  const cookieJar = new Map<string, string>();

  const loginPage = await fetch(baseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!loginPage.ok) {
    throw new SiscoreAuthError(`Falha ao abrir o login do SISCORE. HTTP ${loginPage.status}.`, 502, [
      'Etapa: abertura da pagina de login.',
      `HTTP recebido: ${loginPage.status}.`,
    ]);
  }

  mergeCookies(cookieJar, loginPage);

  const html = await loginPage.text();
  const { action, inputs } = extrairFormularioLogin(html, baseUrl);

  const campoUsuario = encontrarCampo(inputs, ['usuario', 'user', 'login']);
  const campoSenha =
    encontrarCampo(inputs, ['senha', 'password', 'pass'], 'password') ??
    encontrarCampo(inputs, ['senha', 'password', 'pass']);

  if (!campoUsuario || !campoSenha) {
    throw new SiscoreAuthError('Nao foi possivel identificar os campos de autenticacao do SISCORE.', 500, [
      'Etapa: leitura do formulario.',
      `Campo usuario localizado: ${campoUsuario ? 'sim' : 'nao'}.`,
      `Campo senha localizado: ${campoSenha ? 'sim' : 'nao'}.`,
    ]);
  }

  const payload = new URLSearchParams();

  for (const input of inputs) {
    const name = input.name;
    const type = (input.type ?? '').toLowerCase();

    if (!name) {
      continue;
    }

    if (type === 'hidden') {
      payload.set(name, input.value ?? '');
    }
  }

  payload.set(campoUsuario, usuario);
  payload.set(campoSenha, senha);

  const loginResponse = await fetch(action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      Cookie: cookieHeader(cookieJar),
    },
    body: payload.toString(),
    redirect: 'manual',
  });

  mergeCookies(cookieJar, loginResponse);

  if (loginResponse.status >= 400) {
    throw new SiscoreAuthError('O SISCORE rejeitou a tentativa de login.', 401, [
      'Etapa: envio do formulario de autenticacao.',
      `HTTP recebido no POST: ${loginResponse.status}.`,
      'Verifique se o usuario e a senha estao corretos e sem espacos extras.',
    ]);
  }

  const normalizedValidationUrl = limparValorUrlExportacao(validationUrl);
  const verificationTarget = normalizedValidationUrl
    ? new URL(normalizedValidationUrl, baseUrl).toString()
    : baseUrl;

  const verifyResponse = await fetch(verificationTarget, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Cookie: cookieHeader(cookieJar),
    },
  });

  if (!verifyResponse.ok) {
    throw new SiscoreAuthError(`Falha ao validar a sessao do SISCORE. HTTP ${verifyResponse.status}.`, 502, [
      'Etapa: validacao da sessao apos o login.',
      `URL validada: ${verificationTarget}.`,
      `HTTP recebido na verificacao: ${verifyResponse.status}.`,
    ]);
  }

  const contentType = verifyResponse.headers.get('content-type') ?? '';

  if (/excel|spreadsheetml|octet-stream/i.test(contentType)) {
    return { usuario: usuario.trim() };
  }

  const verifyHtml = await verifyResponse.text();

  if (respostaAindaEhLogin(verifyHtml)) {
    throw new SiscoreAuthError('O SISCORE retornou novamente para a tela de login.', 401, [
      'Etapa: validacao final da sessao.',
      `URL validada: ${verificationTarget}.`,
      `HTTP do POST de login: ${loginResponse.status}.`,
      `Cookies de sessao recebidos: ${cookieJar.size}.`,
      'Isso normalmente indica usuario ou senha invalidos, sessao recusada ou mudanca no fluxo do portal.',
    ]);
  }

  return { usuario: usuario.trim() };
}
