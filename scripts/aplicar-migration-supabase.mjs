import fs from 'node:fs';
import path from 'node:path';

import pg from 'pg';

const { Client } = pg;

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env.local');
const migrationsDir = path.join(rootDir, 'supabase', 'migrations');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de ambiente nao encontrado: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

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
    values[key] = value;
  }

  return values;
}

async function main() {
  const env = loadEnvFile(envPath);
  const connectionString = env.SUPABASE_DB_URL;

  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL nao foi definida em .env.local.');
  }

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Diretorio de migrations nao encontrado: ${migrationsDir}`);
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error('Nenhuma migration SQL foi encontrada na pasta supabase/migrations.');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Conectando ao banco Supabase...');
  await client.connect();

  try {
    await client.query(`
      create table if not exists public.app_migrations (
        arquivo text primary key,
        aplicado_em timestamptz not null default now()
      )
    `);

    for (const fileName of migrationFiles) {
      const alreadyApplied = await client.query(
        `select 1 from public.app_migrations where arquivo = $1 limit 1`,
        [fileName]
      );

      if (alreadyApplied.rowCount) {
        console.log(`Migration ja aplicada: ${fileName}`);
        continue;
      }

      const migrationPath = path.join(migrationsDir, fileName);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log(`Aplicando migration: ${fileName}`);
      await client.query(sql);
      await client.query(
        `insert into public.app_migrations (arquivo) values ($1)`,
        [fileName]
      );
    }

    console.log('Migrations aplicadas com sucesso.');
  } finally {
    await client.end();
    console.log('Conexao encerrada.');
  }
}

main().catch((error) => {
  console.error('Falha ao aplicar migration.');
  console.error(error.message);
  process.exit(1);
});
