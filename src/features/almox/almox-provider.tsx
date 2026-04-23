import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';

import {
  AlmoxDataset,
  createEmptyDataset,
  EstoqueAtualRow,
  getEmailConfig,
  hydrateDataset,
} from './data';
import { readCachedValue, readSessionFlag, removeCachedValue, writeCachedValue, writeSessionFlag } from './cache';
import {
  ConfiguracaoSistema,
  PROCESSO_TOTAL_PARCELAS_MAX,
  configuracaoSistemaPadrao,
  normalizarConfiguracaoSistema,
} from './configuracao';
import {
  BlacklistItem,
  CategoriaMaterial,
  CmmExceptionItem,
  EmailConfig,
  FiltroCategoriaMaterial,
  Hospital,
  LowConsumptionCandidate,
  ProcessoAcompanhamento,
  ProcessoProdutoLookup,
  ProcessoSaveInput,
} from './types';

const PAGE_SIZE = 1000;
const ALMOX_CACHE_KEY = 'almox:base:v1';
const ALMOX_SESSION_KEY = 'almox:base:session:v1';
const ALMOX_CACHE_TTL_MS = 5 * 60 * 1000;
const ALMOX_CONFIG_CACHE_KEY = 'almox:config:v1';
const ALMOX_CONFIG_CACHE_TTL_MS = 30 * 60 * 1000;
const ALMOX_PROCESS_CACHE_KEY = 'almox:processes:v1';
const ALMOX_PROCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const SYNC_STATUS_MAX_WAIT_MS = 10 * 60 * 1000;
const ESTOQUE_ATUAL_SELECT_COLUMNS = [
  'categoria_material',
  'importado_em',
  'codigo_unidade',
  'produto_referencia_id',
  'codigo_produto_referencia',
  'nome_produto_referencia',
  'codigo_produto',
  'nome_produto',
  'suficiencia_em_dias',
  'data_ultima_entrada',
  'consumo_medio',
  'estoque_atual',
].join(',');
const emailConfig = getEmailConfig();
export const ALMOX_SYNC_COMPLETED_EVENT = 'almox:sync-completed';
export const ALMOX_CONFIG_UPDATED_EVENT = 'almox:config-updated';

type PendingSyncState = {
  trackingId: string;
};

type SyncTrackedJob = {
  jobTipo: 'estoque' | 'notas_fiscais';
  scope: 'all' | 'estoque' | 'material_hospitalar' | 'material_farmacologico' | 'notas_fiscais';
  status: 'queued' | 'running' | 'success' | 'failed';
  workflowArquivo: string;
  workflowRunUrl: string | null;
  mensagemErro: string | null;
  metadados?: Record<string, unknown>;
};

type SyncSuccessMetadata = {
  categoria?: string;
  skipped?: boolean;
};

type AlmoxDataContextValue = {
  dataset: AlmoxDataset;
  loading: boolean;
  refreshing: boolean;
  syncingBase: boolean;
  lastRefreshAt: string | null;
  syncError: string | null;
  syncNotice: string | null;
  usingCachedData: boolean;
  error: string | null;
  warning: string | null;
  categoryFilter: FiltroCategoriaMaterial;
  setCategoryFilter: (nextFilter: FiltroCategoriaMaterial) => void;
  dashboardHospital: Hospital;
  setDashboardHospital: (nextHospital: Hospital) => void;
  blacklistItems: BlacklistItem[];
  blacklistSummary: {
    hospitalar: number;
    farmacologico: number;
  };
  cmmExceptionItems: CmmExceptionItem[];
  lowConsumptionCandidates: LowConsumptionCandidate[];
  cmmExceptionSummary: {
    hospitalar: number;
    farmacologico: number;
    candidates: number;
  };
  processItems: ProcessoAcompanhamento[];
  processItemsLoading: boolean;
  processItemsError: string | null;
  refreshProcessItems: (options?: { force?: boolean }) => Promise<void>;
  systemConfig: ConfiguracaoSistema;
  systemConfigLoading: boolean;
  systemConfigSaving: boolean;
  systemConfigError: string | null;
  systemConfigNotice: string | null;
  systemConfigUpdatedAt: string | null;
  refreshSystemConfig: () => Promise<void>;
  saveSystemConfig: (nextConfig: ConfiguracaoSistema) => Promise<void>;
  findHmsaProductNameByCode: (cdProduto: string) => string | null;
  findHmsaProductCategoryByCode: (cdProduto: string) => CategoriaMaterial | null;
  findHmsaProductByBionexoCode: (codBionexo: string) => ProcessoProdutoLookup | null;
  lookupHmsaProductByBionexoCode: (codBionexo: string) => Promise<ProcessoProdutoLookup | null>;
  addBlacklistItem: (input: { cd_produto: string; ds_produto?: string }) => Promise<void>;
  removeBlacklistItem: (id: string) => Promise<void>;
  addCmmExceptionItem: (input: { cd_produto: string; ds_produto?: string; categoria_material?: CategoriaMaterial }) => Promise<void>;
  removeCmmExceptionItem: (id: string) => Promise<void>;
  saveProcessItem: (input: ProcessoSaveInput) => Promise<void>;
  updateProcessParcelas: (id: string, parcelasEntregues: boolean[]) => Promise<void>;
  setProcessIgnored: (id: string, ignorado: boolean) => Promise<void>;
  deleteProcessItem: (id: string) => Promise<void>;
  emailConfig: EmailConfig;
  refresh: () => Promise<void>;
  syncBase: (scope: 'estoque' | 'notas_fiscais') => Promise<void>;
};

const AlmoxDataContext = createContext<AlmoxDataContextValue | null>(null);

