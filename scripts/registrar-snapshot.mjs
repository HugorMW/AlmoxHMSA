import fs from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
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
  const fileEnv = loadEnvFile(envPath);
  const connectionString = process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL;

  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL nao foi definida.');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Conectando ao banco Supabase...');
  await client.connect();

  try {
    const result = await client.query(
      'select public.registrar_snapshot_estoque_diario(current_date) as quantidade'
    );
    const quantidade = result.rows[0]?.quantidade ?? 0;
    console.log(`Snapshot registrado. Linhas afetadas: ${quantidade}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Falha ao registrar snapshot diario.');
  console.error(error.message);
  process.exit(1);
});
