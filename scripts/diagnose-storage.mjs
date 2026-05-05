import fs from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de ambiente nao encontrado: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep === -1) continue;
    values[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim();
  }
  return values;
}

function fmtRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]),
  );
}

function printTable(title, rows) {
  console.log(`\n=== ${title} ===`);
  if (!rows || rows.length === 0) {
    console.log('(sem resultados)');
    return;
  }
  console.table(rows.map(fmtRow));
}

async function run(client, label, sql) {
  try {
    const { rows } = await client.query(sql);
    printTable(label, rows);
  } catch (err) {
    console.log(`\n=== ${label} ===`);
    console.log(`ERRO: ${err.message}`);
  }
}

async function main() {
  const env = loadEnvFile(envPath);
  const connectionString = env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL nao encontrado em .env.local');
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado.');

  await run(
    client,
    'Tamanho do banco inteiro',
    `SELECT
       pg_size_pretty(pg_database_size(current_database())) AS db_size_pretty,
       pg_database_size(current_database()) AS db_size_bytes`,
  );

  await run(
    client,
    'Top 25 tabelas (qualquer schema) por tamanho total',
    `SELECT
       n.nspname AS schema,
       c.relname AS tabela,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_size_pretty(pg_relation_size(c.oid))       AS heap,
       pg_size_pretty(pg_indexes_size(c.oid))        AS indices,
       pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)) AS toast,
       pg_total_relation_size(c.oid) AS bytes
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r','m','p')
       AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
     ORDER BY pg_total_relation_size(c.oid) DESC
     LIMIT 25`,
  );

  await run(
    client,
    'Tabelas no schema almox por tamanho',
    `SELECT
       c.relname AS tabela,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid) AS linhas_estimadas
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'almox' AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC`,
  );

  await run(
    client,
    'estoque_diario_snapshot — linhas por data',
    `SELECT data_referencia, COUNT(*)::bigint AS linhas
     FROM almox.estoque_diario_snapshot
     GROUP BY data_referencia
     ORDER BY data_referencia DESC
     LIMIT 30`,
  );

  await run(
    client,
    'estoque_diario_snapshot — totais',
    `SELECT
       COUNT(*)::bigint AS total_linhas,
       MIN(data_referencia) AS data_inicial,
       MAX(data_referencia) AS data_final,
       pg_size_pretty(pg_total_relation_size('almox.estoque_diario_snapshot')) AS tamanho
     FROM almox.estoque_diario_snapshot`,
  );

  await run(
    client,
    'lote_importacao — frequência por dia (últimos 30)',
    `SELECT DATE(importado_em) AS dia, COUNT(*)::bigint AS lotes
     FROM almox.lote_importacao
     GROUP BY DATE(importado_em)
     ORDER BY dia DESC
     LIMIT 30`,
  );

  await run(
    client,
    'estoque_importado — totais e por lote',
    `SELECT
       COUNT(*)::bigint AS total_linhas,
       COUNT(DISTINCT lote_importacao_id)::bigint AS distintos_lotes,
       pg_size_pretty(pg_total_relation_size('almox.estoque_importado')) AS tamanho
     FROM almox.estoque_importado`,
  );

  await run(
    client,
    'estoque_importado — linhas por dia (últimos 30)',
    `SELECT DATE(li.importado_em) AS dia, COUNT(*)::bigint AS linhas
     FROM almox.estoque_importado ei
     JOIN almox.lote_importacao li ON li.id = ei.lote_importacao_id
     GROUP BY DATE(li.importado_em)
     ORDER BY dia DESC
     LIMIT 30`,
  );

  await run(
    client,
    'siscore_sync_execucao — totais e por status',
    `SELECT
       status,
       COUNT(*)::bigint AS quantidade,
       MIN(criado_em) AS mais_antigo,
       MAX(criado_em) AS mais_recente
     FROM almox.siscore_sync_execucao
     GROUP BY status
     ORDER BY quantidade DESC`,
  );

  await run(
    client,
    'siscore_sync_execucao — tamanho médio do payload metadados (top 10 maiores)',
    `SELECT
       id,
       criado_em,
       status,
       pg_column_size(metadados) AS bytes_metadados
     FROM almox.siscore_sync_execucao
     ORDER BY pg_column_size(metadados) DESC NULLS LAST
     LIMIT 10`,
  );

  await run(
    client,
    'sincronizacao_siscore_rastreador — totais',
    `SELECT
       COUNT(*)::bigint AS total,
       MIN(criado_em) AS mais_antigo,
       MAX(criado_em) AS mais_recente,
       pg_size_pretty(pg_total_relation_size('almox.sincronizacao_siscore_rastreador')) AS tamanho
     FROM almox.sincronizacao_siscore_rastreador`,
  );

  await run(
    client,
    'notas_fiscais_hmsa — totais (se existir)',
    `SELECT
       COUNT(*)::bigint AS total,
       MIN(data_entrada) AS data_minima,
       MAX(data_entrada) AS data_maxima,
       pg_size_pretty(pg_total_relation_size('almox.nota_fiscal')) AS tamanho_nota,
       (SELECT COUNT(*)::bigint FROM almox.nota_fiscal_item) AS total_itens,
       pg_size_pretty(pg_total_relation_size('almox.nota_fiscal_item')) AS tamanho_itens
     FROM almox.nota_fiscal`,
  );

  await run(
    client,
    'Bloat / dead tuples (top 10 — pode indicar VACUUM atrasado)',
    `SELECT
       schemaname,
       relname,
       n_live_tup,
       n_dead_tup,
       CASE WHEN n_live_tup = 0 THEN 0 ELSE ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup,0), 2) END AS pct_dead,
       last_autovacuum,
       last_vacuum
     FROM pg_stat_user_tables
     WHERE schemaname = 'almox'
     ORDER BY n_dead_tup DESC
     LIMIT 10`,
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