async function loadEstoqueAtualRows() {
  const supabase = getSupabaseClient();
  const rows: EstoqueAtualRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('almox_estoque_atual')
      .select(ESTOQUE_ATUAL_SELECT_COLUMNS)
      .order('categoria_material', { ascending: true })
      .order('codigo_unidade', { ascending: true })
      .order('codigo_produto', { ascending: true })
      .range(start, end);

    if (error) {
      throw createScopedError(`almox_estoque_atual [${start}-${end}]`, error);
    }

    const pageRows = (data ?? []) as unknown as EstoqueAtualRow[];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function loadBlacklistItems() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('almox_exclusoes_hmsa')
    .select('id, cd_produto, ds_produto, codigo_unidade, ativo, criado_em, atualizado_em')
    .eq('ativo', true)
    .order('cd_produto', { ascending: true });

  if (error) {
    throw createScopedError('almox_exclusoes_hmsa', error);
  }

  return (data ?? []) as BlacklistItem[];
}

async function loadCmmExceptionItems() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('almox_excecoes_cmm_hmsa')
    .select('id, cd_produto, ds_produto, codigo_unidade, categoria_material, ativo, criado_em, atualizado_em')
    .eq('ativo', true)
    .order('cd_produto', { ascending: true });

  if (error) {
    throw createScopedError('almox_excecoes_cmm_hmsa', error);
  }

  return (data ?? []) as CmmExceptionItem[];
}

function normalizarProcessoItem(item: ProcessoAcompanhamento): ProcessoAcompanhamento {
  const parcelasRaw = Array.isArray(item.parcelas_entregues) ? item.parcelas_entregues : [];
  const totalParcelas = Math.min(Math.max(Number(item.total_parcelas) || 3, 1), PROCESSO_TOTAL_PARCELAS_MAX);

  return {
    ...item,
    total_parcelas: totalParcelas,
    ds_produto: normalizarTextoProcesso(item.ds_produto),
    edocs: item.edocs ?? '',
    marca: item.marca ?? '',
    fornecedor: item.fornecedor ?? '',
    data_resgate: item.data_resgate ?? null,
    parcelas_entregues: Array.from({ length: totalParcelas }, (_, index) => parcelasRaw[index] === true),
    critico: item.critico === true,
    ignorado: item.ignorado === true,
  };
}

async function loadProcessItems() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('almox_processos_acompanhamento')
    .select(
      'id, categoria_material, cod_bionexo, cd_produto, ds_produto, numero_processo, edocs, marca, tipo_processo, fornecedor, data_resgate, total_parcelas, parcelas_entregues, critico, ignorado, ativo, criado_em, atualizado_em'
    )
    .eq('ativo', true)
    .order('critico', { ascending: false })
    .order('data_resgate', { ascending: true, nullsFirst: false })
    .order('numero_processo', { ascending: true });

  if (error) {
    throw createScopedError('almox_processos_acompanhamento', error);
  }

  return ((data ?? []) as ProcessoAcompanhamento[]).map(normalizarProcessoItem);
}

function formatLoadError(error: unknown) {
  return getErrorMessage(error, 'Falha ao consultar a base do Supabase.');
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const msg = (error as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg) {
      return msg;
    }
  }

  return fallback;
}

function createScopedError(scope: string, error: unknown) {
  if (error instanceof Error && error.message.startsWith(`${scope}:`)) {
    return error;
  }

  const code =
    typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).code === 'string'
      ? String((error as Record<string, unknown>).code)
      : '';
  const details =
    typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).details === 'string'
      ? String((error as Record<string, unknown>).details).trim()
      : '';
  const hint =
    typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).hint === 'string'
      ? String((error as Record<string, unknown>).hint).trim()
      : '';
  const message = getErrorMessage(error, 'Falha sem mensagem adicional.');
  const prefix = code ? `${scope}: ${code} ${message}` : `${scope}: ${message}`;
  const suffix = [details, hint].filter(Boolean).join(' | ');
  return new Error(suffix ? `${prefix} | ${suffix}` : prefix);
}

function logScopedError(scope: string, error: unknown) {
  console.error(`[almox] ${scope}`, {
    message: getErrorMessage(error, 'Falha sem mensagem adicional.'),
    code:
      typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).code === 'string'
        ? (error as Record<string, unknown>).code
        : null,
    details:
      typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).details === 'string'
        ? (error as Record<string, unknown>).details
        : null,
    hint:
      typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).hint === 'string'
        ? (error as Record<string, unknown>).hint
        : null,
    error,
  });
}

function formatAuxiliaryRefreshWarning(failedSources: string[]) {
  if (failedSources.length === 0) {
    return null;
  }

  if (failedSources.length === 1) {
    return `A base principal foi atualizada, mas não foi possível atualizar ${failedSources[0]}. O app manteve a última versão válida desse apoio.`;
  }

  if (failedSources.length === 2) {
    return `A base principal foi atualizada, mas não foi possível atualizar ${failedSources[0]} e ${failedSources[1]}. O app manteve a última versão válida desses apoios.`;
  }

  const lastSource = failedSources[failedSources.length - 1];
  const leadingSources = failedSources.slice(0, -1).join(', ');
  return `A base principal foi atualizada, mas não foi possível atualizar ${leadingSources} e ${lastSource}. O app manteve a última versão válida desses apoios.`;
}

function getSyncJobLabel(job: SyncTrackedJob) {
  if (job.jobTipo === 'notas_fiscais') {
    return 'Notas fiscais';
  }

  if (job.scope === 'material_hospitalar') {
    return 'Estoque hospitalar';
  }

  if (job.scope === 'material_farmacologico') {
    return 'Estoque farmacológico';
  }

  return 'Estoque';
}

function descreverJobsSincronizacao(jobs: SyncTrackedJob[]) {
  return jobs
    .map((job) => {
      const suffix =
        job.status === 'success'
          ? 'concluído'
          : job.status === 'failed'
            ? 'falhou'
            : job.status === 'running'
              ? 'em execução'
              : 'na fila';
      return `${getSyncJobLabel(job)}: ${suffix}`;
    })
    .join(' • ');
}

