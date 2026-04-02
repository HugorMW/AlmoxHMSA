import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';

import {
  AlmoxDataset,
  createEmptyDataset,
  EstoqueAtualRow,
  getEmailConfig,
  hydrateDataset,
} from './data';
import { readCachedValue, readSessionFlag, writeCachedValue, writeSessionFlag } from './cache';
import { BlacklistItem, CategoriaMaterial, EmailConfig, FiltroCategoriaMaterial } from './types';

const PAGE_SIZE = 1000;
const ALMOX_CACHE_KEY = 'almox:base:v1';
const ALMOX_SESSION_KEY = 'almox:base:session:v1';
const ALMOX_CACHE_TTL_MS = 5 * 60 * 1000;
const emailConfig = getEmailConfig();

type AlmoxDataContextValue = {
  dataset: AlmoxDataset;
  loading: boolean;
  refreshing: boolean;
  syncingBase: boolean;
  syncError: string | null;
  usingCachedData: boolean;
  error: string | null;
  categoryFilter: FiltroCategoriaMaterial;
  setCategoryFilter: (nextFilter: FiltroCategoriaMaterial) => void;
  blacklistItems: BlacklistItem[];
  blacklistSummary: {
    hospitalar: number;
    farmacologico: number;
  };
  findHmsaProductNameByCode: (cdProduto: string) => string | null;
  addBlacklistItem: (input: { cd_produto: string; ds_produto?: string }) => Promise<void>;
  removeBlacklistItem: (id: string) => Promise<void>;
  emailConfig: EmailConfig;
  refresh: () => Promise<void>;
  syncBase: () => Promise<void>;
};

const AlmoxDataContext = createContext<AlmoxDataContextValue | null>(null);

async function loadEstoqueAtualRows() {
  const supabase = getSupabaseClient();
  const rows: EstoqueAtualRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('almox_estoque_atual')
      .select('*')
      .order('categoria_material', { ascending: true })
      .order('codigo_unidade', { ascending: true })
      .order('codigo_produto', { ascending: true })
      .range(start, end);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as EstoqueAtualRow[];
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
    throw error;
  }

  return (data ?? []) as BlacklistItem[];
}

function formatLoadError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Falha ao consultar a base do Supabase.';
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

function normalizeCategory(value: EstoqueAtualRow['categoria_material']): CategoriaMaterial {
  return value === 'material_farmacologico' ? 'material_farmacologico' : 'material_hospitalar';
}

function rowEhDoHmsa(row: EstoqueAtualRow) {
  const unidade = String(row.codigo_unidade ?? '').trim().toUpperCase();
  return unidade === 'HMSA' || unidade === 'HMSASOUL';
}

function normalizarCodigoProduto(value: string) {
  return String(value ?? '').trim();
}

type AlmoxBaseCache = {
  rows: EstoqueAtualRow[];
  blacklistItems: BlacklistItem[];
};

export function AlmoxDataProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<EstoqueAtualRow[]>([]);
  const [blacklistItems, setBlacklistItems] = useState<BlacklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingBase, setSyncingBase] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FiltroCategoriaMaterial>('todos');
  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);

  const dataset = useMemo<AlmoxDataset>(() => {
    const blacklistSet = new Set(blacklistItems.map((item) => normalizarCodigoProduto(item.cd_produto)));
    const visibleRows = rows.filter(
      (row) => !(rowEhDoHmsa(row) && blacklistSet.has(normalizarCodigoProduto(row.codigo_produto)))
    );

    const filteredRows =
      categoryFilter === 'todos'
        ? visibleRows
        : visibleRows.filter((row) => normalizeCategory(row.categoria_material) === categoryFilter);

    return filteredRows.length > 0 ? hydrateDataset(filteredRows) : createEmptyDataset();
  }, [rows, blacklistItems, categoryFilter]);

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

  async function refresh() {
    const isInitialLoad = !hasLoadedRef.current;

    if (!mountedRef.current) {
      return;
    }

    setError(null);

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [nextRows, nextBlacklistItems] = await Promise.all([loadEstoqueAtualRows(), loadBlacklistItems()]);

      if (!mountedRef.current) {
        return;
      }

      startTransition(() => {
        setRows(nextRows);
        setBlacklistItems(nextBlacklistItems);
      });
      setError(null);
      setUsingCachedData(false);
      hasLoadedRef.current = true;
      writeSessionFlag(ALMOX_SESSION_KEY);
    } catch (loadError) {
      if (!mountedRef.current) {
        return;
      }

      setError(formatLoadError(loadError));
    } finally {
      if (!mountedRef.current) {
        return;
      }

      setLoading(false);
      setRefreshing(false);
    }
  }

async function syncBase() {
    if (!mountedRef.current) {
      return;
    }

    setSyncingBase(true);
    setSyncError(null);

    try {
      const scopes = ['material_hospitalar', 'material_farmacologico', 'notas_fiscais'] as const;

      for (const scope of scopes) {
        const response = await fetch('/api/siscore/sync', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scope }),
        });

        await parseSyncResponse(response);
      }

      await refresh();
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
      if (mountedRef.current) {
        setSyncingBase(false);
      }
    }
  }

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

  useEffect(() => {
    mountedRef.current = true;

    const sessionLoaded = readSessionFlag(ALMOX_SESSION_KEY);
    const cached = readCachedValue<AlmoxBaseCache>(ALMOX_CACHE_KEY, ALMOX_CACHE_TTL_MS);
    if (sessionLoaded && cached) {
      hasLoadedRef.current = true;
      startTransition(() => {
        setRows(cached.value.rows);
        setBlacklistItems(cached.value.blacklistItems);
      });
      setUsingCachedData(true);
      setLoading(false);
    }

    void refresh();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }

    writeCachedValue<AlmoxBaseCache>(ALMOX_CACHE_KEY, {
      rows,
      blacklistItems,
    });
  }, [rows, blacklistItems]);

  return (
    <AlmoxDataContext.Provider
      value={{
        dataset,
        loading,
        refreshing,
        syncingBase,
        syncError,
        usingCachedData,
        error,
        categoryFilter,
        setCategoryFilter,
        blacklistItems,
        blacklistSummary,
        findHmsaProductNameByCode,
        addBlacklistItem,
        removeBlacklistItem,
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
