import crypto from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';

import xlsx from 'xlsx';

const CATEGORIAS_IMPORTACAO = [
  {
    categoria_material: 'material_hospitalar',
    descricao: 'MATERIAL HOSPITALAR',
    envKey: 'SISCORE_EXPORTACAO_URL',
  },
  {
    categoria_material: 'material_farmacologico',
    descricao: 'MATERIAL FARMACOLÓGICO',
    envKey: 'SISCORE_EXPORTACAO_URL_FARMACOLOGICO',
  },
] as const;

const URL_EXPORTACAO_NOTAS_FISCAIS_PADRAO = '/export_notasfiscais?unidade=';

export const COLUNAS_OBRIGATORIAS_ESTOQUE = [
  'cd_produto',
  'ds_produto',
  'ds_unidade',
  'cd_pro_fat',
  'ds_pro_fat',
  'ds_pro_fat_unidade',
  'unidade',
  'suficiencia_em_dias',
  'dt_ultima_entrada',
  'valor_custo_medio',
  'especie_padrao',
  'cmm_mv',
  'eat',
];

export const COLUNAS_OBRIGATORIAS_NOTAS_FISCAIS = [
  'unidade',
  'nm_fornecedor',
  'data_entrada',
  'nr_documento',
  'cd_produto',
  'ds_produto',
  'qt_entrada',
  'vl_unitario',
  'vl_total',
  'ds_especie',
];

type CookieJar = Map<string, string>;
type GenericRow = Record<string, unknown>;
type NotaFiscalLinhaNormalizada = {
  linha_origem: number;
  unidade_origem_siscore: string;
  nome_fornecedor: string;
  fornecedor_chave: string;
  data_entrada: string;
  numero_documento: string;
  codigo_produto: string;
  descricao_produto: string;
  quantidade_entrada: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  descricao_especie: string | null;
};
type NotaFiscalItemAgrupado = {
  linha_origem: number;
  codigo_produto: string;
  descricao_produto: string;
  quantidade_entrada: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  descricao_especie: string | null;
};
type NotaFiscalAgrupada = {
  unidade_origem_siscore: string;
  nome_fornecedor: string;
  fornecedor_chave: string;
  data_entrada: string;
  numero_documento: string;
  items: NotaFiscalItemAgrupado[];
};