function isSyncTrackedJob(value: unknown): value is SyncTrackedJob {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SyncTrackedJob).jobTipo === 'string' &&
    typeof (value as SyncTrackedJob).scope === 'string' &&
    typeof (value as SyncTrackedJob).status === 'string' &&
    typeof (value as SyncTrackedJob).workflowArquivo === 'string'
  );
}

function lerSucessosDoJob(job: SyncTrackedJob): SyncSuccessMetadata[] {
  const sucessos = job.metadados?.sucessos;
  return Array.isArray(sucessos) ? sucessos.filter((item): item is SyncSuccessMetadata => typeof item === 'object' && item !== null) : [];
}

function jobFoiIntegralmenteIgnorado(job: SyncTrackedJob) {
  const sucessos = lerSucessosDoJob(job);
  return sucessos.length > 0 && sucessos.every((sucesso) => sucesso.skipped === true);
}

async function parseSyncResponse(response: Response) {
  const rawText = await response.text().catch(() => '');
  let data: any = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  }

  if (!response.ok && response.status === 504) {
    throw new Error(
      'A sincronizacao demorou mais do que a hospedagem permite em uma unica requisicao.\nTente novamente ou aguarde alguns instantes.'
    );
  }

  const errorMessage =
    typeof data?.error === 'string'
      ? data.error
      : 'Falha inesperada ao sincronizar a base do SISCORE.';
  const details = Array.isArray(data?.details)
    ? data.details.filter((detail: unknown): detail is string => typeof detail === 'string' && detail.trim().length > 0)
    : [];

  if (!response.ok) {
    throw new Error([errorMessage, ...details].join('\n'));
  }

  return data;
}

async function parseConfiguracaoResponse(response: Response) {
  const rawText = await response.text().catch(() => '');
  let data: any = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof data?.error === 'string'
        ? data.error
        : 'Falha inesperada ao consultar os parametros do sistema.';
    const details = Array.isArray(data?.details)
      ? data.details.filter((detail: unknown): detail is string => typeof detail === 'string' && detail.trim().length > 0)
      : [];

    throw new Error([errorMessage, ...details].join('\n'));
  }

  return data;
}

function normalizeCategory(value: EstoqueAtualRow['categoria_material']): CategoriaMaterial {
  return value === 'material_farmacologico' ? 'material_farmacologico' : 'material_hospitalar';
}

function rowEhDoHmsa(row: EstoqueAtualRow) {
  const unidade = String(row.codigo_unidade ?? '').trim().toUpperCase();
  return unidade === 'HMSASOUL';
}

function normalizarCodigoProduto(value: string) {
  return String(value ?? '').trim();
}

