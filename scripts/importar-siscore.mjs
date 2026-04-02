import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';

import pg from 'pg';
import xlsx from 'xlsx';

import {
  lerCredencialSiscoreDoBanco,
  registrarUsoCredencialSiscoreNoBanco,
} from './shared/siscore-db-credentials.mjs';

const { Client } = pg;

const COLUNAS_OBRIGATORIAS_ESTOQUE = [
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

const COLUNAS_OBRIGATORIAS_NOTAS_FISCAIS = [
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
];

const URL_EXPORTACAO_NOTAS_FISCAIS_PADRAO = '/export_notasfiscais?unidade=';

function carregarEnv(filePath) {
  const env = { ...process.env };

  if (!fs.existsSync(filePath)) {
    return env;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function normalizarUsuarioSiscore(usuario) {
  return String(usuario ?? '').trim();
}

function normalizarTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarTextoLivre(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizarTextoChave(value) {
  return normalizarTextoLivre(value).toUpperCase();
}

function normalizarCabecalho(value) {
  return normalizarTexto(value).replace(/\s+/g, '_');
}

function textoParaNumero(value) {
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

function serialExcelParaData(value) {
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

function valorEhNaoLocalizado(value) {
  const normalized = normalizarTexto(value);
  return !normalized || normalized === 'nao_localizado' || normalized === 'nao localizado';
}

function obterDataHojeBrasil() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
}

function obterNomeArquivoDaResposta(response, fallback = 'siscore.xlsx') {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
  if (!match) {
    return fallback;
  }

  return decodeURIComponent(match[1].replace(/"/g, '').trim());
}

function limparValorUrlExportacao(value) {
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

function obterConfiguracoesExportacao(env) {
  return CATEGORIAS_IMPORTACAO
    .map((config) => ({
      ...config,
      exportacaoUrl: limparValorUrlExportacao(env[config.envKey]),
    }))
    .filter((config) => config.exportacaoUrl);
}

function obterConfiguracaoNotasFiscais(env) {
  return {
    descricao: 'NOTAS FISCAIS HMSA',
    exportacaoUrl:
      limparValorUrlExportacao(env.SISCORE_EXPORTACAO_URL_NOTAS_FISCAIS) ||
      URL_EXPORTACAO_NOTAS_FISCAIS_PADRAO,
  };
}

function parseAtributos(tag) {
  const attrs = {};
  const regex = /([^\s=/>]+)(?:=(["'])(.*?)\2|=([^\s>]+))?/g;
  let match;

  while ((match = regex.exec(tag)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[3] ?? match[4] ?? '';
    if (key) {
      attrs[key] = value;
    }
  }

  return attrs;
}

function extrairFormularioLogin(html, baseUrl) {
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

function encontrarCampo(inputs, pistas, tipoEsperado) {
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

function mergeCookies(cookieJar, response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
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

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function autenticarSiscore({ baseUrl, usuario, senha }) {
  const cookieJar = new Map();

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
  const campoSenha = encontrarCampo(inputs, ['senha', 'password', 'pass'], 'password')
    ?? encontrarCampo(inputs, ['senha', 'password', 'pass'], null);

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

async function baixarPlanilhaSiscore({ baseUrl, exportacaoUrl, cookieJar }) {
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

function lerLinhasDaPlanilha(buffer, colunasObrigatorias) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Nenhuma aba encontrada no arquivo Excel do SISCORE.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  if (!rawRows.length) {
    throw new Error('A planilha do SISCORE veio vazia.');
  }

  const normalizedRows = rawRows.map((row) => {
    const nextRow = {};
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

function chunk(array, size = 500) {
  const output = [];
  for (let index = 0; index < array.length; index += size) {
    output.push(array.slice(index, index + size));
  }
  return output;
}

function normalizarLinhasEstoque(rows, categoriaMaterial) {
  const normalized = rows.map((row) => {
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
      nome_produto_referencia: codigoProdutoReferencia ? String(row.ds_pro_fat ?? '').trim() || null : null,
      unidade_medida_referencia: codigoProdutoReferencia ? String(row.ds_pro_fat_unidade ?? '').trim() || null : null,
      codigo_unidade: String(row.unidade ?? '').trim(),
      nome_unidade: String(row.unidade ?? '').trim(),
      suficiencia_em_dias: textoParaNumero(row.suficiencia_em_dias),
      data_ultima_entrada: serialExcelParaData(row.dt_ultima_entrada),
      valor_custo_medio: textoParaNumero(row.valor_custo_medio),
      consumo_medio: textoParaNumero(row.cmm_mv),
      estoque_atual: textoParaNumero(row.eat),
      especie_padrao: codigoProdutoReferencia ? String(row.especie_padrao ?? '').trim() || null : null,
    };
  }).filter((row) => row.codigo_produto && row.codigo_unidade);

  const quantidadeReferenciasValidas = normalized.filter((row) => row.codigo_produto_referencia).length;
  if (quantidadeReferenciasValidas === 0) {
    throw new Error(`A importacao foi abortada para ${categoriaMaterial}: nenhum cd_pro_fat valido foi encontrado na planilha.`);
  }

  return normalized;
}

async function inserirLoteEstoque(client, { nomeArquivo, categoriaMaterial, exportacaoUrl }) {
  const result = await client.query(
    `
      insert into almox.lote_importacao (
        sistema_origem,
        nome_arquivo_origem,
        data_referencia,
        categoria_material,
        status,
        quantidade_linhas,
        metadados
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      returning id
    `,
    [
      'siscore',
      nomeArquivo,
      obterDataHojeBrasil(),
      categoriaMaterial,
      'processando',
      0,
      JSON.stringify({ exportacao_url: exportacaoUrl }),
    ]
  );

  return result.rows[0].id;
}

async function marcarLoteEstoqueFalha(client, loteId, errorMessage) {
  await client.query(
    `
      update almox.lote_importacao
      set status = 'falha',
          processado_em = now(),
          observacoes = left($2, 2000)
      where id = $1
    `,
    [loteId, errorMessage]
  );
}

async function finalizarLoteEstoque(client, loteId, quantidadeLinhas) {
  await client.query(
    `
      update almox.lote_importacao
      set status = 'processado',
          processado_em = now(),
          quantidade_linhas = $2
      where id = $1
    `,
    [loteId, quantidadeLinhas]
  );
}

async function upsertUnidades(client, rows) {
  const unidades = [...new Map(
    rows.map((row) => [row.codigo_unidade, { codigo_unidade: row.codigo_unidade, nome_unidade: row.nome_unidade }])
  ).values()];

  const unidadeMap = new Map();

  for (const batch of chunk(unidades)) {
    const values = [];
    const placeholders = batch.map((item, index) => {
      const base = index * 2;
      values.push(item.codigo_unidade, item.nome_unidade);
      return `($${base + 1}, $${base + 2})`;
    }).join(', ');

    const result = await client.query(
      `
        insert into almox.unidade (codigo_unidade, nome_unidade)
        values ${placeholders}
        on conflict (codigo_unidade) do update
          set nome_unidade = excluded.nome_unidade,
              atualizado_em = now()
        returning id, codigo_unidade
      `,
      values
    );

    for (const row of result.rows) {
      unidadeMap.set(row.codigo_unidade, row.id);
    }
  }

  return unidadeMap;
}

async function upsertProdutosReferencia(client, rows) {
  const produtosReferencia = [...new Map(
    rows
      .filter((row) => row.codigo_produto_referencia)
      .map((row) => [
        `${row.categoria_material}::${row.codigo_produto_referencia}`,
        {
          categoria_material: row.categoria_material,
          codigo_produto_referencia: row.codigo_produto_referencia,
          nome_produto_referencia: row.nome_produto_referencia,
          unidade_medida_referencia: row.unidade_medida_referencia,
          especie_padrao: row.especie_padrao,
        },
      ])
  ).values()];

  const referenciaMap = new Map();

  for (const batch of chunk(produtosReferencia)) {
    const values = [];
    const placeholders = batch.map((item, index) => {
      const base = index * 5;
      values.push(
        item.categoria_material,
        item.codigo_produto_referencia,
        item.nome_produto_referencia,
        item.unidade_medida_referencia,
        item.especie_padrao
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    }).join(', ');

    const result = await client.query(
      `
        insert into almox.produto_referencia (
          categoria_material,
          codigo_produto_referencia,
          nome_produto_referencia,
          unidade_medida_referencia,
          especie_padrao
        )
        values ${placeholders}
        on conflict (categoria_material, codigo_produto_referencia) do update
          set nome_produto_referencia = excluded.nome_produto_referencia,
              unidade_medida_referencia = excluded.unidade_medida_referencia,
              especie_padrao = excluded.especie_padrao,
              atualizado_em = now()
        returning id, categoria_material, codigo_produto_referencia
      `,
      values
    );

    for (const row of result.rows) {
      referenciaMap.set(`${row.categoria_material}::${row.codigo_produto_referencia}`, row.id);
    }
  }

  return referenciaMap;
}

async function upsertProdutosUnidade(client, rows, unidadeMap, referenciaMap) {
  const produtosUnidade = [...new Map(
    rows.map((row) => {
      const unidadeId = unidadeMap.get(row.codigo_unidade);
      const referenciaId = row.codigo_produto_referencia
        ? referenciaMap.get(`${row.categoria_material}::${row.codigo_produto_referencia}`) ?? null
        : null;

      return [
        `${row.categoria_material}::${unidadeId}::${row.codigo_produto}`,
        {
          categoria_material: row.categoria_material,
          unidade_id: unidadeId,
          produto_referencia_id: referenciaId,
          codigo_produto: row.codigo_produto,
          nome_produto: row.nome_produto,
          unidade_medida_produto: row.unidade_medida_produto,
        },
      ];
    })
  ).values()];

  const produtoUnidadeMap = new Map();

  for (const batch of chunk(produtosUnidade)) {
    const values = [];
    const placeholders = batch.map((item, index) => {
      const base = index * 6;
      values.push(
        item.categoria_material,
        item.unidade_id,
        item.produto_referencia_id,
        item.codigo_produto,
        item.nome_produto,
        item.unidade_medida_produto
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');

    const result = await client.query(
      `
        insert into almox.produto_unidade (
          categoria_material,
          unidade_id,
          produto_referencia_id,
          codigo_produto,
          nome_produto,
          unidade_medida_produto
        )
        values ${placeholders}
        on conflict (categoria_material, unidade_id, codigo_produto) do update
          set produto_referencia_id = excluded.produto_referencia_id,
              nome_produto = excluded.nome_produto,
              unidade_medida_produto = excluded.unidade_medida_produto,
              atualizado_em = now()
        returning id, categoria_material, unidade_id, codigo_produto
      `,
      values
    );

    for (const row of result.rows) {
      produtoUnidadeMap.set(`${row.categoria_material}::${row.unidade_id}::${row.codigo_produto}`, row.id);
    }
  }

  return produtoUnidadeMap;
}

async function inserirEstoqueImportado(client, loteId, rows, unidadeMap, produtoUnidadeMap) {
  for (const batch of chunk(rows, 400)) {
    const values = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 7;
      const unidadeId = unidadeMap.get(row.codigo_unidade);
      const produtoUnidadeId = produtoUnidadeMap.get(`${row.categoria_material}::${unidadeId}::${row.codigo_produto}`);

      values.push(
        loteId,
        produtoUnidadeId,
        row.suficiencia_em_dias,
        row.data_ultima_entrada,
        row.valor_custo_medio,
        row.consumo_medio,
        row.estoque_atual
      );

      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    }).join(', ');

    await client.query(
      `
        insert into almox.estoque_importado (
          lote_importacao_id,
          produto_unidade_id,
          suficiencia_em_dias,
          data_ultima_entrada,
          valor_custo_medio,
          consumo_medio,
          estoque_atual
        )
        values ${placeholders}
      `,
      values
    );
  }
}

async function persistirEstoque({ connectionString, rows, nomeArquivo, categoriaMaterial, exportacaoUrl }) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const loteId = await inserirLoteEstoque(client, { nomeArquivo, categoriaMaterial, exportacaoUrl });

  try {
    await client.query('begin');

    const unidadeMap = await upsertUnidades(client, rows);
    const referenciaMap = await upsertProdutosReferencia(client, rows);
    const produtoUnidadeMap = await upsertProdutosUnidade(client, rows, unidadeMap, referenciaMap);
    await inserirEstoqueImportado(client, loteId, rows, unidadeMap, produtoUnidadeMap);

    await finalizarLoteEstoque(client, loteId, rows.length);
    await client.query('commit');

    return loteId;
  } catch (error) {
    await client.query('rollback');
    await marcarLoteEstoqueFalha(client, loteId, error.message);
    throw error;
  } finally {
    await client.end();
  }
}

function unidadeEhHmsa(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'HMSA' || normalized === 'HMSASOUL';
}

function hashConteudo(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizarLinhasNotasFiscais(rows) {
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
      (row) =>
        unidadeEhHmsa(row.unidade_origem_siscore) &&
        row.nome_fornecedor &&
        row.fornecedor_chave &&
        row.data_entrada &&
        row.numero_documento &&
        row.codigo_produto
    );
}

function agruparNotasFiscais(rows) {
  const groups = new Map();

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
    const codeCount = new Map();
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

async function inserirLoteNotasFiscais(client, { nomeArquivo, exportacaoUrl }) {
  const result = await client.query(
    `
      insert into almox.lote_importacao_notas_fiscais (
        sistema_origem,
        nome_arquivo_origem,
        data_referencia,
        status,
        quantidade_linhas,
        quantidade_notas,
        quantidade_notas_com_item_duplicado,
        metadados
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      returning id
    `,
    [
      'siscore',
      nomeArquivo,
      obterDataHojeBrasil(),
      'processando',
      0,
      0,
      0,
      JSON.stringify({ exportacao_url: exportacaoUrl }),
    ]
  );

  return result.rows[0].id;
}

async function marcarLoteNotasFiscaisFalha(client, loteId, errorMessage) {
  await client.query(
    `
      update almox.lote_importacao_notas_fiscais
      set status = 'falha',
          processado_em = now(),
          observacoes = left($2, 2000)
      where id = $1
    `,
    [loteId, errorMessage]
  );
}

async function finalizarLoteNotasFiscais(client, loteId, resumo) {
  await client.query(
    `
      update almox.lote_importacao_notas_fiscais
      set status = 'processado',
          processado_em = now(),
          quantidade_linhas = $2,
          quantidade_notas = $3,
          quantidade_notas_com_item_duplicado = $4,
          metadados = coalesce(metadados, '{}'::jsonb) || $5::jsonb
      where id = $1
    `,
    [
      loteId,
      resumo.quantidade_linhas,
      resumo.quantidade_notas,
      resumo.quantidade_notas_com_item_duplicado,
      JSON.stringify({
        notas_ativas: resumo.notas_ativas,
        notas_alteradas: resumo.notas_alteradas,
        notas_reativadas: resumo.notas_reativadas,
        notas_removidas_no_siscore: resumo.notas_removidas_no_siscore,
      }),
    ]
  );
}

async function resolverUnidadeHmsa(client, notas) {
  const unidadeExistente = await client.query(
    `
      select id, codigo_unidade, nome_unidade
      from almox.unidade
      where upper(codigo_unidade) in ('HMSA', 'HMSASOUL')
      order by case when upper(codigo_unidade) = 'HMSASOUL' then 0 else 1 end
      limit 1
    `
  );

  if (unidadeExistente.rowCount) {
    return unidadeExistente.rows[0];
  }

  const codigoUnidade = notas[0]?.unidade_origem_siscore || 'HMSASOUL';
  const result = await client.query(
    `
      insert into almox.unidade (codigo_unidade, nome_unidade)
      values ($1, $2)
      returning id, codigo_unidade, nome_unidade
    `,
    [codigoUnidade, codigoUnidade]
  );

  return result.rows[0];
}

async function carregarMapaProdutoUnidadeHmsa(client, unidadeId) {
  const result = await client.query(
    `
      select id, codigo_produto
      from almox.produto_unidade
      where unidade_id = $1
    `,
    [unidadeId]
  );

  const contagem = new Map();
  for (const row of result.rows) {
    contagem.set(row.codigo_produto, (contagem.get(row.codigo_produto) ?? 0) + 1);
  }

  const produtoUnidadeMap = new Map();
  for (const row of result.rows) {
    if ((contagem.get(row.codigo_produto) ?? 0) === 1) {
      produtoUnidadeMap.set(row.codigo_produto, row.id);
    }
  }

  return produtoUnidadeMap;
}

function chaveNotaFiscal({ fornecedor_chave, numero_documento, data_entrada }) {
  const dataNormalizada = serialExcelParaData(data_entrada) ?? normalizarTextoLivre(data_entrada);
  return `${fornecedor_chave}::${numero_documento}::${dataNormalizada}`;
}

async function carregarNotasFiscaisExistentes(client, unidadeId) {
  const result = await client.query(
    `
      select
        id,
        fornecedor_chave,
        numero_documento,
        data_entrada,
        status_sincronizacao,
        status_conferencia,
        hash_conteudo
      from almox.nota_fiscal
      where unidade_id = $1
    `,
    [unidadeId]
  );

  const notas = new Map();
  for (const row of result.rows) {
    const key = chaveNotaFiscal(row);
    notas.set(key, {
      id: row.id,
      fornecedor_chave: row.fornecedor_chave,
      numero_documento: row.numero_documento,
      data_entrada: row.data_entrada,
      status_sincronizacao: row.status_sincronizacao,
      status_conferencia: row.status_conferencia,
      hash_conteudo: row.hash_conteudo,
    });
  }

  return notas;
}

async function upsertNotaFiscal(client, { loteId, unidadeId, nota, notaExistente }) {
  let statusSincronizacao = 'ativo';

  if (notaExistente) {
    if (notaExistente.status_sincronizacao === 'removido_no_siscore') {
      statusSincronizacao = 'reativado';
    } else if (
      notaExistente.hash_conteudo !== nota.hash_conteudo ||
      notaExistente.status_conferencia !== nota.status_conferencia
    ) {
      statusSincronizacao = 'alterado';
    }
  }

  const result = await client.query(
    `
      insert into almox.nota_fiscal (
        lote_importacao_atual_id,
        unidade_id,
        unidade_origem_siscore,
        fornecedor_chave,
        nome_fornecedor,
        numero_documento,
        data_entrada,
        status_sincronizacao,
        status_conferencia,
        possui_item_duplicado,
        hash_conteudo,
        ultima_vez_vista_em,
        removida_em
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), null)
      on conflict (unidade_id, fornecedor_chave, numero_documento, data_entrada) do update
        set lote_importacao_atual_id = excluded.lote_importacao_atual_id,
            unidade_origem_siscore = excluded.unidade_origem_siscore,
            nome_fornecedor = excluded.nome_fornecedor,
            status_sincronizacao = excluded.status_sincronizacao,
            status_conferencia = excluded.status_conferencia,
            possui_item_duplicado = excluded.possui_item_duplicado,
            hash_conteudo = excluded.hash_conteudo,
            ultima_vez_vista_em = now(),
            removida_em = null,
            atualizado_em = now()
      returning id
    `,
    [
      loteId,
      unidadeId,
      nota.unidade_origem_siscore,
      nota.fornecedor_chave,
      nota.nome_fornecedor,
      nota.numero_documento,
      nota.data_entrada,
      statusSincronizacao,
      nota.status_conferencia,
      nota.possui_item_duplicado,
      nota.hash_conteudo,
    ]
  );

  return { id: result.rows[0].id, statusSincronizacao };
}

async function substituirItensNotaFiscal(client, notaFiscalId, items, produtoUnidadeMap) {
  await client.query(
    `
      delete from almox.nota_fiscal_item
      where nota_fiscal_id = $1
    `,
    [notaFiscalId]
  );

  for (const batch of chunk(items, 300)) {
    const values = [];
    const placeholders = batch.map((item, index) => {
      const base = index * 12;
      const produtoUnidadeId = produtoUnidadeMap.get(item.codigo_produto) ?? null;

      values.push(
        notaFiscalId,
        item.sequencia_item,
        item.linha_origem,
        item.codigo_produto,
        item.descricao_produto,
        item.quantidade_entrada,
        item.valor_unitario,
        item.valor_total,
        item.descricao_especie,
        produtoUnidadeId,
        item.duplicado_na_nota,
        item.hash_item
      );

      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
    }).join(', ');

    await client.query(
      `
        insert into almox.nota_fiscal_item (
          nota_fiscal_id,
          sequencia_item,
          linha_origem,
          codigo_produto,
          descricao_produto,
          quantidade_entrada,
          valor_unitario,
          valor_total,
          descricao_especie,
          produto_unidade_id,
          duplicado_na_nota,
          hash_item
        )
        values ${placeholders}
      `,
      values
    );
  }
}

async function marcarNotasFiscaisRemovidas(client, { loteId, noteIds }) {
  if (!noteIds.length) {
    return 0;
  }

  const values = [];
  const placeholders = noteIds.map((noteId, index) => {
    values.push(noteId);
    return `$${index + 2}`;
  });

  const result = await client.query(
    `
      update almox.nota_fiscal
      set status_sincronizacao = 'removido_no_siscore',
          removida_em = now(),
          lote_importacao_atual_id = $1,
          atualizado_em = now()
      where id in (${placeholders.join(', ')})
        and status_sincronizacao <> 'removido_no_siscore'
      returning id
    `,
    [loteId, ...values]
  );

  return result.rowCount ?? 0;
}

async function persistirNotasFiscais({ connectionString, notasFiscais, nomeArquivo, exportacaoUrl }) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const loteId = await inserirLoteNotasFiscais(client, { nomeArquivo, exportacaoUrl });

  try {
    await client.query('begin');

    const unidade = await resolverUnidadeHmsa(client, notasFiscais);
    const produtoUnidadeMap = await carregarMapaProdutoUnidadeHmsa(client, unidade.id);
    const notasExistentes = await carregarNotasFiscaisExistentes(client, unidade.id);
    const chavesAtuais = new Set();

    let notasAtivas = 0;
    let notasAlteradas = 0;
    let notasReativadas = 0;
    let notasComItemDuplicado = 0;

    for (const nota of notasFiscais) {
      const key = chaveNotaFiscal(nota);
      chavesAtuais.add(key);

      const notaExistente = notasExistentes.get(key);
      const { id: notaFiscalId, statusSincronizacao } = await upsertNotaFiscal(client, {
        loteId,
        unidadeId: unidade.id,
        nota,
        notaExistente,
      });

      await substituirItensNotaFiscal(client, notaFiscalId, nota.items, produtoUnidadeMap);

      if (statusSincronizacao === 'alterado') {
        notasAlteradas += 1;
      } else if (statusSincronizacao === 'reativado') {
        notasReativadas += 1;
      } else {
        notasAtivas += 1;
      }

      if (nota.possui_item_duplicado) {
        notasComItemDuplicado += 1;
      }
    }

    const notasRemovidas = [...notasExistentes.entries()]
      .filter(([key]) => !chavesAtuais.has(key))
      .map(([, note]) => note.id);

    const quantidadeNotasRemovidas = await marcarNotasFiscaisRemovidas(client, {
      loteId,
      noteIds: notasRemovidas,
    });

    await finalizarLoteNotasFiscais(client, loteId, {
      quantidade_linhas: notasFiscais.reduce((total, nota) => total + nota.items.length, 0),
      quantidade_notas: notasFiscais.length,
      quantidade_notas_com_item_duplicado: notasComItemDuplicado,
      notas_ativas: notasAtivas,
      notas_alteradas: notasAlteradas,
      notas_reativadas: notasReativadas,
      notas_removidas_no_siscore: quantidadeNotasRemovidas,
    });

    await client.query('commit');

    return {
      loteId,
      quantidadeNotas: notasFiscais.length,
      quantidadeLinhas: notasFiscais.reduce((total, nota) => total + nota.items.length, 0),
      quantidadeNotasComItemDuplicado: notasComItemDuplicado,
      quantidadeNotasRemovidas,
    };
  } catch (error) {
    await client.query('rollback');
    await marcarLoteNotasFiscaisFalha(client, loteId, error.message);
    throw error;
  } finally {
    await client.end();
  }
}

export async function runSiscoreImport(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const env = {
    ...carregarEnv(path.join(rootDir, '.env.local')),
    ...(options.envOverrides ?? {}),
  };
  const connectionString = env.SUPABASE_DB_URL;
  const siscoreBaseUrl = env.SISCORE_BASE_URL;
  const usuarioDaSessao = normalizarUsuarioSiscore(options.usuarioSessao);
  const usuarioConfigurado =
    normalizarUsuarioSiscore(env.SISCORE_CREDENTIALS_USUARIO) ||
    normalizarUsuarioSiscore(env.SISCORE_USUARIO) ||
    usuarioDaSessao;
  let siscoreUsuario = usuarioConfigurado;
  let siscoreSenha = String(env.SISCORE_SENHA ?? '').trim();
  const configuracoesExportacao = obterConfiguracoesExportacao(env);
  const configuracaoNotasFiscais = obterConfiguracaoNotasFiscais(env);

  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL nao foi definida em .env.local.');
  }

  if (siscoreUsuario && !siscoreSenha) {
    const credencialNoBanco = await lerCredencialSiscoreDoBanco({
      connectionString,
      usuario: siscoreUsuario,
      env,
    });

    if (credencialNoBanco) {
      siscoreUsuario = credencialNoBanco.usuario;
      siscoreSenha = credencialNoBanco.senha;
    }
  }

  if (!siscoreBaseUrl || !siscoreUsuario || !siscoreSenha || configuracoesExportacao.length === 0) {
    throw new Error(
      'Preencha SISCORE_BASE_URL e ao menos uma URL de exportacao do SISCORE em .env.local. Para autenticar a importacao, use SISCORE_USUARIO/SISCORE_SENHA ou uma credencial cifrada salva no banco para o usuario informado.'
    );
  }

  console.log('Autenticando no SISCORE...');
  const cookieJar = await autenticarSiscore({
    baseUrl: siscoreBaseUrl,
    usuario: siscoreUsuario,
    senha: siscoreSenha,
  });
  await registrarUsoCredencialSiscoreNoBanco({
    connectionString,
    usuario: siscoreUsuario,
  });

  const sucessos = [];
  const falhas = [];

  for (const configuracao of configuracoesExportacao) {
    try {
      console.log(`Baixando planilha do SISCORE para ${configuracao.descricao}...`);
      const { buffer, nomeArquivo } = await baixarPlanilhaSiscore({
        baseUrl: siscoreBaseUrl,
        exportacaoUrl: configuracao.exportacaoUrl,
        cookieJar,
      });

      console.log(`Lendo e validando planilha de ${configuracao.descricao}...`);
      const rawRows = lerLinhasDaPlanilha(buffer, COLUNAS_OBRIGATORIAS_ESTOQUE);
      const rows = normalizarLinhasEstoque(rawRows, configuracao.categoria_material);

      console.log(`Persistindo ${rows.length} linha(s) de ${configuracao.descricao} no Supabase...`);
      const loteId = await persistirEstoque({
        connectionString,
        rows,
        nomeArquivo,
        categoriaMaterial: configuracao.categoria_material,
        exportacaoUrl: configuracao.exportacaoUrl,
      });

      sucessos.push({ categoria: configuracao.descricao, loteId, quantidade: rows.length });
      console.log(`Importacao concluida com sucesso para ${configuracao.descricao}. Lote: ${loteId}`);
    } catch (error) {
      falhas.push({
        categoria: configuracao.descricao,
        message: error.message,
      });
      console.error(`Falha ao importar ${configuracao.descricao}: ${error.message}`);
    }
  }

  try {
    console.log('Baixando planilha do SISCORE para NOTAS FISCAIS HMSA...');
    const { buffer, nomeArquivo } = await baixarPlanilhaSiscore({
      baseUrl: siscoreBaseUrl,
      exportacaoUrl: configuracaoNotasFiscais.exportacaoUrl,
      cookieJar,
    });

    console.log('Lendo e validando planilha de NOTAS FISCAIS HMSA...');
    const rawRows = lerLinhasDaPlanilha(buffer, COLUNAS_OBRIGATORIAS_NOTAS_FISCAIS);
    const rows = normalizarLinhasNotasFiscais(rawRows);
    const notasFiscais = agruparNotasFiscais(rows);

    console.log(`Persistindo ${notasFiscais.length} nota(s) fiscais do HMSA no Supabase...`);
    const resumo = await persistirNotasFiscais({
      connectionString,
      notasFiscais,
      nomeArquivo,
      exportacaoUrl: configuracaoNotasFiscais.exportacaoUrl,
    });

    sucessos.push({
      categoria: configuracaoNotasFiscais.descricao,
      loteId: resumo.loteId,
      quantidade: resumo.quantidadeLinhas,
    });
    console.log(`Importacao concluida com sucesso para NOTAS FISCAIS HMSA. Lote: ${resumo.loteId}`);
  } catch (error) {
    falhas.push({
      categoria: configuracaoNotasFiscais.descricao,
      message: error.message,
    });
    console.error(`Falha ao importar ${configuracaoNotasFiscais.descricao}: ${error.message}`);
  }

  if (sucessos.length) {
    console.log('Resumo das importacoes concluidas:');
    for (const sucesso of sucessos) {
      console.log(`- ${sucesso.categoria}: ${sucesso.quantidade} linha(s), lote ${sucesso.loteId}`);
    }
  }

  if (falhas.length) {
    throw new Error(
      `Algumas importacoes falharam: ${falhas.map((falha) => `${falha.categoria} (${falha.message})`).join('; ')}`
    );
  }

  return {
    usuario: siscoreUsuario,
    sucessos,
    falhas,
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (currentFilePath === executedFilePath) {
  runSiscoreImport().catch((error) => {
    console.error('Falha na importacao do SISCORE.');
    console.error(error.message);
    process.exit(1);
  });
}