function normalizarTexto(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarTextoLivre(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizarTextoChave(value: unknown) {
  return normalizarTextoLivre(value).toUpperCase();
}

function normalizarCabecalho(value: unknown) {
  return normalizarTexto(value).replace(/\s+/g, '_');
}

function textoParaNumero(value: unknown) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function serialExcelParaData(value: unknown) {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) {
    const stringValue = String(value).trim();
    const parts = stringValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (parts) {
      const [, day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }

    const date = new Date(stringValue);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  const epoch = new Date(Date.UTC(1899, 11, 30));
  epoch.setUTCDate(epoch.getUTCDate() + Math.floor(numeric));
  return epoch.toISOString().slice(0, 10);
}

function valorEhNaoLocalizado(value: unknown) {
  const normalized = normalizarTexto(value);
  return !normalized || normalized === 'nao_localizado' || normalized === 'nao localizado';
}

function obterNomeArquivoDaResposta(response: Response, fallback = 'siscore.xlsx') {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
  if (!match) {
    return fallback;
  }

  return decodeURIComponent(match[1].replace(/"/g, '').trim());
}

function limparValorUrlExportacao(value: unknown) {
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

export function obterConfiguracoesExportacao(env: Record<string, string | undefined>) {
  return CATEGORIAS_IMPORTACAO
    .map((config) => ({
      ...config,
      exportacaoUrl: limparValorUrlExportacao(env[config.envKey]),
    }))
    .filter((config) => config.exportacaoUrl);
}

export function obterConfiguracaoNotasFiscais(env: Record<string, string | undefined>) {
  return {
    descricao: 'NOTAS FISCAIS HMSA',
    exportacaoUrl:
      limparValorUrlExportacao(env.SISCORE_EXPORTACAO_URL_NOTAS_FISCAIS) ||
      URL_EXPORTACAO_NOTAS_FISCAIS_PADRAO,
  };
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
    throw new Error('Formulario de login nao encontrado na pagina do SISCORE.');
  }

  const formTag = formMatch[0];
  const formAttrs = parseAtributos(formTag);
  const action = new URL(formAttrs.action || '/', baseUrl).toString();

  const inputTags = [...html.matchAll(/<input\b[^>]*>/gi)];
  const inputs = inputTags.map((match) => parseAtributos(match[0]));

  return { action, inputs };
}

function encontrarCampo(inputs: Array<Record<string, string>>, pistas: string[], tipoEsperado: string | null) {
  for (const input of inputs) {
    const target = `${input.name ?? ''} ${input.id ?? ''} ${input.placeholder ?? ''}`.toLowerCase();
    const type = (input.type ?? '').toLowerCase();
    if (tipoEsperado && type !== tipoEsperado) {
      continue;
    }
    if (pistas.some((hint) => target.includes(hint))) {
      return input.name;
    }
  }

  return null;
}

function mergeCookies(cookieJar: CookieJar, response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookie =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const item of setCookie) {
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

function cookieHeader(cookieJar: CookieJar) {
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

export async function autenticarSiscore({
  baseUrl,
  usuario,
  senha,
}: {
  baseUrl: string;
  usuario: string;
  senha: string;
}) {
  const cookieJar: CookieJar = new Map();

  const loginPage = await fetch(baseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!loginPage.ok) {
    throw new Error(`Falha ao abrir login do SISCORE. HTTP ${loginPage.status}.`);
  }

  mergeCookies(cookieJar, loginPage);

  const html = await loginPage.text();
  const { action, inputs } = extrairFormularioLogin(html, baseUrl);

  const campoUsuario = encontrarCampo(inputs, ['usuario', 'user', 'login'], null);
  const campoSenha =
    encontrarCampo(inputs, ['senha', 'password', 'pass'], 'password') ??
    encontrarCampo(inputs, ['senha', 'password', 'pass'], null);

  if (!campoUsuario || !campoSenha) {
    throw new Error('Nao foi possivel identificar os campos de usuario e senha do SISCORE.');
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
    throw new Error(`Falha no login do SISCORE. HTTP ${loginResponse.status}.`);
  }

  return cookieJar;
}

export async function baixarPlanilhaSiscore({
  baseUrl,
  exportacaoUrl,
  cookieJar,
}: {
  baseUrl: string;
  exportacaoUrl: string;
  cookieJar: CookieJar;
}) {
  const exportUrl = new URL(exportacaoUrl, baseUrl).toString();
  const response = await fetch(exportUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Cookie: cookieHeader(cookieJar),
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar a planilha do SISCORE. HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/excel|spreadsheetml|octet-stream/i.test(contentType)) {
    throw new Error(`Resposta inesperada do SISCORE ao exportar planilha. Content-Type: ${contentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const nomeArquivo = obterNomeArquivoDaResposta(response);

  return { buffer, nomeArquivo };
}

export function lerLinhasDaPlanilha(buffer: Buffer, colunasObrigatorias: string[]) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Nenhuma aba encontrada no arquivo Excel do SISCORE.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: null }) as GenericRow[];

  if (!rawRows.length) {
    throw new Error('A planilha do SISCORE veio vazia.');
  }

  const normalizedRows = rawRows.map((row) => {
    const nextRow: GenericRow = {};
    for (const [key, value] of Object.entries(row)) {
      nextRow[normalizarCabecalho(key)] = value;
    }
    return nextRow;
  });

  const firstRow = normalizedRows[0];
  const missingColumns = colunasObrigatorias.filter((column) => !(column in firstRow));
  if (missingColumns.length) {
    throw new Error(`Colunas obrigatorias ausentes na planilha: ${missingColumns.join(', ')}`);
  }

  return normalizedRows;
}

export function normalizarLinhasEstoque(rows: GenericRow[], categoriaMaterial: string) {
  const normalized = rows
    .map((row) => {
      const codigoProdutoReferenciaBruto = String(row.cd_pro_fat ?? '').trim();
      const codigoProdutoReferencia = valorEhNaoLocalizado(codigoProdutoReferenciaBruto)
        ? null
        : codigoProdutoReferenciaBruto;

      return {
        categoria_material: categoriaMaterial,
        codigo_produto: String(row.cd_produto ?? '').trim(),
        nome_produto: String(row.ds_produto ?? '').trim(),
        unidade_medida_produto: String(row.ds_unidade ?? '').trim() || null,
        codigo_produto_referencia: codigoProdutoReferencia,
        nome_produto_referencia: codigoProdutoReferencia
          ? String(row.ds_pro_fat ?? '').trim() || null
          : null,
        unidade_medida_referencia: codigoProdutoReferencia
          ? String(row.ds_pro_fat_unidade ?? '').trim() || null
          : null,
        codigo_unidade: String(row.unidade ?? '').trim(),
        nome_unidade: String(row.unidade ?? '').trim(),
        suficiencia_em_dias: textoParaNumero(row.suficiencia_em_dias),
        data_ultima_entrada: serialExcelParaData(row.dt_ultima_entrada),
        valor_custo_medio: textoParaNumero(row.valor_custo_medio),
        consumo_medio: textoParaNumero(row.cmm_mv),
        estoque_atual: textoParaNumero(row.eat),
        especie_padrao: codigoProdutoReferencia ? String(row.especie_padrao ?? '').trim() || null : null,
      };
    })
    .filter(
      (row) =>
        row.codigo_produto &&
        row.codigo_unidade &&
        row.codigo_unidade.trim().toUpperCase() !== 'HMSA'
    );

  const quantidadeReferenciasValidas = normalized.filter((row) => row.codigo_produto_referencia).length;
  if (quantidadeReferenciasValidas === 0) {
    throw new Error(
      `A importacao foi abortada para ${categoriaMaterial}: nenhum cd_pro_fat valido foi encontrado na planilha.`
    );
  }

  return normalized;
}

function unidadeEhHmsa(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'HMSASOUL';
}

function hashConteudo(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizarLinhasNotasFiscais(rows: GenericRow[]): NotaFiscalLinhaNormalizada[] {
  return rows
    .map((row, index) => ({
      linha_origem: index + 2,
      unidade_origem_siscore: normalizarTextoLivre(row.unidade),
      nome_fornecedor: normalizarTextoLivre(row.nm_fornecedor),
      fornecedor_chave: normalizarTextoChave(row.nm_fornecedor),
      data_entrada: serialExcelParaData(row.data_entrada),
      numero_documento: normalizarTextoLivre(row.nr_documento),
      codigo_produto: normalizarTextoLivre(row.cd_produto),
      descricao_produto: normalizarTextoLivre(row.ds_produto),
      quantidade_entrada: textoParaNumero(row.qt_entrada),
      valor_unitario: textoParaNumero(row.vl_unitario),
      valor_total: textoParaNumero(row.vl_total),
      descricao_especie: normalizarTextoLivre(row.ds_especie) || null,
    }))
    .filter(
      (row): row is NotaFiscalLinhaNormalizada =>
        Boolean(
          unidadeEhHmsa(row.unidade_origem_siscore) &&
            row.nome_fornecedor &&
            row.fornecedor_chave &&
            row.data_entrada &&
            row.numero_documento &&
            row.codigo_produto
        )
    );
}

export function agruparNotasFiscais(rows: NotaFiscalLinhaNormalizada[]) {
  const groups = new Map<string, NotaFiscalAgrupada>();

  for (const row of rows) {
    const key = `${row.fornecedor_chave}::${row.numero_documento}::${row.data_entrada}`;
    const current = groups.get(key) ?? {
      unidade_origem_siscore: row.unidade_origem_siscore,
      nome_fornecedor: row.nome_fornecedor,
      fornecedor_chave: row.fornecedor_chave,
      data_entrada: row.data_entrada,
      numero_documento: row.numero_documento,
      items: [],
    };

    current.items.push({
      linha_origem: row.linha_origem,
      codigo_produto: row.codigo_produto,
      descricao_produto: row.descricao_produto,
      quantidade_entrada: row.quantidade_entrada,
      valor_unitario: row.valor_unitario,
      valor_total: row.valor_total,
      descricao_especie: row.descricao_especie,
    });

    groups.set(key, current);
  }

  return [...groups.values()].map((note) => {
    const codeCount = new Map<string, number>();
    for (const item of note.items) {
      codeCount.set(item.codigo_produto, (codeCount.get(item.codigo_produto) ?? 0) + 1);
    }

    const items = note.items.map((item, index) => {
      const duplicadoNaNota = (codeCount.get(item.codigo_produto) ?? 0) > 1;
      return {
        ...item,
        sequencia_item: index + 1,
        duplicado_na_nota: duplicadoNaNota,
        hash_item: hashConteudo({
          codigo_produto: item.codigo_produto,
          descricao_produto: item.descricao_produto,
          quantidade_entrada: item.quantidade_entrada,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          descricao_especie: item.descricao_especie,
          duplicado_na_nota: duplicadoNaNota,
        }),
      };
    });

    const possuiItemDuplicado = items.some((item) => item.duplicado_na_nota);
    const statusConferencia = possuiItemDuplicado ? 'nota_com_item_duplicado' : 'ok';

    return {
      ...note,
      items,
      possui_item_duplicado: possuiItemDuplicado,
      status_conferencia: statusConferencia,
      hash_conteudo: hashConteudo({
        unidade_origem_siscore: note.unidade_origem_siscore,
        fornecedor_chave: note.fornecedor_chave,
        numero_documento: note.numero_documento,
        data_entrada: note.data_entrada,
        status_conferencia: statusConferencia,
        items: items.map((item) => ({
          sequencia_item: item.sequencia_item,
          codigo_produto: item.codigo_produto,
          descricao_produto: item.descricao_produto,
          quantidade_entrada: item.quantidade_entrada,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          descricao_especie: item.descricao_especie,
          duplicado_na_nota: item.duplicado_na_nota,
        })),
      }),
    };
  });
}