function normalizarTextoProcesso(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizarCodBionexo(value: string) {
  const trimmed = String(value ?? '').trim().toUpperCase();
  if (!trimmed) {
    return '';
  }

  const withoutPrefix = trimmed.replace(/^I\s*-\s*/i, '').trim();
  return withoutPrefix ? `I-${withoutPrefix}` : '';
}

type ProcessoProdutoLookupRow = Pick<
  EstoqueAtualRow,
  | 'categoria_material'
  | 'codigo_produto'
  | 'codigo_produto_referencia'
  | 'estoque_atual'
  | 'nome_produto'
  | 'nome_produto_referencia'
  | 'suficiencia_em_dias'
>;

function criarLookupProdutoProcesso(row: ProcessoProdutoLookupRow, codBionexo: string): ProcessoProdutoLookup {
  return {
    cod_bionexo: codBionexo,
    cd_produto: normalizarCodigoProduto(row.codigo_produto),
    ds_produto: String(row.nome_produto_referencia ?? '').trim() || row.nome_produto,
    categoria_material: normalizeCategory(row.categoria_material),
    estoque_atual: parseNumericRowValue(row.estoque_atual),
    suficiencia_em_dias: parseNumericRowValue(row.suficiencia_em_dias),
  };
}

function normalizarParcelasEntregues(value: boolean[], totalParcelas: number) {
  return Array.from({ length: totalParcelas }, (_, index) => value[index] === true);
}

function ordenarProcessos(items: ProcessoAcompanhamento[]) {
  return [...items].sort(
    (left, right) =>
      Number(right.critico) - Number(left.critico) ||
      String(left.data_resgate ?? '9999-12-31').localeCompare(String(right.data_resgate ?? '9999-12-31')) ||
      left.numero_processo.localeCompare(right.numero_processo, 'pt-BR')
  );
}

function parseNumericRowValue(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

type AlmoxBaseCache = {
  rows: EstoqueAtualRow[];
  blacklistItems: BlacklistItem[];
  cmmExceptionItems: CmmExceptionItem[];
  processItems?: ProcessoAcompanhamento[];
};

type AlmoxConfigCache = {
  config: ConfiguracaoSistema;
  updatedAt: string | null;
};

type AlmoxProcessCache = {
  processItems: ProcessoAcompanhamento[];
};

export function AlmoxDataProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<EstoqueAtualRow[]>([]);
  const [blacklistItems, setBlacklistItems] = useState<BlacklistItem[]>([]);
  const [cmmExceptionItems, setCmmExceptionItems] = useState<CmmExceptionItem[]>([]);
  const [processItems, setProcessItems] = useState<ProcessoAcompanhamento[]>([]);
  const [processItemsLoading, setProcessItemsLoading] = useState(false);
  const [processItemsError, setProcessItemsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingBase, setSyncingBase] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FiltroCategoriaMaterial>('todos');
  const [dashboardHospital, setDashboardHospital] = useState<Hospital>('HMSA');
  const [pendingSync, setPendingSync] = useState<PendingSyncState | null>(null);
  const [systemConfig, setSystemConfig] = useState<ConfiguracaoSistema>(configuracaoSistemaPadrao);
  const [systemConfigLoading, setSystemConfigLoading] = useState(true);
  const [systemConfigSaving, setSystemConfigSaving] = useState(false);
  const [systemConfigError, setSystemConfigError] = useState<string | null>(null);
  const [systemConfigNotice, setSystemConfigNotice] = useState<string | null>(null);
  const [systemConfigUpdatedAt, setSystemConfigUpdatedAt] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const processItemsLoadedRef = useRef(false);

  const dataset = useMemo<AlmoxDataset>(() => {
    const blacklistSet = new Set(blacklistItems.map((item) => normalizarCodigoProduto(item.cd_produto)));
    const cmmExceptionSet = new Set(cmmExceptionItems.map((item) => normalizarCodigoProduto(item.cd_produto)));
    const visibleRows = rows.filter(
      (row) => !(rowEhDoHmsa(row) && blacklistSet.has(normalizarCodigoProduto(row.codigo_produto)))
    );

    const filteredRows =
      categoryFilter === 'todos'
        ? visibleRows
        : visibleRows.filter((row) => normalizeCategory(row.categoria_material) === categoryFilter);

    return filteredRows.length > 0
      ? hydrateDataset(filteredRows, systemConfig, { cmmExceptionCodes: cmmExceptionSet })
      : createEmptyDataset(systemConfig);
  }, [rows, blacklistItems, cmmExceptionItems, categoryFilter, systemConfig]);

  const blacklistSummary = useMemo(() => {
    const blockedCodes = new Set(blacklistItems.map((item) => normalizarCodigoProduto(item.cd_produto)));
    const hospitalar = new Set<string>();
    const farmacologico = new Set<string>();

    for (const row of rows) {
      if (!rowEhDoHmsa(row)) {
        continue;
      }

      const codigoProduto = normalizarCodigoProduto(row.codigo_produto);
      if (!blockedCodes.has(codigoProduto)) {
        continue;
      }

      const categoria = normalizeCategory(row.categoria_material);
      if (categoria === 'material_farmacologico') {
        farmacologico.add(codigoProduto);
      } else {
        hospitalar.add(codigoProduto);
      }
    }

    return {
      hospitalar: hospitalar.size,
      farmacologico: farmacologico.size,
    };
  }, [rows, blacklistItems]);

  const lowConsumptionCandidates = useMemo<LowConsumptionCandidate[]>(() => {
    const blockedCodes = new Set(blacklistItems.map((item) => normalizarCodigoProduto(item.cd_produto)));
    const byCode = new Map<string, LowConsumptionCandidate>();

    for (const row of rows) {
      if (!rowEhDoHmsa(row)) {
        continue;
      }

      const cdProduto = normalizarCodigoProduto(row.codigo_produto);
      if (!cdProduto || blockedCodes.has(cdProduto)) {
        continue;
      }

      const cmm = parseNumericRowValue(row.consumo_medio);
      if (cmm >= 1) {
        continue;
      }

      byCode.set(cdProduto, {
        cd_produto: cdProduto,
        ds_produto: row.nome_produto,
        categoria_material: normalizeCategory(row.categoria_material),
        cmm,
        estoque_atual: parseNumericRowValue(row.estoque_atual),
      });
    }

    return [...byCode.values()].sort(
      (left, right) =>
        left.categoria_material.localeCompare(right.categoria_material) ||
        left.ds_produto.localeCompare(right.ds_produto, 'pt-BR') ||
        left.cd_produto.localeCompare(right.cd_produto)
    );
  }, [rows, blacklistItems]);

  const cmmExceptionSummary = useMemo(() => {
    let hospitalar = 0;
    let farmacologico = 0;

    for (const item of cmmExceptionItems) {
      if (item.categoria_material === 'material_farmacologico') {
        farmacologico += 1;
      } else {
        hospitalar += 1;
      }
    }

    return {
      hospitalar,
      farmacologico,
      candidates: lowConsumptionCandidates.length,
    };
  }, [cmmExceptionItems, lowConsumptionCandidates.length]);

  const refreshSystemConfig = useCallback(async function refreshSystemConfig() {
    if (!mountedRef.current) {
      return;
    }

    setSystemConfigLoading(true);
    setSystemConfigError(null);

    try {
      const response = await fetch('/api/configuracao', {
        method: 'GET',
        credentials: 'include',
      });
      const data = await parseConfiguracaoResponse(response);
      const nextConfig = normalizarConfiguracaoSistema(data?.config);

      if (!mountedRef.current) {
        return;
      }

      startTransition(() => {
        setSystemConfig(nextConfig);
      });
      setSystemConfigUpdatedAt(typeof data?.atualizadoEm === 'string' ? data.atualizadoEm : null);
      setSystemConfigError(null);
      writeCachedValue<AlmoxConfigCache>(ALMOX_CONFIG_CACHE_KEY, {
        config: nextConfig,
        updatedAt: typeof data?.atualizadoEm === 'string' ? data.atualizadoEm : null,
      });
    } catch (configError) {
      if (!mountedRef.current) {
        return;
      }

      const scopedError = createScopedError('/api/configuracao [GET]', configError);
      logScopedError('/api/configuracao [GET]', configError);
      setSystemConfigError(scopedError.message);
    } finally {
      if (!mountedRef.current) {
        return;
      }

      setSystemConfigLoading(false);
    }
  }, []);

  const saveSystemConfig = useCallback(async function saveSystemConfig(nextConfig: ConfiguracaoSistema) {
    if (!mountedRef.current) {
      return;
    }

    setSystemConfigSaving(true);
    setSystemConfigError(null);
    setSystemConfigNotice(null);

    try {
      const response = await fetch('/api/configuracao', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config: nextConfig }),
      });
      const data = await parseConfiguracaoResponse(response);
      const savedConfig = normalizarConfiguracaoSistema(data?.config);

      if (!mountedRef.current) {
        return;
      }

      startTransition(() => {
        setSystemConfig(savedConfig);
      });
      const nextUpdatedAt = typeof data?.atualizadoEm === 'string' ? data.atualizadoEm : new Date().toISOString();
      setSystemConfigUpdatedAt(nextUpdatedAt);
      setSystemConfigNotice('Parâmetros do sistema salvos com sucesso.');
      removeCachedValue(ALMOX_CACHE_KEY);
      writeCachedValue<AlmoxConfigCache>(ALMOX_CONFIG_CACHE_KEY, {
        config: savedConfig,
        updatedAt: nextUpdatedAt,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ALMOX_CONFIG_UPDATED_EVENT));
      }
    } catch (configError) {
      if (!mountedRef.current) {
        return;
      }

      const scopedError = createScopedError('/api/configuracao [PUT]', configError);
      logScopedError('/api/configuracao [PUT]', configError);
      setSystemConfigError(scopedError.message);
      throw scopedError;
    } finally {
      if (!mountedRef.current) {
        return;
      }

      setSystemConfigSaving(false);
    }
  }, []);

  const refreshProcessItems = useCallback(async function refreshProcessItems(options?: { force?: boolean }) {
    const force = options?.force === true;

    if (!mountedRef.current) {
      return;
    }

    setProcessItemsError(null);

    if (!force) {
      const cached = readCachedValue<AlmoxProcessCache>(ALMOX_PROCESS_CACHE_KEY, ALMOX_PROCESS_CACHE_TTL_MS);
      if (cached?.isFresh) {
        processItemsLoadedRef.current = true;
        setProcessItemsError(null);
        startTransition(() => {
          setProcessItems(cached.value.processItems);
        });
        return;
      }
    }

    setProcessItemsLoading(true);

    try {
      const nextProcessItems = await loadProcessItems();

      if (!mountedRef.current) {
        return;
      }

      startTransition(() => {
        setProcessItems(nextProcessItems);
      });
      processItemsLoadedRef.current = true;
      setProcessItemsError(null);
      writeCachedValue<AlmoxProcessCache>(ALMOX_PROCESS_CACHE_KEY, {
        processItems: nextProcessItems,
      });
    } catch (processLoadError) {
      if (!mountedRef.current) {
        throw processLoadError;
      }

      const scopedError = createScopedError('almox_processos_acompanhamento', processLoadError);
      logScopedError('almox_processos_acompanhamento', processLoadError);
      setProcessItemsError(scopedError.message);
      throw scopedError;
    } finally {
      if (!mountedRef.current) {
        return;
      }

      setProcessItemsLoading(false);
    }
  }, []);

  const refresh = useCallback(async function refresh() {
    const isInitialLoad = !hasLoadedRef.current;

    if (!mountedRef.current) {
      return;
    }

    setError(null);
    setWarning(null);

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [rowsResult, blacklistResult, cmmExceptionResult] = await Promise.allSettled([
        loadEstoqueAtualRows(),
        loadBlacklistItems(),
        loadCmmExceptionItems(),
      ]);

      if (rowsResult.status === 'rejected') {
        throw rowsResult.reason;
      }

      if (!mountedRef.current) {
        return;
      }

      const failedSources: string[] = [];
      const nextBlacklistItems =
        blacklistResult.status === 'fulfilled'
          ? blacklistResult.value
          : (() => {
              failedSources.push('a lista de exclusões manuais');
              return null;
            })();
      const nextCmmExceptionItems =
        cmmExceptionResult.status === 'fulfilled'
          ? cmmExceptionResult.value
          : (() => {
              failedSources.push('a lista de exceções de CMM');
              return null;
            })();

      startTransition(() => {
        setRows(rowsResult.value);
        if (nextBlacklistItems) {
          setBlacklistItems(nextBlacklistItems);
        }
        if (nextCmmExceptionItems) {
          setCmmExceptionItems(nextCmmExceptionItems);
        }
      });
      setError(null);
      setWarning(formatAuxiliaryRefreshWarning(failedSources));
      setUsingCachedData(false);
      setLastRefreshAt(new Date().toISOString());
      hasLoadedRef.current = true;
      writeSessionFlag(ALMOX_SESSION_KEY);
    } catch (loadError) {
      if (!mountedRef.current) {
        return;
      }

      logScopedError('refresh base operacional', loadError);
      setError(formatLoadError(loadError));
    } finally {
      if (!mountedRef.current) {
        return;
      }

      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const syncBase = useCallback(async function syncBase(scope: 'estoque' | 'notas_fiscais') {
    if (!mountedRef.current) {
      return;
    }

    setSyncingBase(true);
    setSyncError(null);
    setSyncNotice(null);
    let keepPolling = false;

    try {
      const response = await fetch('/api/siscore/sync', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope }),
      });

      const data = await parseSyncResponse(response);

      if (data?.queued && typeof data?.trackingId === 'string' && data.trackingId.trim().length > 0) {
        keepPolling = true;
        const jobs = Array.isArray(data?.jobs) ? (data.jobs as unknown[]).filter(isSyncTrackedJob) : [];
        setPendingSync({
          trackingId: data.trackingId,
        });
        setSyncNotice(
          jobs.length > 0
            ? `Sincronizacao enviada ao GitHub Actions. ${descreverJobsSincronizacao(
                jobs.map((job: SyncTrackedJob) => ({ ...job, status: 'queued' }))
              )}.`
            : 'Sincronizacao enviada ao GitHub Actions. Acompanhando o status por ate 2min30s.'
        );
      } else {
        removeCachedValue(ALMOX_CACHE_KEY);
        await refresh();
        setSyncNotice('Base sincronizada com sucesso a partir do SISCORE.');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(ALMOX_SYNC_COMPLETED_EVENT));
        }
      }
    } catch (syncLoadError) {
      if (!mountedRef.current) {
        return;
      }

      const message =
        syncLoadError instanceof Error && syncLoadError.message
          ? syncLoadError.message
          : 'Falha ao sincronizar a base do SISCORE.';
      setSyncError(message);
      throw syncLoadError;
    } finally {
      if (mountedRef.current && !keepPolling) {
        setSyncingBase(false);
      }
    }
  }, [refresh]);

  async function addBlacklistItem(input: { cd_produto: string; ds_produto?: string }) {
    const supabase = getSupabaseClient();
    const cdProduto = normalizarCodigoProduto(input.cd_produto);

    if (!cdProduto) {
      throw new Error('Informe o cd_produto para cadastrar a exclusão.');
    }

    const descricaoLocal =
      rows.find((row) => rowEhDoHmsa(row) && normalizarCodigoProduto(row.codigo_produto) === cdProduto)?.nome_produto ?? '';
    const dsProduto = String(input.ds_produto ?? '').trim() || descricaoLocal || 'Produto excluído do HMSA';

    const { data, error: upsertError } = await supabase
      .from('almox_exclusoes_hmsa')
      .upsert(
        {
          cd_produto: cdProduto,
          ds_produto: dsProduto,
          codigo_unidade: 'HMSASOUL',
          ativo: true,
        },
        {
          onConflict: 'codigo_unidade,cd_produto',
        }
      )
      .select('id, cd_produto, ds_produto, codigo_unidade, ativo, criado_em, atualizado_em')
      .single();

    if (upsertError) {
      throw upsertError;
    }

    const nextItem = data as BlacklistItem;

    startTransition(() => {
      setBlacklistItems((current) => {
        const withoutCurrent = current.filter((item) => normalizarCodigoProduto(item.cd_produto) !== cdProduto);
        return [...withoutCurrent, nextItem].sort((left, right) => left.cd_produto.localeCompare(right.cd_produto));
      });
    });
  }

  const findHmsaProductNameByCode = useCallback((cdProduto: string) => {
    const codigoNormalizado = normalizarCodigoProduto(cdProduto);

    if (!codigoNormalizado) {
      return null;
    }

    return (
      rows.find((row) => rowEhDoHmsa(row) && normalizarCodigoProduto(row.codigo_produto) === codigoNormalizado)?.nome_produto ??
      null
    );
  }, [rows]);

  const findHmsaProductCategoryByCode = useCallback(
    (cdProduto: string): CategoriaMaterial | null => {
      const codigoNormalizado = normalizarCodigoProduto(cdProduto);

      if (!codigoNormalizado) {
        return null;
      }

      const row = rows.find(
        (current) =>
          rowEhDoHmsa(current) && normalizarCodigoProduto(current.codigo_produto) === codigoNormalizado
      );

      return row ? normalizeCategory(row.categoria_material) : null;
    },
    [rows]
  );

  const findHmsaProductByBionexoCode = useCallback(
    (codBionexo: string): ProcessoProdutoLookup | null => {
      const codigoNormalizado = normalizarCodBionexo(codBionexo);

      if (!codigoNormalizado) {
        return null;
      }

      const row = rows.find(
        (current) =>
          rowEhDoHmsa(current) &&
          normalizarCodBionexo(current.codigo_produto_referencia ?? '') === codigoNormalizado
      );

      if (!row) {
        return null;
      }

      return criarLookupProdutoProcesso(row, codigoNormalizado);
    },
    [rows]
  );

  const lookupHmsaProductByBionexoCode = useCallback(
    async (codBionexo: string): Promise<ProcessoProdutoLookup | null> => {
      const localProduct = findHmsaProductByBionexoCode(codBionexo);

      if (localProduct) {
        return localProduct;
      }

      const codigoNormalizado = normalizarCodBionexo(codBionexo);

      if (!codigoNormalizado) {
        return null;
      }

      const supabase = getSupabaseClient();
      const { data, error: lookupError } = await supabase
        .from('almox_estoque_atual')
        .select(
          'categoria_material,codigo_produto,codigo_produto_referencia,estoque_atual,nome_produto,nome_produto_referencia,suficiencia_em_dias'
        )
        .eq('codigo_unidade', 'HMSASOUL')
        .ilike('codigo_produto_referencia', codigoNormalizado)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        throw createScopedError(`almox_estoque_atual lookup HMSASOUL ${codigoNormalizado}`, lookupError);
      }

      if (!data) {
        return null;
      }

      return criarLookupProdutoProcesso(data, codigoNormalizado);
    },
    [findHmsaProductByBionexoCode]
  );

  async function removeBlacklistItem(id: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from('almox_exclusoes_hmsa')
      .update({ ativo: false })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    startTransition(() => {
      setBlacklistItems((current) => current.filter((item) => item.id !== id));
    });
  }

  async function addCmmExceptionItem(input: {
    cd_produto: string;
    ds_produto?: string;
    categoria_material?: CategoriaMaterial;
  }) {
    const supabase = getSupabaseClient();
    const cdProduto = normalizarCodigoProduto(input.cd_produto);

    if (!cdProduto) {
      throw new Error('Informe o cd_produto para cadastrar a exceção.');
    }

    const row = rows.find((current) => rowEhDoHmsa(current) && normalizarCodigoProduto(current.codigo_produto) === cdProduto);
    const cmm = parseNumericRowValue(row?.consumo_medio);

    if (!row) {
      throw new Error('O item informado não foi encontrado na base atual do HMSA.');
    }

    if (cmm >= 1) {
      throw new Error('A exceção só se aplica a itens com consumo mensal menor que 1.');
    }

    const dsProduto = String(input.ds_produto ?? '').trim() || row.nome_produto || 'Produto com exceção de CMM';
    const categoriaMaterial = input.categoria_material ?? normalizeCategory(row.categoria_material);

    const { data, error: upsertError } = await supabase
      .from('almox_excecoes_cmm_hmsa')
      .upsert(
        {
          cd_produto: cdProduto,
          ds_produto: dsProduto,
          codigo_unidade: 'HMSASOUL',
          categoria_material: categoriaMaterial,
          ativo: true,
        },
        {
          onConflict: 'codigo_unidade,cd_produto',
        }
      )
      .select('id, cd_produto, ds_produto, codigo_unidade, categoria_material, ativo, criado_em, atualizado_em')
      .single();

    if (upsertError) {
      throw upsertError;
    }

    const nextItem = data as CmmExceptionItem;

    startTransition(() => {
      setCmmExceptionItems((current) => {
        const withoutCurrent = current.filter((item) => normalizarCodigoProduto(item.cd_produto) !== cdProduto);
        return [...withoutCurrent, nextItem].sort((left, right) => left.cd_produto.localeCompare(right.cd_produto));
      });
    });
  }

  async function removeCmmExceptionItem(id: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from('almox_excecoes_cmm_hmsa')
      .update({ ativo: false })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    startTransition(() => {
      setCmmExceptionItems((current) => current.filter((item) => item.id !== id));
    });
  }

  async function saveProcessItem(input: ProcessoSaveInput) {
    const supabase = getSupabaseClient();
    const codBionexo = normalizarCodBionexo(input.cod_bionexo);
    const cdProduto = normalizarCodigoProduto(input.cd_produto);
    const dsProduto = normalizarTextoProcesso(input.ds_produto);
    const numeroProcesso = String(input.numero_processo ?? '').trim();
    const totalParcelas = Math.min(Math.max(Number(input.total_parcelas) || 3, 1), PROCESSO_TOTAL_PARCELAS_MAX);
    const parcelasEntregues = normalizarParcelasEntregues(input.parcelas_entregues ?? [], totalParcelas);

    if (!codBionexo) {
      throw new Error('Informe o Cod. Bionexo do processo.');
    }

    if (!cdProduto || !dsProduto) {
      throw new Error('Localize um produto da base HMSA antes de salvar o processo.');
    }

    if (!numeroProcesso) {
      throw new Error('Informe o número do pedido.');
    }

    const payload = {
      categoria_material: input.categoria_material,
      cod_bionexo: codBionexo,
      cd_produto: cdProduto,
      ds_produto: dsProduto,
      numero_processo: numeroProcesso,
      edocs: String(input.edocs ?? '').trim(),
      marca: String(input.marca ?? '').trim(),
      tipo_processo: input.tipo_processo,
      fornecedor: String(input.fornecedor ?? '').trim(),
      data_resgate: input.data_resgate || null,
      total_parcelas: totalParcelas,
      parcelas_entregues: parcelasEntregues,
      critico: input.critico === true,
      ignorado: input.ignorado === true,
      ativo: true,
    };

    const query = input.id
      ? supabase
          .from('almox_processos_acompanhamento')
          .update(payload)
          .eq('id', input.id)
      : supabase.from('almox_processos_acompanhamento').insert(payload);

    const { data, error: saveError } = await query
      .select(
        'id, categoria_material, cod_bionexo, cd_produto, ds_produto, numero_processo, edocs, marca, tipo_processo, fornecedor, data_resgate, total_parcelas, parcelas_entregues, critico, ignorado, ativo, criado_em, atualizado_em'
      )
      .single();

    if (saveError) {
      throw saveError;
    }

    const nextItem = normalizarProcessoItem(data as ProcessoAcompanhamento);

    startTransition(() => {
      setProcessItems((current) => {
        const withoutCurrent = current.filter((item) => item.id !== nextItem.id);
        return ordenarProcessos([...withoutCurrent, nextItem]);
      });
    });
  }

  async function updateProcessParcelas(id: string, parcelasEntregues: boolean[]) {
    const supabase = getSupabaseClient();
    const currentItem = processItems.find((item) => item.id === id);

    if (!currentItem) {
      throw new Error('Processo não encontrado na lista atual.');
    }

    const normalized = normalizarParcelasEntregues(parcelasEntregues, currentItem.total_parcelas);
    const { error: updateError } = await supabase
      .from('almox_processos_acompanhamento')
      .update({ parcelas_entregues: normalized })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    startTransition(() => {
      setProcessItems((current) =>
        current.map((item) => (item.id === id ? { ...item, parcelas_entregues: normalized } : item))
      );
    });
  }

  async function setProcessIgnored(id: string, ignorado: boolean) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from('almox_processos_acompanhamento')
      .update({ ignorado })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    startTransition(() => {
      setProcessItems((current) => current.map((item) => (item.id === id ? { ...item, ignorado } : item)));
    });
  }

  async function deleteProcessItem(id: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from('almox_processos_acompanhamento')
      .update({ ativo: false })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    startTransition(() => {
      setProcessItems((current) => current.filter((item) => item.id !== id));
    });
  }

  useEffect(() => {
    mountedRef.current = true;

    const sessionLoaded = readSessionFlag(ALMOX_SESSION_KEY);
    const cached = readCachedValue<AlmoxBaseCache>(ALMOX_CACHE_KEY, ALMOX_CACHE_TTL_MS);
    const cachedConfig = readCachedValue<AlmoxConfigCache>(ALMOX_CONFIG_CACHE_KEY, ALMOX_CONFIG_CACHE_TTL_MS);
    const cachedProcesses = readCachedValue<AlmoxProcessCache>(ALMOX_PROCESS_CACHE_KEY, ALMOX_PROCESS_CACHE_TTL_MS);

    if (sessionLoaded && cached) {
      hasLoadedRef.current = true;
      startTransition(() => {
        setRows(cached.value.rows);
        setBlacklistItems(cached.value.blacklistItems);
        setCmmExceptionItems(cached.value.cmmExceptionItems ?? []);
      });
      setLastRefreshAt(new Date(cached.savedAt).toISOString());
      setLoading(false);

      if (cached.isFresh) {
        setUsingCachedData(false);
      } else {
        setUsingCachedData(true);
        void refresh();
      }
    } else {
      void refresh();
    }

    if (cachedProcesses) {
      processItemsLoadedRef.current = true;
      startTransition(() => {
        setProcessItems(cachedProcesses.value.processItems ?? []);
      });
    }

    if (cachedConfig) {
      startTransition(() => {
        setSystemConfig(normalizarConfiguracaoSistema(cachedConfig.value.config));
      });
      setSystemConfigUpdatedAt(cachedConfig.value.updatedAt);
      setSystemConfigLoading(false);

      if (!cachedConfig.isFresh) {
        void refreshSystemConfig();
      }
    } else {
      void refreshSystemConfig();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [refresh, refreshSystemConfig]);

  useEffect(() => {
    if (!pendingSync) {
      return;
    }

    const supabase = getSupabaseClient();
    let finished = false;

    const finishMonitoring = () => {
      if (!mountedRef.current || finished) {
        return;
      }

      finished = true;
      setPendingSync(null);
      setSyncingBase(false);
    };

    const handleStatusChange = async () => {
      if (finished || !mountedRef.current) {
        return;
      }

      try {
        const response = await fetch(`/api/siscore/sync?trackingId=${encodeURIComponent(pendingSync.trackingId)}`, {
          method: 'GET',
          credentials: 'include',
        });
        const data = await parseSyncResponse(response);
        const jobs = Array.isArray(data?.jobs) ? (data.jobs as SyncTrackedJob[]) : [];
        const status = typeof data?.status === 'string' ? data.status : 'queued';

        if (status === 'success') {
          removeCachedValue(ALMOX_CACHE_KEY);
          await refresh();
          if (!mountedRef.current || finished) {
            return;
          }

          setSyncError(null);
          const jobsIgnorados = jobs.filter(jobFoiIntegralmenteIgnorado).map(getSyncJobLabel);
          const mensagemSucessoBase =
            jobsIgnorados.length === jobs.length && jobs.length > 0
              ? 'Sincronizacao concluida sem mudancas nos dados importados.'
              : 'Base sincronizada com sucesso.';
          setSyncNotice(
            jobs.length > 0
              ? `${mensagemSucessoBase} ${descreverJobsSincronizacao(jobs)}.`
              : 'Base sincronizada com sucesso a partir do SISCORE.'
          );
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(ALMOX_SYNC_COMPLETED_EVENT));
          }
          finishMonitoring();
          return;
        }

        if (status === 'failed') {
          const erroDetalhado =
            jobs
              .filter((job) => job.status === 'failed')
              .map((job) => `${getSyncJobLabel(job)}: ${job.mensagemErro || 'Falha sem detalhe adicional.'}`)
              .join('\n') || 'Falha ao sincronizar a base do SISCORE.';
          setSyncError(erroDetalhado);
          setSyncNotice(null);
          finishMonitoring();
          return;
        }

        setSyncNotice(
          jobs.length > 0
            ? `Sincronizacao em andamento. ${descreverJobsSincronizacao(jobs)}.`
            : 'Sincronizacao em andamento no GitHub Actions.'
        );
      } catch {
        // Erro transitório — o próximo evento Realtime vai tentar novamente.
      }
    };

    // Timeout de segurança: para de monitorar se o Realtime não sinalizar em 10min.
    const timeoutId = setTimeout(() => {
      if (!finished) {
        setSyncNotice(
          'A sincronizacao continua em background no GitHub Actions. O site aguardou 10min e parou de monitorar automaticamente.'
        );
        finishMonitoring();
      }
    }, SYNC_STATUS_MAX_WAIT_MS);

    const channel = supabase
      .channel(`sync-tracking-${pendingSync.trackingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'almox',
          table: 'siscore_sync_execucao',
          filter: `tracking_id=eq.${pendingSync.trackingId}`,
        },
        () => {
          void handleStatusChange();
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === 'SUBSCRIBED') {
          // Verificação inicial para capturar eventos ocorridos antes da subscription.
          void handleStatusChange();
        }
      });

    return () => {
      finished = true;
      clearTimeout(timeoutId);
      void supabase.removeChannel(channel);
    };
  }, [pendingSync, refresh]);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }

    writeCachedValue<AlmoxBaseCache>(ALMOX_CACHE_KEY, {
      rows,
      blacklistItems,
      cmmExceptionItems,
    });
  }, [rows, blacklistItems, cmmExceptionItems]);

  useEffect(() => {
    if (!processItemsLoadedRef.current) {
      return;
    }

    writeCachedValue<AlmoxProcessCache>(ALMOX_PROCESS_CACHE_KEY, {
      processItems,
    });
  }, [processItems]);

  return (
    <AlmoxDataContext.Provider
      value={{
        dataset,
        loading,
        refreshing,
        syncingBase,
        lastRefreshAt,
        syncError,
        syncNotice,
        usingCachedData,
        error,
        warning,
        categoryFilter,
        setCategoryFilter,
        dashboardHospital,
        setDashboardHospital,
        blacklistItems,
        blacklistSummary,
        cmmExceptionItems,
        lowConsumptionCandidates,
        cmmExceptionSummary,
        processItems,
        processItemsLoading,
        processItemsError,
        refreshProcessItems,
        systemConfig,
        systemConfigLoading,
        systemConfigSaving,
        systemConfigError,
        systemConfigNotice,
        systemConfigUpdatedAt,
        refreshSystemConfig,
        saveSystemConfig,
        findHmsaProductNameByCode,
        findHmsaProductCategoryByCode,
        findHmsaProductByBionexoCode,
        lookupHmsaProductByBionexoCode,
        addBlacklistItem,
        removeBlacklistItem,
        addCmmExceptionItem,
        removeCmmExceptionItem,
        saveProcessItem,
        updateProcessParcelas,
        setProcessIgnored,
        deleteProcessItem,
        emailConfig,
        refresh,
        syncBase,
      }}>
      {children}
    </AlmoxDataContext.Provider>
  );
}

export function useAlmoxData() {
  const context = useContext(AlmoxDataContext);

  if (!context) {
    throw new Error('useAlmoxData deve ser usado dentro de AlmoxDataProvider.');
  }

  return context;
}
